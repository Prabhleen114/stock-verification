import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'node:readline';
import dotenv from 'dotenv';
import prisma from './server/db.ts';
import { store } from './server/store.ts';
import { crawlLiveSupplier, getSampleScrapedFeed } from './server/crawler.ts';
import { aiNormalizeAndCategorize } from './server/aiCategorizer.ts';
import { getRepoVerificationReport } from './server/verifyReport.ts';
import { runVaultCrawl } from './server/crawlerVault.ts';
import { runDiffEngine } from './server/diffEngine.ts';
import { applyCrawlRun, revertCrawlRun } from './server/applyEngine.ts';
import { exportCatalogJson } from '../scripts/export-catalog-json.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'fs';
dotenv.config();
const rootEnvPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

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

// Interactive & Automated Enterprise CLI Runner
async function runCliSync() {
  console.log('========================================================================');
  console.log('   EKORA BAZAAR - ENTERPRISE CRAWL VAULT & STOCK VERIFICATION ENGINE   ');
  console.log('========================================================================');

  // Check for rollback argument: --revert=RUN_ID
  const revertArg = process.argv.find((a) => a.startsWith('--revert='));
  if (revertArg) {
    const runId = revertArg.split('=')[1].trim();
    console.log(`[Rollback] Requesting 1-click rollback for CrawlRun ID: ${runId}`);
    const result = await revertCrawlRun(runId);
    console.log(`[Rollback] Result: Reverted ${result.revertedCount} database changes.`);
    console.log(`[Rollback] Exported ${result.exportedProductsCount} products back to products.json.`);
    process.exit(0);
  }

  // 1. Get website URL to crawl (Default: Matin Impex)
  const cliUrlArg = process.argv.find((a) => a.startsWith('--url='));
  let targetUrl = cliUrlArg ? cliUrlArg.split('=')[1].trim() : '';

  if (!targetUrl) {
    const defaultUrl = 'https://matinimpex.com/collections/all';
    const inputUrl = await askQuestion(
      `? Enter supplier URL to crawl [Default: ${defaultUrl}] (or type 'web' for Dashboard): `,
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
    const defaultPages = 20;
    const inputPages = await askQuestion(
      `? Enter maximum pages to crawl [Default: ${defaultPages}]: `,
      defaultPages.toString()
    );
    maxPages = parseInt(inputPages, 10) || defaultPages;
  }

  // 3. Execution Mode: DRY_RUN | STOCK_ONLY | FULL
  const cliModeArg = process.argv.find((a) => a.startsWith('--mode='));
  let mode: 'DRY_RUN' | 'STOCK_ONLY' | 'FULL' = 'DRY_RUN';
  if (cliModeArg) {
    const m = cliModeArg.split('=')[1].trim().toUpperCase();
    if (m === 'STOCK_ONLY' || m === 'FULL') {
      mode = m;
    }
  }

  const shouldApply = process.argv.includes('--apply');

  console.log('------------------------------------------------------------------------');
  console.log(`[Pipeline] Supplier Key:     MATIN_IMPEX`);
  console.log(`[Pipeline] Target Endpoint:  ${targetUrl}`);
  console.log(`[Pipeline] Max Pages:        ${maxPages}`);
  console.log(`[Pipeline] Mode:             ${mode}`);
  console.log(`[Pipeline] Auto-Apply Flag:  ${shouldApply}`);
  console.log('------------------------------------------------------------------------');

  const runIdArg = process.argv.find((a) => a.startsWith('--run-id=') || a.startsWith('--diff-only='));
  let runId = runIdArg ? runIdArg.split('=')[1].trim() : '';

  if (!runId) {
    // STEP 1: Vault Crawl (writes strictly to SupplierProduct & CrawlRun)
    console.log('\n>>> STAGE 1: Checkpointed Vault Ingestion (Immutable Mirror)...');
    const crawlResult = await runVaultCrawl({
      supplierKey: 'MATIN_IMPEX',
      targetUrl,
      maxPages,
      mode,
    });
    runId = crawlResult.crawlRun.id;
    console.log(`[Stage 1 Done] Mirrored ${crawlResult.totalVariantsScraped} variants. Run ID: ${runId}`);
  } else {
    console.log(`\n>>> Skipping Stage 1 crawl: using existing CrawlRun ID: ${runId}`);
  }

  // STEP 2: Diff Engine & Guardrails Evaluation
  console.log('\n>>> STAGE 2: Diff Engine & Circuit Breakers Validation...');
  const diffReport = await runDiffEngine(runId);

  console.log('------------------------------------------------------------------------');
  console.log('DIFF ENGINE SUMMARY:');
  console.log(`  Total Supplier Variants Mirrored:  ${diffReport.totalSupplierProducts}`);
  console.log(`  Live Store Products Matched:       ${diffReport.matchedCount}`);
  console.log(`  Stock Flips Detected:              ${diffReport.stockChangesCount}`);
  console.log(`  Wholesale Price Shifts:            ${diffReport.priceChangesCount}`);
  console.log(`  New Products Staged (Pending):     ${diffReport.newProductChangesCount}`);
  console.log(`  Fragrance/Wax Excluded (User Rule):${diffReport.excludedFragranceWaxCount}`);
  console.log('------------------------------------------------------------------------');
  console.log('CIRCUIT BREAKER GUARDRAILS:');
  for (const check of diffReport.guardrails.checks) {
    const icon = check.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  [${icon}] ${check.name.padEnd(30)} Metric: ${check.metric.padEnd(20)} Max: ${check.threshold}`);
    if (!check.passed && check.details) {
      console.log(`         -> ${check.details}`);
    }
  }
  console.log('------------------------------------------------------------------------');

  const isStockOnly = mode === 'STOCK_ONLY';
  const relevantGuardrailsPassed = isStockOnly
    ? diffReport.guardrails.checks.filter((c) => c.name !== 'Mass Price Shift Check').every((c) => c.passed)
    : diffReport.guardrails.passed;

  if (!relevantGuardrailsPassed) {
    console.warn(`[CIRCUIT BREAKER TRIPPED] CrawlRun ${runId} was HALTED. Changes remain safely staged.`);
    console.warn('Live catalog remains completely untouched.');
    process.exit(0);
  } else if (!diffReport.guardrails.passed && isStockOnly) {
    console.log(
      `[Safety Guardrail Note] Mass Price Shift check was bypassed because mode is STOCK_ONLY (no prices will be touched).`
    );
  }

  // STEP 3: Apply Stage
  if (shouldApply) {
    console.log(`\n>>> STAGE 3: Safe Transactional Apply (Mode: ${mode})...`);
    const applyReport = await applyCrawlRun(runId, {
      mode: mode === 'FULL' ? 'FULL' : 'STOCK_ONLY',
      actor: 'SYSTEM_CLI_RUNNER',
    });

    console.log('========================================================================');
    console.log('APPLY EXECUTION REPORT:');
    console.log(`  Changes Applied:          ${applyReport.appliedCount}`);
    console.log(`  Conflicts Avoided:        ${applyReport.conflictCount}`);
    console.log(`  Locked Fields Preserved:  ${applyReport.skippedLockedCount}`);
    console.log(`  New Products Ingested:    ${applyReport.newProductsCreated}`);
    console.log(`  Audit Logs Recorded:      ${applyReport.auditLogsWritten}`);
    console.log(`  products.json Refreshed:  ${applyReport.catalogJsonExported} (${applyReport.exportedProductsCount} items)`);
    console.log('========================================================================');
    console.log(`CrawlRun ${runId} applied cleanly! Use --revert=${runId} at any time to rollback.`);
  } else {
    console.log(`\n[DRY RUN FINISHED] All ${diffReport.stagedChangesCount} proposed changes are staged in PostgreSQL.`);
    console.log(`To apply stock updates safely: npx tsx server.ts --mode=STOCK_ONLY --apply`);
  }

  process.exit(0);
}

// Web Server & API Launcher
async function launchWebServer() {
  const app = express();
  app.use(express.json());

  // 1. Vault: List recent Crawl Runs
  app.get('/api/vault/runs', async (_req: Request, res: Response) => {
    try {
      const runs = await prisma.crawlRun.findMany({
        take: 20,
        orderBy: { startedAt: 'desc' },
        include: {
          _count: {
            select: { stagingChanges: true, auditLogs: true },
          },
        },
      });
      res.json({ runs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Vault: Trigger Crawl & Diff
  app.post('/api/vault/crawl', async (req: Request, res: Response) => {
    try {
      const { url, maxPages, mode } = req.body;
      const targetUrl = url || 'https://matinimpex.com/collections/all';
      const pages = Number(maxPages) || 10;

      const crawlResult = await runVaultCrawl({
        supplierKey: 'MATIN_IMPEX',
        targetUrl,
        maxPages: pages,
        mode: mode || 'DRY_RUN',
      });

      const diffReport = await runDiffEngine(crawlResult.crawlRun.id);

      res.json({
        success: true,
        crawlRun: crawlResult.crawlRun,
        diffReport,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Vault: Get Diff & Staging changes for a run
  app.get('/api/vault/diff/:runId', async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const run = await prisma.crawlRun.findUnique({
        where: { id: runId },
        include: {
          stagingChanges: {
            take: 100,
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!run) return res.status(404).json({ error: 'Run not found' });
      res.json({ run });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Vault: Apply Staged Changes
  app.post('/api/vault/apply/:runId', async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const { mode, approvedChangeIds } = req.body;
      const report = await applyCrawlRun(runId, {
        mode: mode || 'STOCK_ONLY',
        approvedChangeIds,
        actor: 'ADMIN_DASHBOARD',
      });
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Vault: Revert Run (1-click Rollback)
  app.post('/api/vault/revert/:runId', async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const report = await revertCrawlRun(runId);
      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Products API
  app.get('/api/products', (req: Request, res: Response) => {
    const category = req.query.category as string | undefined;
    const inStockOnly = req.query.inStockOnly === 'true';
    const products = store.getProducts(category, inStockOnly);
    res.json({ products, summary: store.getSummary() });
  });

  // 7. Toggle product stock (for immediate interactive testing of Storefront UI)
  app.post('/api/products/:id/toggle-stock', async (req: Request, res: Response) => {
    const { id } = req.params;
    const updated = await store.toggleStock(id);
    if (!updated) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: updated, summary: store.getSummary() });
  });

  // 8. Legacy sync endpoint support (delegates to vault crawl)
  app.post('/api/sync/crawl', async (req: Request, res: Response) => {
    const { mode, url, maxPages } = req.body;
    try {
      const targetUrl = url || 'https://matinimpex.com/collections/all';
      const pages = Number(maxPages) || 10;
      const crawlResult = await runVaultCrawl({
        supplierKey: 'MATIN_IMPEX',
        targetUrl,
        maxPages: pages,
        mode: 'STOCK_ONLY',
      });
      const diffReport = await runDiffEngine(crawlResult.crawlRun.id);

      res.json({
        success: true,
        scrapedCount: crawlResult.totalVariantsScraped,
        crawlLogs: crawlResult.logs,
        diffReport,
        summary: store.getSummary(),
        products: store.getProducts(),
      });
    } catch (err: any) {
      console.error('[API /api/sync/crawl] Error:', err);
      res.status(500).json({ error: err.message || 'Sync failed' });
    }
  });

  // 9. Sync Summary & History
  app.get('/api/sync/summary', (_req: Request, res: Response) => {
    res.json({ summary: store.getSummary(), logs: store.getAuditLogs() });
  });

  // 10. AI Normalizer Test
  app.post('/api/ai/test-normalize', async (req: Request, res: Response) => {
    const { rawTitle, rawPrice } = req.body;
    if (!rawTitle) {
      return res.status(400).json({ error: 'rawTitle is required' });
    }
    try {
      const price = Number(rawPrice) || 150;
      const result = await aiNormalizeAndCategorize(rawTitle, price);
      const calculatedPrice = Math.round(price * 1.4);
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
        profitAmount: calculatedPrice - price,
        isAiGenerated: result.isAiGenerated,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. GitHub Repository Verification Report
  app.get('/api/verify-report', (_req: Request, res: Response) => {
    res.json(getRepoVerificationReport());
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
