import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'node:readline';
import dotenv from 'dotenv';
import { store } from './server/store.ts';
import { crawlLiveSupplier, getSampleScrapedFeed } from './server/crawler.ts';
import { aiNormalizeAndCategorize } from './server/aiCategorizer.ts';
import { getRepoVerificationReport } from './server/verifyReport.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for interactive command-line questions with automatic non-interactive fallback
function askQuestion(query: string, defaultValue: string): Promise<string> {
  if (!process.stdin.isTTY) {
    console.log(`${query}${defaultValue} (auto-selected non-interactive)`);
    return Promise.resolve(defaultValue);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

// Interactive CLI Sync Runner
async function runCliSync() {
  console.log('===============================================================');
  console.log('   EKORA BAZAAR - STOCK VERIFICATION & CATALOG INTAKE ENGINE   ');
  console.log('===============================================================');

  // 1. Get website URL to crawl
  const cliUrlArg = process.argv.find((a) => a.startsWith('--url='));
  let targetUrl = cliUrlArg ? cliUrlArg.split('=')[1].trim() : '';

  if (!targetUrl) {
    const defaultUrl = 'https://jindeal.com/shop/';
    const inputUrl = await askQuestion(
      `? Enter website URL to crawl [Default: ${defaultUrl}] (or type 'web' for Dashboard): `,
      defaultUrl
    );

    if (inputUrl.toLowerCase() === 'web' || inputUrl.toLowerCase() === 'dashboard') {
      await launchWebServer();
      return;
    }

    targetUrl = inputUrl;
  }

  // 2. Get max pages to crawl
  const cliPagesArg = process.argv.find((a) => a.startsWith('--pages='));
  let maxPages = cliPagesArg ? parseInt(cliPagesArg.split('=')[1], 10) : 0;

  if (!maxPages || isNaN(maxPages)) {
    const defaultPages = 50;
    const inputPages = await askQuestion(
      `? Enter maximum pages to crawl [Default: ${defaultPages}]: `,
      defaultPages.toString()
    );
    maxPages = parseInt(inputPages, 10) || defaultPages;
  }

  console.log('---------------------------------------------------------------');
  console.log(`[Crawler] Target URL: ${targetUrl}`);
  console.log(`[Crawler] Max Pages:  ${maxPages}`);
  console.log(`[Crawler] Starting crawl, deduplication, O(1) matching, and live sync...`);
  console.log('---------------------------------------------------------------');

  const crawlResult = await crawlLiveSupplier(targetUrl, maxPages);

  console.log(`[Crawler] Scraped ${crawlResult.products.length} products.`);
  for (const log of crawlResult.logs) {
    console.log(`  ${log}`);
  }

  console.log(`[Sync] Running matching, stock updates, AI intake, and catalog sync...`);
  const { summary } = await store.processSyncBatch(crawlResult.products);

  console.log('===============================================================');
  console.log('SYNC EXECUTION SUMMARY:');
  console.log(`  Target Website Crawled:          ${targetUrl}`);
  console.log(`  Total Supplier Products Crawled: ${summary.totalCrawled}`);
  console.log(`  Store Products Matched:          ${summary.matchedCount}`);
  console.log(`  Newly Marked Out of Stock:       ${summary.updatedOosCount}`);
  console.log(`  Restocked Items Re-enabled:      ${summary.restockedCount}`);
  console.log(`  New Products Ingested (+40%):    ${summary.newlyAddedCount}`);
  console.log(`  Total Active Store Catalog Size: ${summary.totalCatalogSize}`);
  console.log(`  Currently Out of Stock on Site:  ${summary.outOfStockCatalogCount}`);
  console.log('===============================================================');
  console.log('Sync complete! Changes written to products.json & PostgreSQL.');
  process.exit(0);
}

// Web Server & API Launcher
async function launchWebServer() {
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
    try {
      let scrapedItems = [];
      let crawlLogs: string[] = [];

      if (mode === 'live') {
        const targetUrl = url || 'https://jindeal.com/shop/';
        const pagesToCrawl = Number(maxPages) || 50;
        const crawlResult = await crawlLiveSupplier(targetUrl, pagesToCrawl);
        crawlLogs = crawlResult.logs;
        scrapedItems = crawlResult.products;

        if (scrapedItems.length === 0) {
          crawlLogs.push('[Crawler] Live network request returned 0 items; falling back to verified sample batch.');
          scrapedItems = getSampleScrapedFeed();
        }
      } else {
        scrapedItems = getSampleScrapedFeed();
        crawlLogs.push(`[Crawler] Using curated sample batch of ${scrapedItems.length} real Jindeal products for instant verification.`);
      }

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

  // 5. Test AI Normalizer & Categorizer
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
    console.log(`[StockSync Server] Listening on http://localhost:${PORT}`);
  });
}

// Main execution switcher
async function main() {
  const isWebExplicit = process.argv.includes('--web') || process.argv.includes('-w');
  if (isWebExplicit) {
    await launchWebServer();
  } else {
    await runCliSync();
  }
}

main().catch((err) => {
  console.error('[StockSync] Fatal error:', err);
  process.exit(1);
});
