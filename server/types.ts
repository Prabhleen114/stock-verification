export interface ProductVariantItem {
  id: string;
  title: string;
  sku?: string | null;
  pricePaise: number;
  available: boolean;
  imageUrl?: string | null;
  options?: Record<string, string>;
  size?: string;
  color?: string;
  hex?: string;
  price?: number;
  tiers?: Array<{ minQty: number; maxQty: number | null; price: number; discountPct: number }>;
}

export interface StoreProduct {
  id: string;
  title: string;
  slug: string;
  category: string;
  price: number; // selling price on website (with 40% margin)
  originalRetailPrice: number; // supplier retail price
  marginPercent: number; // e.g. 40
  profitAmount: number;
  inStock: boolean;
  stockQuantity: number;
  modelCode: string | null;
  supplierUrl?: string;
  supplierTitle?: string;
  imageUrl: string | null;
  description: string;
  features?: string[];
  tags: string[];
  lastSyncedAt: string;
  source: 'catalog_default' | 'jindeal_crawler' | 'manual';
  outOfStockSince?: string | null;
  variants?: ProductVariantItem[];
  wholesaleTiers?: Array<{ minQty: number; maxQty: number | null; price: number; discountPct: number }>;
}

export interface ScrapedSupplierProduct {
  supplierId: string;
  rawTitle: string;
  cleanTitle: string;
  modelCode: string | null;
  rawPrice: number;
  isOutOfStock: boolean;
  productUrl: string;
  imageUrl: string | null;
  variants?: ProductVariantItem[];
  rawPayload?: any;
  page?: number;
}

export interface SyncAuditItem {
  id: string;
  timestamp: string;
  supplierId: string;
  rawTitle: string;
  normalizedTitle: string;
  modelCode: string | null;
  rawPrice: number;
  calculatedPrice: number;
  supplierStockStatus: 'in_stock' | 'out_of_stock';
  action: 'updated_oos' | 'restocked' | 'already_synced' | 'new_product_added';
  matchType: 'model_exact' | 'fuzzy_title' | 'ai_match' | 'new_unmatched' | 'none';
  confidenceScore: number;
  matchedProductId?: string;
  matchedProductTitle?: string;
  details: string;
}

export interface SyncSummary {
  lastSyncTime: string;
  totalCrawled: number;
  matchedCount: number;
  newlyAddedCount: number;
  updatedOosCount: number;
  restockedCount: number;
  totalCatalogSize: number;
  outOfStockCatalogCount: number;
}
