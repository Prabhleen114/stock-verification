import { crawlJindeal } from './crawler';
import { normalizeCore } from './matcher';
import { getEkoraProducts, setEkoraProductStock, loadTrackerState, saveTrackerState } from './db';

export async function runSync() {
  console.log('[Sync] Starting stock verification sync...');
  
  // 1. Crawl Jindeal
  const jindealProducts = await crawlJindeal();
  console.log(`[Sync] Crawled ${jindealProducts.length} products from Jindeal.`);

  // 2. Load Ekora Data
  const ekoraProducts = getEkoraProducts();
  console.log(`[Sync] Loaded ${ekoraProducts.length} products from Ekora Bazaar.`);
  
  // Create a map for quick lookup by normalized title
  const ekoraMap = new Map<string, any>();
  for (const prod of ekoraProducts) {
    if (prod.title) {
      ekoraMap.set(normalizeCore(prod.title), prod);
    }
  }

  // 3. Load tracker state
  const trackerState = loadTrackerState();
  const currentTrackerKeys = new Set(Object.keys(trackerState));

  let newOosCount = 0;
  let restockedCount = 0;

  // 4. Process Jindeal Products
  for (const jp of jindealProducts) {
    const normJindealTitle = normalizeCore(jp.jindealTitle);
    const ekoraMatch = ekoraMap.get(normJindealTitle);

    if (ekoraMatch) {
      const ekoraId = String(ekoraMatch.id);

      if (jp.isOutOfStock) {
        if (!trackerState[ekoraId]) {
          console.log(`[Sync] Found NEW Out Of Stock: ${jp.jindealTitle} -> Ekora ID: ${ekoraId}`);
          trackerState[ekoraId] = {
            ekoraId,
            jindealId: jp.jindealId,
            title: ekoraMatch.title,
            outOfStockSince: new Date().toISOString()
          };
          await setEkoraProductStock(ekoraId, false);
          newOosCount++;
        }
        currentTrackerKeys.delete(ekoraId); // mark as seen and still OOS
      } else {
        // Product is in stock on Jindeal
        if (trackerState[ekoraId]) {
          // Was previously OOS, now back in stock!
          console.log(`[Sync] Found RESTOCKED: ${jp.jindealTitle} -> Ekora ID: ${ekoraId}`);
          await setEkoraProductStock(ekoraId, true);
          delete trackerState[ekoraId];
          restockedCount++;
          currentTrackerKeys.delete(ekoraId);
        }
      }
    }
  }

  // 6. Save state
  saveTrackerState(trackerState);

  console.log(`[Sync] Sync complete. Newly OOS: ${newOosCount}, Restocked: ${restockedCount}, Total Currently OOS: ${Object.keys(trackerState).length}`);
}
