import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { store } from './server/store.ts';
import { crawlLiveSupplier, getSampleScrapedFeed } from './server/crawler.ts';
import { aiNormalizeAndCategorize } from './server/aiCategorizer.ts';
import { getRepoVerificationReport } from './server/verifyReport.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Direct CLI sync execution support (e.g. `npm run sync` or `tsx server.ts --sync`)
async function runCliSync() {
  const isSync = process.argv.includes('--sync') || process.argv.includes('--run-now');
  if (!isSync) return false;

  console.log('===============================================================');
  console.log('   EKORA BAZAAR - STOCK VERIFICATION & CATALOG INTAKE SYNC');
  console.log('===============================================================');

  const maxPagesArg = process.argv.find(a => a.startsWith('--pages='));
  const maxPages = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : 50;

  console.log(`[CLI Sync] Initiating crawl of https://jindeal.com/shop/ (up to ${maxPages} pages)...`);
  const crawlResult = await crawlLiveSupplier('https://jindeal.com/shop/', maxPages);

  console.log(`[CLI Sync] Scraped ${crawlResult.products.length} products from Jindeal.`);
  for (const log of crawlResult.logs) {
    console.log(`  ${log}`);
  }

  console.log(`[CLI Sync] Running matching, stock updates, AI intake, and catalog sync...`);
  const { summary } = await store.processSyncBatch(crawlResult.products);

  console.log('---------------------------------------------------------------');
  console.log('SYNC EXECUTION SUMMARY:');
  console.log(`  Total Supplier Products Crawled: ${summary.totalCrawled}`);
  console.log(`  Store Products Matched:          ${summary.matchedCount}`);
  console.log(`  Newly Marked Out of Stock:       ${summary.updatedOosCount}`);
  console.log(`  Restocked Items Re-enabled:      ${summary.restockedCount}`);
  console.log(`  New Products Ingested (+40%):    ${summary.newlyAddedCount}`);
  console.log(`  Total Active Store Catalog Size: ${summary.totalCatalogSize}`);
  console.log(`  Currently Out of Stock on Site:  ${summary.outOfStockCatalogCount}`);
  console.log('===============================================================');
  process.exit(0);
}

async function startServer() {
  if (await runCliSync()) return;

  const app = express();
  app.use(express.json());

  // 1. Get all products with optional filters
  app.get('/api/products', (req: Request, res: Response) => {
    const category = req.query.category as string | undefined;
    const inStockOnly = req.query.inStockOnly === 'true';
    const products = store.getProducts(category, inStockOnly);
    res.json({ products, summary: store.getSummary() });
  });

  // 2. Toggle product stock (for immediate interactive testing of Storefront UI)
  app.post('/api/products/:id/toggle-stock', async (req: Request, res: Response) => {
    const { id } = req.params;
    const updated = await store.toggleStock(id);
    if (!updated) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: updated, summary: store.getSummary() });
  });

  // 3. Trigger Crawl & Sync Pipeline
  app.post('/api/sync/crawl', async (req: Request, res: Response) => {
    const { mode, url, maxPages } = req.body;
    // mode: 'live' (hits jindeal.com) or 'sample' (instant sample feed)
    try {
      let scrapedItems = [];
      let crawlLogs: string[] = [];

      if (mode === 'live') {
        const targetUrl = url || 'https://jindeal.com/shop/';
        const pagesToCrawl = Number(maxPages) || 50;
        const crawlResult = await crawlLiveSupplier(targetUrl, pagesToCrawl);
        crawlLogs = crawlResult.logs;
        scrapedItems = crawlResult.products;

        // If live crawl returned 0 items due to transient network block, fall back to sample feed with warning
        if (scrapedItems.length === 0) {
          crawlLogs.push('[Crawler] Live network request returned 0 items; falling back to verified sample batch for synchronization.');
          scrapedItems = getSampleScrapedFeed();
        }
      } else {
        scrapedItems = getSampleScrapedFeed();
        crawlLogs.push(`[Crawler] Using curated sample batch of ${scrapedItems.length} real Jindeal products for instant verification.`);
      }

      // Execute sync pipeline
      const { auditItems, summary } = await store.processSyncBatch(scrapedItems);

      res.json({
        success: true,
        scrapedCount: scrapedItems.length,
        crawlLogs,
        auditItems,
        summary,
        products: store.getProducts(),
      });
    } catch (err: any) {
      console.error('[API /api/sync/crawl] Error:', err);
      res.status(500).json({ error: err.message || 'Sync failed' });
    }
  });

  // 4. Get Sync Summary & History
  app.get('/api/sync/summary', (_req: Request, res: Response) => {
    res.json({ summary: store.getSummary(), logs: store.getAuditLogs() });
  });

  // 5. Test AI Normalizer & Categorizer on any raw title
  app.post('/api/ai/test-normalize', async (req: Request, res: Response) => {
    const { rawTitle, rawPrice } = req.body;
    if (!rawTitle) {
      return res.status(400).json({ error: 'rawTitle is required' });
    }

    try {
      const price = Number(rawPrice) || 150;
      const result = await aiNormalizeAndCategorize(rawTitle, price);
      const calculatedPrice = Math.round(price * 1.4);
      const profit = calculatedPrice - price;

      res.json({
        rawTitle,
        originalRetailPrice: price,
        normalizedTitle: result.normalizedTitle,
        category: result.category,
        description: result.description,
        features: result.features,
        tags: result.tags,
        calculatedPrice,
        profitMargin: 40,
        profitAmount: profit,
        isAiGenerated: result.isAiGenerated,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Get GitHub Repository Verification Report
  app.get('/api/verify-report', (_req: Request, res: Response) => {
    res.json(getRepoVerificationReport());
  });

  // 7. Reset Catalog to Default
  app.post('/api/catalog/reset', (_req: Request, res: Response) => {
    store.resetCatalog();
    res.json({ success: true, products: store.getProducts(), summary: store.getSummary() });
  });

  // Setup Vite in Dev or static in Prod
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[StockSync Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[StockSync Server] Fatal error:', err);
  process.exit(1);
});
