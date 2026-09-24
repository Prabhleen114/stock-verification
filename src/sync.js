"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSync = runSync;
const crawler_1 = require("./crawler");
const matcher_1 = require("./matcher");
const db_1 = require("./db");
async function runSync() {
    console.log('[Sync] Starting stock verification sync...');
    // 1. Crawl Jindeal
    const jindealProducts = await (0, crawler_1.crawlJindeal)();
    console.log(`[Sync] Crawled ${jindealProducts.length} products from Jindeal.`);
    // 2. Load Ekora Data
    const ekoraProducts = (0, db_1.getEkoraProducts)();
    console.log(`[Sync] Loaded ${ekoraProducts.length} products from Ekora Bazaar.`);
    // Create a map for quick lookup by normalized title
    const ekoraMap = new Map();
    for (const prod of ekoraProducts) {
        if (prod.name) {
            ekoraMap.set((0, matcher_1.normalizeCore)(prod.name), prod);
        }
    }
    // 3. Load tracker state
    const trackerState = (0, db_1.loadTrackerState)();
    const currentTrackerKeys = new Set(Object.keys(trackerState));
    let newOosCount = 0;
    let restockedCount = 0;
    let productsJsonDirty = false;
    // 4. Process Jindeal Products
    for (const jp of jindealProducts) {
        const normJindealTitle = (0, matcher_1.normalizeCore)(jp.jindealTitle);
        const ekoraMatch = ekoraMap.get(normJindealTitle);
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
                    await (0, db_1.setEkoraProductStockInDB)(ekoraId, false);
                    ekoraMatch.inStock = false;
                    ekoraMatch.isQuoteOnly = true;
                    productsJsonDirty = true;
                    newOosCount++;
                }
                currentTrackerKeys.delete(ekoraId); // mark as seen and still OOS
            }
            else {
                // Product is in stock on Jindeal
                if (trackerState[ekoraId]) {
                    // Was previously OOS, now back in stock!
                    console.log(`[Sync] Found RESTOCKED: ${jp.jindealTitle} -> Ekora ID: ${ekoraId}`);
                    await (0, db_1.setEkoraProductStockInDB)(ekoraId, true);
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
    // 6. Save states
    if (productsJsonDirty) {
        (0, db_1.saveEkoraProducts)(ekoraProducts);
    }
    (0, db_1.saveTrackerState)(trackerState);
    console.log(`[Sync] Sync complete. Newly OOS: ${newOosCount}, Restocked: ${restockedCount}, Total Currently OOS: ${Object.keys(trackerState).length}`);
}
