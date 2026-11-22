import prisma from './db.ts';
import { extractModelCode, cleanBrandPrefix, tokenSetSimilarity } from './matcher.ts';
import { isFragranceOilOrWax, classifyProduct, getCategoryMap } from './classifier.ts';

export interface GuardrailCheck {
  name: string;
  passed: boolean;
  metric: string;
  threshold: string;
  details?: string;
}

export interface DiffReport {
  runId: string;
  totalSupplierProducts: number;
  totalLiveProducts: number;
  matchedCount: number;
  unmatchedNewCount: number;
  excludedFragranceWaxCount: number;
  stagedChangesCount: number;
  stockChangesCount: number;
  priceChangesCount: number;
  newProductChangesCount: number;
  discontinuedChangesCount: number;
  reappearedChangesCount: number;
  guardrails: {
    passed: boolean;
    checks: GuardrailCheck[];
  };
}

/**
 * Matches an unlinked SupplierProduct to an existing Product in DB.
 */
async function matchSupplierToLiveProduct(sp: {
  id: string;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  handle: string | null;
}) {
  // 1. Match by SKU / Model Code in title or description
  const modelCode = sp.sku || extractModelCode(sp.title);
  if (modelCode) {
    const bySku = await prisma.product.findFirst({
      where: {
        OR: [
          { title: { contains: modelCode, mode: 'insensitive' } },
          { description: { contains: modelCode, mode: 'insensitive' } },
        ],
      },
    });
    if (bySku) {
      return { product: bySku, method: 'SKU' };
    }
  }

  // 2. Match by exact title (clean brand)
  const cleanTitle = cleanBrandPrefix(sp.title);
  const byExactTitle = await prisma.product.findFirst({
    where: {
      OR: [
        { title: { equals: sp.title, mode: 'insensitive' } },
        { title: { equals: cleanTitle, mode: 'insensitive' } },
      ],
    },
  });
  if (byExactTitle) {
    return { product: byExactTitle, method: 'TITLE_EXACT' };
  }

  return null;
}

/**
 * Runs the Diff Engine on a CrawlRun:
 * Diffs immutable SupplierProduct against live Product rows without modifying live rows.
 * Generates StagingChange rows and validates Circuit Breakers.
 */
export async function runDiffEngine(runId: string): Promise<DiffReport> {
  const crawlRun = await prisma.crawlRun.findUnique({
    where: { id: runId },
  });
  if (!crawlRun) {
    throw new Error(`CrawlRun ${runId} not found.`);
  }

  console.log(`[DiffEngine] Starting diff analysis for CrawlRun ${runId} (${crawlRun.supplierKey})...`);

  // 1. Fetch all supplier products for this supplier (excluding heavy rawPayload)
  const supplierProducts = await prisma.supplierProduct.findMany({
    where: { supplierKey: crawlRun.supplierKey },
    select: {
      id: true,
      supplierKey: true,
      externalProductId: true,
      externalVariantId: true,
      sku: true,
      title: true,
      variantTitle: true,
      handle: true,
      productType: true,
      tags: true,
      costPaise: true,
      available: true,
      contentHash: true,
      appliedHash: true,
      consecutiveMisses: true,
      supplierStatus: true,
      productId: true,
    },
  });

  const totalSupplierProducts = supplierProducts.length;

  // Fetch all live products once and build in-memory indexes for instantaneous matching
  console.log(`[DiffEngine] Indexing live products for high-speed in-memory matching...`);
  const liveProducts = await prisma.product.findMany({
    select: {
      id: true,
      title: true,
      price: true,
      stock: true,
      supplierAvailable: true,
      version: true,
      categoryId: true,
      lockedFields: true,
    },
  });
  const totalLiveProducts = liveProducts.length;

  const liveById = new Map<string, typeof liveProducts[0]>();
  const liveByModelCode = new Map<string, typeof liveProducts[0]>();
  const liveByCleanTitle = new Map<string, typeof liveProducts[0]>();

  for (const lp of liveProducts) {
    liveById.set(lp.id, lp);
    const code = extractModelCode(lp.title);
    if (code) {
      liveByModelCode.set(code.toUpperCase(), lp);
    }
    const clean = cleanBrandPrefix(lp.title).trim().toLowerCase();
    if (clean) {
      liveByCleanTitle.set(clean, lp);
    }
  }

  let matchedCount = 0;
  let unmatchedNewCount = 0;
  let excludedFragranceWaxCount = 0;
  let stockChangesCount = 0;
  let priceChangesCount = 0;
  let newProductChangesCount = 0;
  let discontinuedChangesCount = 0;
  let reappearedChangesCount = 0;

  const stagedChanges: any[] = [];
  const guardrailChecks: GuardrailCheck[] = [];
  const linkagesToPersist: Array<{ id: string; productId: string; matchMethod: string }> = [];
  const unmatchedList: typeof supplierProducts = [];

  // Pre-load categories for canonical foreign keys
  await getCategoryMap();

  // 2. Iterate supplier products and generate diffs in memory
  for (const sp of supplierProducts) {
    let liveProduct: any = null;

    if (sp.productId) {
      liveProduct = liveById.get(sp.productId);
    }

    if (!liveProduct) {
      // In-memory fast matching
      const modelCode = sp.sku || extractModelCode(sp.title);
      if (modelCode && liveByModelCode.has(modelCode.toUpperCase())) {
        liveProduct = liveByModelCode.get(modelCode.toUpperCase());
        linkagesToPersist.push({ id: sp.id, productId: liveProduct.id, matchMethod: 'SKU' });
      } else {
        const cleanTitle = cleanBrandPrefix(sp.title).trim().toLowerCase();
        if (cleanTitle && liveByCleanTitle.has(cleanTitle)) {
          liveProduct = liveByCleanTitle.get(cleanTitle);
          linkagesToPersist.push({ id: sp.id, productId: liveProduct.id, matchMethod: 'TITLE_EXACT' });
        }
      }
    }

    if (liveProduct) {
      matchedCount++;

      // Check if supplier content has changed since last applied
      const isContentChanged = sp.contentHash !== sp.appliedHash;

      // Check Stock change
      const currentLiveAvailable = liveProduct.supplierAvailable ?? (liveProduct.stock > 0);
      const isStockDifferent = sp.available !== currentLiveAvailable;

      if (isStockDifferent) {
        stockChangesCount++;
        const dedupeKey = `${sp.supplierKey}:${sp.externalProductId}:${sp.externalVariantId}:STOCK_CHANGED:${sp.contentHash}`;
        stagedChanges.push({
          runId,
          dedupeKey,
          changeType: 'STOCK_CHANGED',
          supplierKey: sp.supplierKey,
          externalProductId: sp.externalProductId,
          externalVariantId: sp.externalVariantId,
          suggestedTitle: liveProduct.title,
          categoryId: liveProduct.categoryId,
          suggestedPrice: Math.round(liveProduct.price * 100),
          originalCost: sp.costPaise || 0,
          targetProductId: liveProduct.id,
          before: {
            supplierAvailable: liveProduct.supplierAvailable,
            stock: liveProduct.stock,
            version: liveProduct.version,
          },
          after: {
            supplierAvailable: sp.available,
            stock: sp.available ? (liveProduct.stock <= 0 ? 50 : liveProduct.stock) : 0,
          },
          status: 'PENDING',
        });
      }

      // Check Price change (cost Paise changed by > 2%)
      if (sp.costPaise && sp.costPaise > 0) {
        const livePricePaise = Math.round(liveProduct.price * 100);
        const expectedRetailPaise = Math.round(sp.costPaise * 1.4);
        const priceDiffPct = Math.abs(expectedRetailPaise - livePricePaise) / (livePricePaise || 1);

        if (priceDiffPct > 0.05 && isContentChanged) {
          priceChangesCount++;
          const dedupeKey = `${sp.supplierKey}:${sp.externalProductId}:${sp.externalVariantId}:PRICE_CHANGED:${sp.contentHash}`;
          stagedChanges.push({
            runId,
            dedupeKey,
            changeType: 'PRICE_CHANGED',
            supplierKey: sp.supplierKey,
            externalProductId: sp.externalProductId,
            externalVariantId: sp.externalVariantId,
            suggestedTitle: liveProduct.title,
            categoryId: liveProduct.categoryId,
            suggestedPrice: expectedRetailPaise,
            originalCost: sp.costPaise,
            targetProductId: liveProduct.id,
            before: {
              price: liveProduct.price,
              version: liveProduct.version,
            },
            after: {
              price: Math.round(expectedRetailPaise / 100),
            },
            status: 'PENDING',
          });
        }
      }

      // Check Discontinued / Reappeared
      if (sp.supplierStatus === 'DISCONTINUED' && currentLiveAvailable) {
        discontinuedChangesCount++;
        const dedupeKey = `${sp.supplierKey}:${sp.externalProductId}:${sp.externalVariantId}:DISCONTINUED:${sp.contentHash}`;
        stagedChanges.push({
          runId,
          dedupeKey,
          changeType: 'DISCONTINUED',
          supplierKey: sp.supplierKey,
          externalProductId: sp.externalProductId,
          externalVariantId: sp.externalVariantId,
          suggestedTitle: liveProduct.title,
          categoryId: liveProduct.categoryId,
          suggestedPrice: Math.round(liveProduct.price * 100),
          originalCost: sp.costPaise || 0,
          targetProductId: liveProduct.id,
          before: {
            supplierAvailable: liveProduct.supplierAvailable,
            stock: liveProduct.stock,
            version: liveProduct.version,
          },
          after: {
            supplierAvailable: false,
            stock: 0,
          },
          status: 'PENDING',
        });
      }
    } else {
      // Collect unmatched supplier products to group variants under parent products
      unmatchedList.push(sp);
    }
  }

  // 2b. Process unmatched products grouped by externalProductId
  const unmatchedByParent = new Map<string, typeof supplierProducts>();
  for (const sp of unmatchedList) {
    const parentKey = `${sp.supplierKey}:${sp.externalProductId}`;
    const group = unmatchedByParent.get(parentKey) || [];
    group.push(sp);
    unmatchedByParent.set(parentKey, group);
  }

  for (const [parentKey, group] of unmatchedByParent.entries()) {
    unmatchedNewCount += group.length;
    const firstSp = group[0];

    // USER CONSTRAINT: "dont add any new fragrance oil or wax"
    const isForbidden = isFragranceOilOrWax({
      title: firstSp.title,
      handle: firstSp.handle,
      tags: firstSp.tags,
      productType: firstSp.productType,
    });

    if (isForbidden) {
      excludedFragranceWaxCount += group.length;
      continue;
    }

    // Classify into canonical 38 categories
    const classification = await classifyProduct({
      title: firstSp.title,
      handle: firstSp.handle,
      tags: firstSp.tags,
      productType: firstSp.productType,
    });

    // Check if variations are pack sizes (e.g. 5, 10, Pack of 5, Set of 10)
    const isPackSize = (str?: string | null): number | null => {
      if (!str) return null;
      const m = str.trim().match(/^(?:pack\s*(?:of)?\s*|set\s*(?:of)?\s*)?(\d+)(?:\s*(?:pcs|pieces|units|packs?|pack))?$/i);
      if (m) {
        const qty = parseInt(m[1], 10);
        if (qty > 1 && qty <= 1000) return qty;
      }
      return null;
    };

    const hasPackVariants = group.length > 1 && group.some((item) => isPackSize(item.variantTitle));

    let generatedWholesaleTiers: any[] = [];
    let variants: any[] = [];

    const baseCostPaise = Math.min(...group.map((item) => item.costPaise || 15000));
    const basePriceRupees = Math.round((baseCostPaise / 100) * 1.4);

    if (hasPackVariants) {
      // Map pack size variations to wholesale tiers on the parent product
      const sortedByQty = [...group].sort((a, b) => {
        const qA = isPackSize(a.variantTitle) || 1;
        const qB = isPackSize(b.variantTitle) || 1;
        return qA - qB;
      });

      generatedWholesaleTiers = sortedByQty.map((item) => {
        const qty = isPackSize(item.variantTitle) || 1;
        const packCost = item.costPaise || baseCostPaise * qty;
        const unitSellingPrice = Math.round((packCost / 100 / qty) * 1.4);
        const discountPct = qty >= 10 ? 15 : qty >= 5 ? 10 : 0;
        return {
          minQty: qty,
          maxQty: qty * 2,
          price: unitSellingPrice,
          discountPct,
        };
      });
    } else if (group.length > 1) {
      // True multi-variant product (e.g. 36 colors/sizes) -> map to variants JSON
      variants = group.map((item) => {
        const cost = item.costPaise || baseCostPaise;
        const vPrice = Math.round((cost / 100) * 1.4);
        return {
          id: `${item.externalProductId}-${item.externalVariantId}`,
          title: item.variantTitle || 'Default',
          sku: item.sku,
          pricePaise: cost,
          price: vPrice,
          available: item.available,
          imageUrl: (item as any).rawPayload?.variant?.featured_image?.src || (item as any).rawPayload?.product?.images?.[0]?.src || null,
          tiers: [
            { minQty: 1, maxQty: 9, price: vPrice, discountPct: 0 },
            { minQty: 10, maxQty: 49, price: Math.round(vPrice * 0.95), discountPct: 5 },
            { minQty: 50, maxQty: null, price: Math.round(vPrice * 0.9), discountPct: 10 },
          ],
        };
      });
    }

    const cleanTitle = cleanBrandPrefix(firstSp.title);
    newProductChangesCount++;
    const dedupeKey = `${firstSp.supplierKey}:${firstSp.externalProductId}:NEW:${firstSp.contentHash}`;

    stagedChanges.push({
      runId,
      dedupeKey,
      changeType: 'NEW',
      supplierKey: firstSp.supplierKey,
      externalProductId: firstSp.externalProductId,
      externalVariantId: firstSp.externalVariantId,
      suggestedTitle: cleanTitle,
      categoryId: classification.categoryId,
      classificationConfidence: classification.confidence,
      classificationStatus: classification.status,
      suggestedPrice: Math.round(baseCostPaise * 1.4),
      originalCost: baseCostPaise,
      targetProductId: null,
      before: null,
      after: {
        title: cleanTitle,
        categoryName: classification.categoryName,
        categorySlug: classification.categorySlug,
        categoryId: classification.categoryId,
        priceRupees: basePriceRupees,
        costPaise: baseCostPaise,
        supplierAvailable: group.some((item) => item.available),
        sku: firstSp.sku,
        handle: firstSp.handle,
        variants,
        wholesaleTiers: generatedWholesaleTiers.length > 0 ? generatedWholesaleTiers : undefined,
        rawPayload: (firstSp as any).rawPayload,
        allVariantIds: group.map((item) => item.externalVariantId),
      },
      status: 'PENDING',
    });
  }

  // 3. Persist new linkages & staging changes to DB in bulk
  if (linkagesToPersist.length > 0) {
    console.log(`[DiffEngine] Saving ${linkagesToPersist.length} matched linkages...`);
    for (let i = 0; i < linkagesToPersist.length; i += 25) {
      const chunk = linkagesToPersist.slice(i, i + 25);
      await Promise.all(
        chunk.map((l) =>
          prisma.supplierProduct.update({
            where: { id: l.id },
            data: { productId: l.productId, matchMethod: l.matchMethod },
          })
        )
      );
    }
  }

  console.log(`[DiffEngine] Persisting ${stagedChanges.length} staged changes to DB in bulk...`);
  if (stagedChanges.length > 0) {
    await prisma.stagingChange.deleteMany({
      where: {
        runId,
        status: 'PENDING',
      },
    });
    for (let i = 0; i < stagedChanges.length; i += 250) {
      const chunk = stagedChanges.slice(i, i + 250);
      await prisma.stagingChange.createMany({
        data: chunk,
        skipDuplicates: true,
      });
    }
  }

  // 4. Circuit Breakers / Guardrails Evaluation
  console.log(`[DiffEngine] Evaluating Circuit Breakers...`);

  // Guardrail 1: Mass stock flip limit (> 5% of matched products)
  const stockFlipPct = matchedCount > 0 ? (stockChangesCount / matchedCount) * 100 : 0;
  const stockFlipPassed = stockFlipPct <= 5.0;
  guardrailChecks.push({
    name: 'Mass Stock Flip Check',
    passed: stockFlipPassed,
    metric: `${stockFlipPct.toFixed(2)}% (${stockChangesCount}/${matchedCount})`,
    threshold: '<= 5.0%',
    details: stockFlipPassed
      ? 'Stock changes within safe operational tolerance.'
      : 'HALTED: Abnormal number of products flipped stock state. Possible supplier feed glitch.',
  });

  // Guardrail 2: Mass price change limit (> 2% of matched products change by > 30%)
  const priceChangePct = matchedCount > 0 ? (priceChangesCount / matchedCount) * 100 : 0;
  const priceChangePassed = priceChangePct <= 2.0;
  guardrailChecks.push({
    name: 'Mass Price Shift Check',
    passed: priceChangePassed,
    metric: `${priceChangePct.toFixed(2)}% (${priceChangesCount}/${matchedCount})`,
    threshold: '<= 2.0%',
    details: priceChangePassed
      ? 'Price shifts within normal wholesale bounds.'
      : 'HALTED: High volume of extreme wholesale price movements.',
  });

  // Guardrail 3: Supplier catalog disappearance check (> 10% missing)
  const missingCount = crawlRun.stats && typeof (crawlRun.stats as any).unseenItemsCount === 'number'
    ? (crawlRun.stats as any).unseenItemsCount
    : 0;
  const missingPct = totalSupplierProducts > 0 ? (missingCount / totalSupplierProducts) * 100 : 0;
  const disappearancePassed = missingPct <= 10.0;
  guardrailChecks.push({
    name: 'Supplier Disappearance Check',
    passed: disappearancePassed,
    metric: `${missingPct.toFixed(2)}% (${missingCount}/${totalSupplierProducts})`,
    threshold: '<= 10.0%',
    details: disappearancePassed
      ? 'Catalog continuity intact.'
      : 'HALTED: Excessive number of items disappeared from supplier feed.',
  });

  // Guardrail 4: Minimum crawl yield
  const yieldPassed = totalSupplierProducts >= 10;
  guardrailChecks.push({
    name: 'Minimum Crawl Yield Check',
    passed: yieldPassed,
    metric: `${totalSupplierProducts} products`,
    threshold: '>= 10 products',
    details: yieldPassed
      ? 'Crawl yield sufficient.'
      : 'HALTED: Supplier returned virtually empty catalog.',
  });

  const allGuardrailsPassed = guardrailChecks.every((c) => c.passed);

  // Update CrawlRun status and guardrail report
  const finalStatus = allGuardrailsPassed ? 'CRAWLED' : 'HALTED_GUARDRAIL';
  await prisma.crawlRun.update({
    where: { id: runId },
    data: {
      status: finalStatus,
      guardrailReport: {
        passed: allGuardrailsPassed,
        evaluatedAt: new Date().toISOString(),
        checks: guardrailChecks,
      } as any,
      stats: {
        totalSupplierProducts,
        totalLiveProducts,
        matchedCount,
        unmatchedNewCount,
        excludedFragranceWaxCount,
        stockChangesCount,
        priceChangesCount,
        newProductChangesCount,
        discontinuedChangesCount,
        reappearedChangesCount,
      } as any,
    },
  });

  console.log(
    `[DiffEngine] Run ${runId} diff complete: ${stagedChanges.length} changes staged. Guardrails: ${
      allGuardrailsPassed ? 'PASSED (Status: CRAWLED)' : 'TRIPPED (Status: HALTED_GUARDRAIL)'
    }`
  );

  return {
    runId,
    totalSupplierProducts,
    totalLiveProducts,
    matchedCount,
    unmatchedNewCount,
    excludedFragranceWaxCount,
    stagedChangesCount: stagedChanges.length,
    stockChangesCount,
    priceChangesCount,
    newProductChangesCount,
    discontinuedChangesCount,
    reappearedChangesCount,
    guardrails: {
      passed: allGuardrailsPassed,
      checks: guardrailChecks,
    },
  };
}
