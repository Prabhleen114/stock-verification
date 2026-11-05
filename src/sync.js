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
    // Create maps for lookup: by exact model code, and by normalized core title
    const ekoraByModel = new Map();
    const ekoraByTitle = new Map();
    for (const prod of ekoraProducts) {
        const model = (0, matcher_1.getEkoraModelCode)(prod);
        if (model) {
            ekoraByModel.set(model, prod);
        }
        if (prod.name) {
            ekoraByTitle.set((0, matcher_1.normalizeCore)(prod.name), prod);
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
        const ekoraMatch = (0, matcher_1.findEkoraMatch)(jp, ekoraByModel, ekoraByTitle);
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
                    await (0, db_1.setEkoraProductStockInDB)(ekoraId, false);
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
    // 5. Save states
    if (productsJsonDirty) {
        (0, db_1.saveEkoraProducts)(ekoraProducts);
    }
    (0, db_1.saveTrackerState)(trackerState);
    console.log(`[Sync] Sync complete. Newly OOS: ${newOosCount}, Restocked: ${restockedCount}, Total Currently OOS: ${Object.keys(trackerState).length}`);
}
