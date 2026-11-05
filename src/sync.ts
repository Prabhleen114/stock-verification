import { crawlJindeal } from './crawler';
import { normalizeCore, extractModelCode, getEkoraModelCode, findEkoraMatch } from './matcher';
import { getEkoraProducts, setEkoraProductStockInDB, loadTrackerState, saveTrackerState, saveEkoraProducts } from './db';

export async function runSync() {
  console.log('[Sync] Starting stock verification sync...');
  
  // 1. Crawl Jindeal
  const jindealProducts = await crawlJindeal();
  console.log(`[Sync] Crawled ${jindealProducts.length} products from Jindeal.`);

  // 2. Load Ekora Data
  const ekoraProducts = getEkoraProducts();
  console.log(`[Sync] Loaded ${ekoraProducts.length} products from Ekora Bazaar.`);
  
  // Create maps for lookup: by exact model code, and by normalized core title
  const ekoraByModel = new Map<string, any>();
  const ekoraByTitle = new Map<string, any>();
  for (const prod of ekoraProducts) {
    const model = getEkoraModelCode(prod);
    if (model) {
      ekoraByModel.set(model, prod);
    }
    if (prod.name) {
      ekoraByTitle.set(normalizeCore(prod.name), prod);
    }
  }

  // 3. Load tracker state
  const trackerState = loadTrackerState();
  const currentTrackerKeys = new Set(Object.keys(trackerState));

  let newOosCount = 0;
  let restockedCount = 0;
  let productsJsonDirty = false;

  // 4. Process Jindeal Products
  for (const jp of jindealProducts) {
    const ekoraMatch = findEkoraMatch(jp, ekoraByModel, ekoraByTitle);

    if (ekoraMatch) {
      const ekoraId = String(ekoraMatch.id);

      if (jp.isOutOfStock) {
        if (!trackerState[ekoraId]) {
          console.log(`[Sync] Found NEW Out Of Stock: ${jp.jindealTitle} -> Ekora ID: ${ekoraId}`);
          trackerState[ekoraId] = {
            ekoraId,
            jindealId: jp.jindealId,
            title: ekoraMatch.name,
            outOfStockSince: new Date().toISOString()
          };
          newOosCount++;
        }
        // Always ensure both products.json and DB reflect out-of-stock status
        if (ekoraMatch.inStock !== false || !ekoraMatch.isQuoteOnly) {
          ekoraMatch.inStock = false;
          ekoraMatch.isQuoteOnly = true;
          productsJsonDirty = true;
          await setEkoraProductStockInDB(ekoraId, false);
        }
        currentTrackerKeys.delete(ekoraId); // mark as seen and still OOS
      } else {
        // Product is in stock on Jindeal
        if (trackerState[ekoraId]) {
          // Was previously OOS, now back in stock!
          console.log(`[Sync] Found RESTOCKED: ${jp.jindealTitle} -> Ekora ID: ${ekoraId}`);
          await setEkoraProductStockInDB(ekoraId, true);
          ekoraMatch.inStock = true;
          ekoraMatch.isQuoteOnly = false;
          productsJsonDirty = true;
          delete trackerState[ekoraId];
          restockedCount++;
          currentTrackerKeys.delete(ekoraId);
        }
      }
    }
  }

  // 5. Save states
  if (productsJsonDirty) {
    saveEkoraProducts(ekoraProducts);
  }
  saveTrackerState(trackerState);

  console.log(`[Sync] Sync complete. Newly OOS: ${newOosCount}, Restocked: ${restockedCount}, Total Currently OOS: ${Object.keys(trackerState).length}`);
}
