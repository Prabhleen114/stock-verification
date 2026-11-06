import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

import { StoreProduct, ScrapedSupplierProduct, SyncAuditItem, SyncSummary } from './types.ts';
import {
  findBestStoreMatch,
  findFastStoreMatch,
  buildCatalogIndex,
  extractModelCode,
  getEkoraModelCode,
  normalizeCore,
  tokenize,
} from './matcher.ts';
import { aiNormalizeAndCategorize } from './aiCategorizer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from possible locations
const envCandidates = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../.env.local'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, './.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// Database Connection Pool
const connectionString =
  process.env.DIRECT_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;

export const dbPool = connectionString ? new Pool({ connectionString }) : null;

// Ground-truth Ekora products.json path resolution
export function resolveProductsJsonPath(): string | null {
  const candidates = [
    process.env.PRODUCTS_JSON_PATH,
    path.resolve(__dirname, '../../src/lib/data/products.json'),
    path.resolve(__dirname, '../src/lib/data/products.json'),
    path.resolve(__dirname, '../data/products.json'),
    path.resolve(__dirname, './data/products.json'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const PRODUCTS_JSON_PATH = resolveProductsJsonPath();

// Fallback pre-seeded store inventory (used when standalone or products.json missing)
const initialCatalog: StoreProduct[] = [
  {
    id: 'prod_1',
    title: 'Christmas Stocking & Bow Chocolate Silicone Mold',
    slug: 'christmas-stocking-bow-chocolate-silicone-mold',
    category: 'Festive & Holiday Molds',
    price: 181, // 129 + 40% margin
    originalRetailPrice: 129,
    marginPercent: 40,
    profitAmount: 52,
    inStock: true,
    stockQuantity: 45,
    modelCode: 'JKB-3669',
    supplierUrl: 'https://jindeal.com/shop/christmas-stocking-silicone-mold-jkb-3669',
    supplierTitle: 'Vedini Christmas Stocking Bow Hat Gift Box Baking DIY Tools Chocolate Silicone Mold JKB-3669',
    imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/O1CN01iSM1Ih1Z7NZTOQjwh_2207771553147-0-cib-247x296.jpg',
    description: 'High-grade flexible silicone mold featuring festive Christmas stockings, gift boxes, and bow ties for chocolate and baking.',
    features: ['Food-grade FDA silicone', 'Dishwasher and oven safe up to 230°C', 'Flexible easy-demold surface'],
    tags: ['christmas', 'silicone mold', 'chocolate', 'baking', 'holiday craft'],
    lastSyncedAt: new Date().toISOString(),
    source: 'catalog_default',
  },
  {
    id: 'prod_2',
    title: 'Christmas Theme Santa & Elk Tree Silicone Mold',
    slug: 'christmas-theme-santa-elk-tree-silicone-mold',
    category: 'Festive & Holiday Molds',
    price: 111, // 79 + 40% margin
    originalRetailPrice: 79,
    marginPercent: 40,
    profitAmount: 32,
    inStock: true,
    stockQuantity: 18,
    modelCode: 'JKB-3668',
    supplierUrl: 'https://jindeal.com/shop/christmas-theme-santa-elk-jkb-3668',
    supplierTitle: 'Vedini Christmas Theme Santa Elk Christmas Tree Shape Silicone Mold Christmas JKB-3668',
    imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/O1CN01W5dbjb1UoMVznbvSC_3031422564-0-cib-247x296.jpg',
    description: 'Detailed festive Santa Claus, reindeer, and pine tree mold suitable for ice cubes, confectionery, and plaster craft.',
    features: ['Crisp detail embossing', 'Tear-resistant silicone', 'Odorless and non-toxic'],
    tags: ['santa', 'elk', 'tree', 'festive mold', 'crafts'],
    lastSyncedAt: new Date().toISOString(),
    source: 'catalog_default',
  },
  {
    id: 'prod_3',
    title: 'Fondant Space Astronaut & Spacecraft 2-Piece Mold',
    slug: 'fondant-space-astronaut-spacecraft-2-piece-mold',
    category: 'Cake & Chocolate Decorating',
    price: 195, // 139 + 40% margin
    originalRetailPrice: 139,
    marginPercent: 40,
    profitAmount: 56,
    inStock: true,
    stockQuantity: 32,
    modelCode: 'JKB-3666',
    supplierUrl: 'https://jindeal.com/shop/space-astronaut-spacecraft-silicone-mold-jkb-3666',
    supplierTitle: 'Vedini Fondant Space Astronaut Spacecraft Set Of 2 Silicon Mold JKB-3666',
    imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/O1CN01zsOuGY1Z7NKZvH040_2207771553147-0-cib-247x296.jpg',
    description: 'Two-piece galactic astronaut and rocket ship mold perfect for themed birthday cakes, sugar paste, and chocolate toppers.',
    features: ['2 individual matching molds', 'Deep texture relief', 'Quick clean surface'],
    tags: ['astronaut', 'space', 'fondant', 'cake topper', 'kids party'],
    lastSyncedAt: new Date().toISOString(),
    source: 'catalog_default',
  },
  {
    id: 'prod_4',
    title: 'Concrete & Resin Heart Shaped Trinket Tray Mold',
    slug: 'concrete-resin-heart-shaped-trinket-tray-mold',
    category: 'Resin & Concrete Craft',
    price: 377, // 269 + 40% margin
    originalRetailPrice: 269,
    marginPercent: 40,
    profitAmount: 108,
    inStock: true,
    stockQuantity: 24,
    modelCode: 'JKB-3665',
    supplierUrl: 'https://jindeal.com/shop/heart-shaped-tray-silicon-mold-jkb-3665',
    supplierTitle: 'Vedini Concrete, Resin Heart Shaped Tray silicon Mold JKB-3665',
    imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/Screenshot-2026-11-04-154523-247x296.png',
    description: 'Heavy-duty silicone casting mold for crafting polished heart-shaped cement, jesmonite, and epoxy resin vanity organizers.',
    features: ['Sturdy thick-wall construction', 'Mirror-gloss interior finish', 'Compatible with cement and resin'],
    tags: ['resin art', 'concrete tray', 'heart mold', 'trinket dish', 'diy decor'],
    lastSyncedAt: new Date().toISOString(),
    source: 'catalog_default',
  },
  {
    id: 'prod_5',
    title: '3D Geometric Bear Candle Silicone Mold',
    slug: '3d-geometric-bear-candle-silicone-mold',
    category: 'Candle & Soap Making',
    price: 279, // 199 + 40% margin
    originalRetailPrice: 199,
    marginPercent: 40,
    profitAmount: 80,
    inStock: false,
    outOfStockSince: new Date(Date.now() - 3600 * 48 * 1000).toISOString(),
    stockQuantity: 0,
    modelCode: 'JKB-3664',
    supplierUrl: 'https://jindeal.com/shop/geometric-bear-candle-mold-jkb-3664',
    supplierTitle: 'Jindeal 3D Geometric Bear Candle Mold Silicone Wax Aroma Mould JKB-3664',
    imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/O1CN01iSM1Ih1Z7NZTOQjwh_2207771553147-0-cib-247x296.jpg',
    description: 'Modern low-poly faceted bear mold engineered for soy wax candle making, soap bars, and decorative aroma diffusers.',
    features: ['Facet polygon design', 'Pre-marked wick hole', 'Elastic tear-resistant silicone'],
    tags: ['candle mold', 'geometric bear', 'aroma wax', 'soap making'],
    lastSyncedAt: new Date().toISOString(),
    source: 'catalog_default',
  },
];

class StoreManager {
  private products: StoreProduct[] = [];
  private rawEkoraProducts: any[] = [];
  private rawEkoraById = new Map<string, any>();
  private auditLogs: SyncAuditItem[] = [];
  private lastSyncTime: string = new Date().toISOString();

  constructor() {
    this.loadCatalog();
  }

  // Load products from Ekora Bazaar products.json or fallback
  public loadCatalog(): void {
    if (PRODUCTS_JSON_PATH && fs.existsSync(PRODUCTS_JSON_PATH)) {
      try {
        const fileContent = fs.readFileSync(PRODUCTS_JSON_PATH, 'utf-8');
        this.rawEkoraProducts = JSON.parse(fileContent);
        this.rawEkoraById.clear();

        const mapped: StoreProduct[] = [];
        for (const p of this.rawEkoraProducts) {
          const id = String(p.id);
          this.rawEkoraById.set(id, p);

          const isOos = p.inStock === false || p.isQuoteOnly === true;
          const modelCode = getEkoraModelCode(p);
          const price = Number(p.price) || 150;
          const originalRetail = Math.round(price / 1.4);
          const profit = price - originalRetail;

          mapped.push({
            id,
            title: p.name || 'Untitled Product',
            slug: p.slug || (p.name ? p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : `prod-${id}`),
            category: p.category || 'Silicone & Baking Molds',
            price,
            originalRetailPrice: originalRetail,
            marginPercent: 40,
            profitAmount: profit,
            inStock: !isOos,
            stockQuantity: isOos ? 0 : 50,
            modelCode,
            supplierUrl: p.image?.includes('jindeal.com') ? 'https://jindeal.com/shop/' : undefined,
            supplierTitle: p.name,
            imageUrl: p.image || 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=600&q=80',
            description: p.description || '',
            features: [
              'Commercial food-grade silicone',
              'Oven, microwave, freezer safe (-40°C to 230°C)',
              'Flexible non-stick easy demold surface',
            ],
            tags: Array.isArray(p.tags) ? p.tags : [],
            lastSyncedAt: new Date().toISOString(),
            source: 'catalog_default',
            outOfStockSince: isOos ? new Date().toISOString() : null,
          });
        }

        this.products = mapped;
        console.log(`[StoreManager] Loaded ${mapped.length} real products from ${PRODUCTS_JSON_PATH}`);
        return;
      } catch (err: any) {
        console.error(`[StoreManager] Error parsing ${PRODUCTS_JSON_PATH}:`, err.message);
      }
    }

    // Fallback to initial catalog
    this.products = [...initialCatalog];
    console.log(`[StoreManager] Using fallback initial catalog with ${this.products.length} products.`);
  }

  // Persist updated rawEkoraProducts to products.json
  private saveRawCatalog(): void {
    if (!PRODUCTS_JSON_PATH) return;
    try {
      fs.writeFileSync(PRODUCTS_JSON_PATH, JSON.stringify(this.rawEkoraProducts, null, 2), 'utf-8');
      console.log(`[StoreManager] Successfully persisted changes to ${PRODUCTS_JSON_PATH}`);
    } catch (err: any) {
      console.error(`[StoreManager] Failed to write to ${PRODUCTS_JSON_PATH}:`, err.message);
    }
  }

  // Update PostgreSQL database stock state if connected
  private async updateDbStock(productId: string, inStock: boolean): Promise<void> {
    if (!dbPool) return;
    const stockVal = inStock ? 500 : 0;
    try {
      await dbPool.query('UPDATE "Product" SET stock = $1 WHERE id = $2', [stockVal, productId]);
    } catch (err: any) {
      // Non-blocking warning
      console.warn(`[StoreManager DB] Stock update warning for ID ${productId}:`, err.message);
    }
  }

  // Insert newly discovered product into PostgreSQL if connected
  private async insertDbProduct(newProd: any, sellingPrice: number, inStock: boolean): Promise<void> {
    if (!dbPool) return;
    try {
      await dbPool.query(
        `INSERT INTO "Product" (id, title, description, price, stock, "imageUrl", category, status, source, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PUBLISHED', 'SCRAPER', NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, price = EXCLUDED.price`,
        [
          String(newProd.id),
          newProd.name || newProd.title,
          newProd.description || '',
          sellingPrice,
          inStock ? 500 : 0,
          newProd.image || newProd.imageUrl || '',
          newProd.category || 'Silicone & Baking Molds',
        ]
      );
    } catch (err: any) {
      console.warn(`[StoreManager DB] Note: Product insert note for ID ${newProd.id}:`, err.message);
    }
  }

  // Helper to generate next unique product ID
  private getNextId(): string {
    let maxId = 0;
    for (const p of this.products) {
      const num = parseInt(p.id, 10);
      if (!isNaN(num) && num > maxId) {
        maxId = num;
      }
    }
    return String(maxId > 0 ? maxId + 1 : Date.now());
  }

  // Retrieve products, with optional filter by stock or category
  public getProducts(category?: string, inStockOnly = false): StoreProduct[] {
    return this.products.filter(p => {
      if (category && category !== 'All' && p.category !== category) return false;
      if (inStockOnly && !p.inStock) return false;
      return true;
    });
  }

  public getProductById(id: string): StoreProduct | undefined {
    return this.products.find(p => p.id === id);
  }

  // Toggle inStock state manually (for storefront preview & testing)
  public async toggleStock(id: string): Promise<StoreProduct | null> {
    const product = this.products.find(p => p.id === id);
    if (!product) return null;

    product.inStock = !product.inStock;
    if (!product.inStock) {
      product.stockQuantity = 0;
      product.outOfStockSince = new Date().toISOString();
    } else {
      product.stockQuantity = 25;
      product.outOfStockSince = null;
    }
    product.lastSyncedAt = new Date().toISOString();

    // Sync with raw products.json and DB
    const raw = this.rawEkoraById.get(id);
    if (raw) {
      raw.inStock = product.inStock;
      raw.isQuoteOnly = !product.inStock;
      this.saveRawCatalog();
    }
    await this.updateDbStock(id, product.inStock);

    return product;
  }

  // Core Synchronization Pipeline requested by user:
  // 1. Scrape item names & prices from Jindeal
  // 2. Normalize and remove words like Vedini or Jindeal
  // 3. Exact Model & Fuzzy match with store catalog
  // 4. If product is out of stock -> update stock to Out of Stock (disable UI on website)
  // 5. If product is NOT in store -> use AI to normalize name, remove keywords/model codes, categorize, add 40% margin, and add to stock!
  public async processSyncBatch(
    scrapedProducts: ScrapedSupplierProduct[]
  ): Promise<{ auditItems: SyncAuditItem[]; summary: SyncSummary }> {
    const now = new Date().toISOString();
    this.lastSyncTime = now;

    let matchedCount = 0;
    let newlyAddedCount = 0;
    let updatedOosCount = 0;
    let restockedCount = 0;
    let catalogDirty = false;

    const catalogIndex = buildCatalogIndex(this.products);
    const newAuditItems: SyncAuditItem[] = [];
    let processed = 0;

    for (const scraped of scrapedProducts) {
      processed++;
      if (processed % 250 === 0 || processed === scrapedProducts.length) {
        console.log(`[Sync] Processed ${processed}/${scrapedProducts.length} items (Matched: ${matchedCount}, OOS: ${updatedOosCount}, Restocked: ${restockedCount}, Ingested: ${newlyAddedCount})...`);
      }

      const { match, score, matchType, reason } = findFastStoreMatch(scraped, catalogIndex);

      if (match) {
        matchedCount++;
        const raw = this.rawEkoraById.get(match.id);

        // Case A: Product matches an existing item in store catalog
        if (scraped.isOutOfStock) {
          // Supplier is Out Of Stock!
          if (match.inStock) {
            match.inStock = false;
            match.stockQuantity = 0;
            match.outOfStockSince = now;
            match.lastSyncedAt = now;
            updatedOosCount++;

            if (raw) {
              raw.inStock = false;
              raw.isQuoteOnly = true;
              catalogDirty = true;
            }
            await this.updateDbStock(match.id, false);

            newAuditItems.push({
              id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              timestamp: now,
              supplierId: scraped.supplierId,
              rawTitle: scraped.rawTitle,
              normalizedTitle: match.title,
              modelCode: scraped.modelCode || match.modelCode,
              rawPrice: scraped.rawPrice,
              calculatedPrice: match.price,
              supplierStockStatus: 'out_of_stock',
              action: 'updated_oos',
              matchType,
              confidenceScore: Math.round(score * 100),
              matchedProductId: match.id,
              matchedProductTitle: match.title,
              details: `Supplier is OUT OF STOCK. Changed website UI state to Out of Stock (${reason}). Disabled Add to Cart & Buy Now.`,
            });
          } else {
            // Already out of stock
            newAuditItems.push({
              id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              timestamp: now,
              supplierId: scraped.supplierId,
              rawTitle: scraped.rawTitle,
              normalizedTitle: match.title,
              modelCode: scraped.modelCode || match.modelCode,
              rawPrice: scraped.rawPrice,
              calculatedPrice: match.price,
              supplierStockStatus: 'out_of_stock',
              action: 'already_synced',
              matchType,
              confidenceScore: Math.round(score * 100),
              matchedProductId: match.id,
              matchedProductTitle: match.title,
              details: `Product already marked Out of Stock on website.`,
            });
          }
        } else {
          // Supplier is IN STOCK!
          if (!match.inStock) {
            // Was previously OOS, now RESTOCKED!
            match.inStock = true;
            match.stockQuantity = 50;
            match.outOfStockSince = null;
            match.lastSyncedAt = now;
            restockedCount++;

            if (raw) {
              raw.inStock = true;
              raw.isQuoteOnly = false;
              catalogDirty = true;
            }
            await this.updateDbStock(match.id, true);

            newAuditItems.push({
              id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              timestamp: now,
              supplierId: scraped.supplierId,
              rawTitle: scraped.rawTitle,
              normalizedTitle: match.title,
              modelCode: scraped.modelCode || match.modelCode,
              rawPrice: scraped.rawPrice,
              calculatedPrice: match.price,
              supplierStockStatus: 'in_stock',
              action: 'restocked',
              matchType,
              confidenceScore: Math.round(score * 100),
              matchedProductId: match.id,
              matchedProductTitle: match.title,
              details: `Supplier has restocked item. Re-enabled 'Add to Cart' & 'Buy Now' on website.`,
            });
          } else {
            newAuditItems.push({
              id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              timestamp: now,
              supplierId: scraped.supplierId,
              rawTitle: scraped.rawTitle,
              normalizedTitle: match.title,
              modelCode: scraped.modelCode || match.modelCode,
              rawPrice: scraped.rawPrice,
              calculatedPrice: match.price,
              supplierStockStatus: 'in_stock',
              action: 'already_synced',
              matchType,
              confidenceScore: Math.round(score * 100),
              matchedProductId: match.id,
              matchedProductTitle: match.title,
              details: `Catalog up to date. In Stock status confirmed.`,
            });
          }
        }
      } else {
        // Case B: Product is NOT on website!
        // Requirements: "if there is a product that is not on my website it should add that product to my stock,
        // use ai to categorise it and normalise its name removing keywords like 'jindeal', 'vedini' or any model number like jkb and add 40% profit margin to the original retail price."

        // 1. Call AI Categorizer & Normalizer
        const aiResult = await aiNormalizeAndCategorize(scraped.rawTitle, scraped.rawPrice);

        // 2. Add 40% profit margin
        const originalPrice = scraped.rawPrice || 100;
        const sellingPrice = Math.round(originalPrice * 1.4); // 40% profit markup
        const profit = sellingPrice - originalPrice;

        const newProductId = this.getNextId();
        const modelCode = scraped.modelCode || extractModelCode(scraped.rawTitle);

        const newProduct: StoreProduct = {
          id: newProductId,
          title: aiResult.normalizedTitle,
          slug: aiResult.normalizedTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
          category: aiResult.category,
          price: sellingPrice,
          originalRetailPrice: originalPrice,
          marginPercent: 40,
          profitAmount: profit,
          inStock: !scraped.isOutOfStock,
          stockQuantity: scraped.isOutOfStock ? 0 : 50,
          modelCode,
          supplierUrl: scraped.productUrl,
          supplierTitle: scraped.rawTitle,
          imageUrl: scraped.imageUrl,
          description: aiResult.description,
          features: aiResult.features,
          tags: aiResult.tags,
          lastSyncedAt: now,
          source: 'jindeal_crawler',
          outOfStockSince: scraped.isOutOfStock ? now : null,
        };

        // Add to in-memory catalog and index
        this.products.unshift(newProduct);
        if (modelCode) catalogIndex.byModel.set(modelCode, newProduct);
        const newNorm = normalizeCore(newProduct.title);
        if (newNorm) catalogIndex.byTitle.set(newNorm, newProduct);
        catalogIndex.items.unshift({
          product: newProduct,
          model: modelCode,
          normTitle: newNorm,
          tokens: tokenize(newProduct.title),
        });

        // Also add to rawEkoraProducts for ground-truth website persistence
        const newRawEkora = {
          id: newProductId,
          name: aiResult.normalizedTitle.toUpperCase(),
          category: aiResult.category,
          description:
            aiResult.description ||
            `Premium quality ${aiResult.normalizedTitle.toLowerCase()} sourced directly for creators. Perfect for your next creative project with batch-tested reliability.`,
          price: sellingPrice,
          bulkDiscountAvailable: true,
          maxDiscount: 10,
          image: scraped.imageUrl,
          tiers: [
            { minQty: 1, maxQty: 9, price: sellingPrice, discountPct: 0 },
            { minQty: 10, maxQty: 49, price: Math.round(sellingPrice * 0.95), discountPct: 5 },
            { minQty: 50, maxQty: null, price: Math.round(sellingPrice * 0.9), discountPct: 10 },
          ],
          tags: [
            ...aiResult.tags.map((t: string) => t.toLowerCase()),
            ...(modelCode ? [modelCode.toLowerCase().replace(/[^a-z0-9]/g, '')] : []),
            'wholesale',
            'b2b',
            'bulk',
            'supplies',
            'india',
            'craft',
            'quality',
            'ekora',
          ],
          department: 'Precision Studio Moulds',
          disciplines: ['candle-studio', 'resin-lab', 'soap-atelier'],
          isQuoteOnly: scraped.isOutOfStock,
          inStock: !scraped.isOutOfStock,
        };

        this.rawEkoraProducts.unshift(newRawEkora);
        this.rawEkoraById.set(newProductId, newRawEkora);
        catalogDirty = true;
        newlyAddedCount++;

        await this.insertDbProduct(newRawEkora, sellingPrice, !scraped.isOutOfStock);

        newAuditItems.push({
          id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: now,
          supplierId: scraped.supplierId,
          rawTitle: scraped.rawTitle,
          normalizedTitle: newProduct.title,
          modelCode,
          rawPrice: originalPrice,
          calculatedPrice: sellingPrice,
          supplierStockStatus: scraped.isOutOfStock ? 'out_of_stock' : 'in_stock',
          action: 'new_product_added',
          matchType: 'new_unmatched',
          confidenceScore: 0,
          matchedProductId: newProductId,
          matchedProductTitle: newProduct.title,
          details: `NEW PRODUCT INGESTION. AI cleaned title & categorized into "${aiResult.category}". Applied 40% profit margin (₹${originalPrice} -> ₹${sellingPrice}, +₹${profit} margin). Added to website catalog!`,
        });
      }
    }

    // Persist changes to products.json if modified
    if (catalogDirty) {
      this.saveRawCatalog();
    }

    // Prepend to audit log history (keep latest 200)
    this.auditLogs = [...newAuditItems, ...this.auditLogs].slice(0, 200);

    const summary: SyncSummary = {
      lastSyncTime: now,
      totalCrawled: scrapedProducts.length,
      matchedCount,
      newlyAddedCount,
      updatedOosCount,
      restockedCount,
      totalCatalogSize: this.products.length,
      outOfStockCatalogCount: this.products.filter(p => !p.inStock).length,
    };

    return { auditItems: newAuditItems, summary };
  }

  public getAuditLogs(): SyncAuditItem[] {
    return this.auditLogs;
  }

  public getSummary(): SyncSummary {
    return {
      lastSyncTime: this.lastSyncTime,
      totalCrawled: this.auditLogs.length,
      matchedCount: this.auditLogs.filter(a => a.action !== 'new_product_added').length,
      newlyAddedCount: this.products.filter(p => p.source === 'jindeal_crawler').length,
      updatedOosCount: this.auditLogs.filter(a => a.action === 'updated_oos').length,
      restockedCount: this.auditLogs.filter(a => a.action === 'restocked').length,
      totalCatalogSize: this.products.length,
      outOfStockCatalogCount: this.products.filter(p => !p.inStock).length,
    };
  }

  public resetCatalog(): void {
    this.loadCatalog();
    this.auditLogs = [];
  }
}

export const store = new StoreManager();
