import crypto from 'crypto';
import prisma from './db.ts';
import { cleanBrandPrefix, extractModelCode } from './matcher.ts';

export interface CrawlVaultOptions {
  supplierKey?: string;
  targetUrl?: string;
  maxPages?: number;
  resumeRunId?: string;
  mode?: 'DRY_RUN' | 'STOCK_ONLY' | 'FULL';
  batchDelayMs?: number;
}

export interface CrawlVaultProgress {
  runId: string;
  page: number;
  totalPagesScraped: number;
  variantsScraped: number;
  newSupplierVariants: number;
  updatedSupplierVariants: number;
  logs: string[];
}

function computeContentHash(data: {
  externalProductId: string;
  externalVariantId: string;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  costPaise: number | null;
  available: boolean;
}): string {
  const normalized = JSON.stringify({
    p: data.externalProductId,
    v: data.externalVariantId,
    s: data.sku || '',
    t: data.title.trim().toLowerCase(),
    vt: (data.variantTitle || '').trim().toLowerCase(),
    c: data.costPaise || 0,
    a: data.available,
  });
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Reaps abandoned runs whose heartbeat has expired (> 10 minutes).
 */
export async function reapStaleRuns(supplierKey: string): Promise<number> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const staleRuns = await prisma.crawlRun.updateMany({
    where: {
      supplierKey,
      status: 'RUNNING',
      heartbeatAt: {
        lt: tenMinutesAgo,
      },
    },
    data: {
      status: 'FAILED',
      error: 'Heartbeat timed out (> 10 minutes without update)',
      finishedAt: new Date(),
    },
  });
  if (staleRuns.count > 0) {
    console.warn(`[CrawlerVault] Reaped ${staleRuns.count} abandoned crawl run(s) for ${supplierKey}`);
  }
  return staleRuns.count;
}

/**
 * Executes a vault crawl against a Shopify supplier (e.g. Matin Impex).
 * Writes STRICTLY to SupplierProduct and CrawlRun. Live tables remain 100% untouched.
 */
export async function runVaultCrawl(
  options: CrawlVaultOptions = {},
  onProgress?: (p: CrawlVaultProgress) => void
) {
  const supplierKey = options.supplierKey || 'MATIN_IMPEX';
  const targetUrl = options.targetUrl || 'https://matinimpex.com/collections/all';
  const maxPages = options.maxPages || 50;
  const mode = options.mode || 'DRY_RUN';
  const delayMs = options.batchDelayMs ?? 250;
  const logs: string[] = [];

  const log = (msg: string) => {
    logs.push(msg);
    console.log(msg);
  };

  log(`[CrawlerVault] Initializing crawl for supplier "${supplierKey}" at ${targetUrl}`);

  // 1. Clean up stale abandoned runs
  await reapStaleRuns(supplierKey);

  // 2. Concurrency lock / Resume handling
  let crawlRun: any = null;
  let startPage = 1;

  if (options.resumeRunId) {
    crawlRun = await prisma.crawlRun.findUnique({
      where: { id: options.resumeRunId },
    });
    if (!crawlRun) {
      throw new Error(`CrawlRun with ID ${options.resumeRunId} not found.`);
    }
    if (crawlRun.status !== 'RUNNING' && crawlRun.status !== 'FAILED') {
      throw new Error(`Cannot resume CrawlRun in status ${crawlRun.status}.`);
    }
    const cursor = crawlRun.cursor as any;
    if (cursor && typeof cursor.page === 'number') {
      startPage = cursor.page + 1;
      log(`[CrawlerVault] Resuming crawl from page ${startPage} (CrawlRun ID: ${crawlRun.id})`);
    }
    // Update status to RUNNING
    crawlRun = await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: 'RUNNING',
        heartbeatAt: new Date(),
      },
    });
  } else {
    try {
      crawlRun = await prisma.crawlRun.create({
        data: {
          supplierKey,
          targetUrl,
          mode: mode as any,
          status: 'RUNNING',
          cursor: { page: 0 },
          seenCount: 0,
          heartbeatAt: new Date(),
        },
      });
      log(`[CrawlerVault] Acquired lock. Started new CrawlRun: ${crawlRun.id}`);
    } catch (err: any) {
      if (err.code === 'P2002' || (err.message && err.message.includes('crawlrun_one_running'))) {
        throw new Error(
          `CRAWL BLOCKED: Another crawl is currently actively RUNNING for supplier "${supplierKey}". Please wait for it to complete or verify its status.`
        );
      }
      throw err;
    }
  }

  // Parse URL to resolve Shopify collection endpoint
  const urlObj = new URL(targetUrl);
  const origin = urlObj.origin;
  let collectionPath = urlObj.pathname.replace(/\/products\.json.*$/, '').replace(/\/$/, '');
  if (!collectionPath.startsWith('/collections/')) {
    collectionPath = '/collections/all';
  }
  const endpointBase = `${origin}${collectionPath}/products.json`;

  const seenSupplierProductIds = new Set<string>();
  let totalVariantsScraped = 0;
  let newSupplierVariants = 0;
  let updatedSupplierVariants = 0;

  try {
    for (let page = startPage; page <= maxPages; page++) {
      const pageUrl = `${endpointBase}?limit=250&page=${page}`;
      log(`[CrawlerVault] Fetching page ${page}/${maxPages} from ${pageUrl}`);

      let attempts = 0;
      let pageData: any = null;

      while (attempts < 3 && !pageData) {
        attempts++;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const res = await fetch(pageUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 EkoraBazaarSync/2.0',
              Accept: 'application/json',
            },
          });
          clearTimeout(timeout);

          if (res.status === 404) {
            log(`[CrawlerVault] Page ${page} returned 404: reached end of collection.`);
            pageData = { products: [] };
            break;
          }

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          pageData = await res.json();
        } catch (fetchErr: any) {
          log(`[CrawlerVault] Warning: Attempt ${attempts}/3 failed for page ${page}: ${fetchErr.message}`);
          if (attempts >= 3) {
            throw fetchErr;
          }
          await new Promise((r) => setTimeout(r, 1500 * attempts));
        }
      }

      const productsList = pageData?.products || [];
      if (productsList.length === 0) {
        log(`[CrawlerVault] Zero products returned on page ${page}. Ingestion complete.`);
        break;
      }

      // Extract all variants from products on this page
      const pageItems: Array<{
        externalProductId: string;
        externalVariantId: string;
        sku: string | null;
        title: string;
        variantTitle: string | null;
        handle: string | null;
        productType: string | null;
        tags: string[];
        costPaise: number;
        available: boolean;
        contentHash: string;
        rawPayload: any;
      }> = [];

      for (const p of productsList) {
        const extProdId = String(p.id);
        const variants = p.variants || [];
        const baseTitle = (p.title || '').trim();
        const handle = p.handle || null;
        const productType = p.product_type || null;
        const tags = Array.isArray(p.tags)
          ? p.tags
          : typeof p.tags === 'string'
          ? p.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : [];

        // Ensure we unpack EVERY variant (colors, sizes, MOQs)
        for (const v of variants) {
          const extVarId = String(v.id || '');
          const variantTitle = v.title && v.title !== 'Default Title' ? v.title.trim() : null;
          const sku = v.sku?.trim() || extractModelCode(`${baseTitle} ${variantTitle || ''}`) || null;
          const costPaise = Math.round(parseFloat(v.price || '0') * 100);
          const available = v.available !== false;

          const contentHash = computeContentHash({
            externalProductId: extProdId,
            externalVariantId: extVarId,
            sku,
            title: baseTitle,
            variantTitle,
            costPaise,
            available,
          });

          const rawPayload = {
            product: {
              id: p.id,
              title: p.title,
              handle: p.handle,
              product_type: p.product_type,
              tags: p.tags,
              images: p.images,
            },
            variant: v,
          };

          pageItems.push({
            externalProductId: extProdId,
            externalVariantId: extVarId,
            sku,
            title: baseTitle,
            variantTitle,
            handle,
            productType,
            tags,
            costPaise,
            available,
            contentHash,
            rawPayload,
          });
        }
      }

      totalVariantsScraped += pageItems.length;

      // Bulk lookup existing records for this page in 1 query
      const extProdIds = Array.from(new Set(pageItems.map((item) => item.externalProductId)));
      const existingRows = await prisma.supplierProduct.findMany({
        where: {
          supplierKey,
          externalProductId: { in: extProdIds },
        },
        select: {
          id: true,
          externalProductId: true,
          externalVariantId: true,
          contentHash: true,
        },
      });

      const existingMap = new Map<string, { id: string; contentHash: string }>();
      for (const row of existingRows) {
        existingMap.set(`${row.externalProductId}:${row.externalVariantId}`, {
          id: row.id,
          contentHash: row.contentHash,
        });
      }

      const toInsert: any[] = [];
      const unchangedIds: string[] = [];
      const toUpdate: Array<{ id: string; data: any }> = [];

      for (const item of pageItems) {
        const key = `${item.externalProductId}:${item.externalVariantId}`;
        const existing = existingMap.get(key);

        if (!existing) {
          toInsert.push({
            supplierKey,
            externalProductId: item.externalProductId,
            externalVariantId: item.externalVariantId,
            sku: item.sku,
            title: item.title,
            variantTitle: item.variantTitle,
            handle: item.handle,
            productType: item.productType,
            tags: item.tags,
            costPaise: item.costPaise,
            available: item.available,
            rawPayload: item.rawPayload,
            contentHash: item.contentHash,
            consecutiveMisses: 0,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            lastCrawlRunId: crawlRun.id,
            supplierStatus: item.available ? 'ACTIVE' : 'OUT_OF_STOCK',
          });
        } else if (existing.contentHash === item.contentHash) {
          unchangedIds.push(existing.id);
          seenSupplierProductIds.add(existing.id);
        } else {
          toUpdate.push({
            id: existing.id,
            data: {
              sku: item.sku,
              title: item.title,
              variantTitle: item.variantTitle,
              handle: item.handle,
              productType: item.productType,
              tags: item.tags,
              costPaise: item.costPaise,
              available: item.available,
              rawPayload: item.rawPayload,
              contentHash: item.contentHash,
              consecutiveMisses: 0,
              lastSeenAt: new Date(),
              lastCrawlRunId: crawlRun.id,
              supplierStatus: item.available ? 'ACTIVE' : 'OUT_OF_STOCK',
            },
          });
          seenSupplierProductIds.add(existing.id);
        }
      }

      // Execute bulk insert for new variants
      if (toInsert.length > 0) {
        await prisma.supplierProduct.createMany({
          data: toInsert,
          skipDuplicates: true,
        });
        newSupplierVariants += toInsert.length;

        // Fetch inserted IDs to add to seen set
        const inserted = await prisma.supplierProduct.findMany({
          where: {
            supplierKey,
            lastCrawlRunId: crawlRun.id,
          },
          select: { id: true },
        });
        for (const row of inserted) {
          seenSupplierProductIds.add(row.id);
        }
      }

      // Execute bulk update for unchanged variants (touch lastSeenAt & reset misses)
      if (unchangedIds.length > 0) {
        await prisma.supplierProduct.updateMany({
          where: { id: { in: unchangedIds } },
          data: {
            consecutiveMisses: 0,
            lastSeenAt: new Date(),
            lastCrawlRunId: crawlRun.id,
          },
        });
      }

      // Update changed variants
      if (toUpdate.length > 0) {
        for (const item of toUpdate) {
          await prisma.supplierProduct.update({
            where: { id: item.id },
            data: item.data,
          });
          updatedSupplierVariants++;
        }
      }

      log(
        `[CrawlerVault] Page ${page}/${maxPages} processed: ${pageItems.length} variants (+${toInsert.length} new, ~${toUpdate.length} updated, =${unchangedIds.length} unchanged).`
      );

      // Checkpoint progress and update heartbeat
      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: {
          cursor: { page, lastProductCount: productsList.length },
          seenCount: totalVariantsScraped,
          heartbeatAt: new Date(),
        },
      });

      if (onProgress) {
        onProgress({
          runId: crawlRun.id,
          page,
          totalPagesScraped: page,
          variantsScraped: totalVariantsScraped,
          newSupplierVariants,
          updatedSupplierVariants,
          logs,
        });
      }

      // Polite delay between pages
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    // 3. Mark absence & enforce "discontinued needs 2 consecutive misses"
    log(`[CrawlerVault] Crawl pages completed. Checking for missing items to enforce 2-misses rule...`);

    const missingSupplierProducts = await prisma.supplierProduct.findMany({
      where: {
        supplierKey,
        id: {
          notIn: Array.from(seenSupplierProductIds),
        },
      },
      select: {
        id: true,
        consecutiveMisses: true,
      },
    });

    log(`[CrawlerVault] Found ${missingSupplierProducts.length} items not seen in this run.`);

    if (missingSupplierProducts.length > 0) {
      const missingIds = missingSupplierProducts.map((m) => m.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "SupplierProduct"
         SET "consecutiveMisses" = "consecutiveMisses" + 1
         WHERE "supplierKey" = $1 AND "id" = ANY($2::text[])`,
        supplierKey,
        missingIds
      );

      await prisma.supplierProduct.updateMany({
        where: {
          supplierKey,
          consecutiveMisses: { gte: 2 },
        },
        data: {
          supplierStatus: 'DISCONTINUED',
        },
      });
    }

    // 4. Mark CrawlRun as CRAWLED (immutable mirror fully captured)
    const finalizedRun = await prisma.crawlRun.update({
      where: { id: crawlRun.id },
      data: {
        status: 'CRAWLED',
        finishedAt: new Date(),
        seenCount: totalVariantsScraped,
        stats: {
          totalVariantsScraped,
          newSupplierVariants,
          updatedSupplierVariants,
          unseenItemsCount: missingSupplierProducts.length,
        },
      },
    });

    log(
      `[CrawlerVault] Run ${crawlRun.id} completed successfully. ${totalVariantsScraped} variants mirrored safely in vault.`
    );

    return {
      success: true,
      crawlRun: finalizedRun,
      totalVariantsScraped,
      newSupplierVariants,
      updatedSupplierVariants,
      missingCount: missingSupplierProducts.length,
      logs,
    };
  } catch (err: any) {
    log(`[CrawlerVault] ERROR during crawl: ${err.message}`);
    if (crawlRun?.id) {
      await prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: {
          status: 'FAILED',
          error: err.message,
          finishedAt: new Date(),
        },
      });
    }
    throw err;
  }
}
