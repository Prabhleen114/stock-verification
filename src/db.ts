import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const connectionString = process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

export const dbPool = connectionString ? new Pool({ connectionString }) : null;

export const PRODUCTS_JSON_PATH = path.join(__dirname, '../../src/lib/data/products.json');
export const STATE_JSON_PATH = path.join(__dirname, '../tracker_state.json');

export function getEkoraProducts() {
  if (fs.existsSync(PRODUCTS_JSON_PATH)) {
    const data = fs.readFileSync(PRODUCTS_JSON_PATH, 'utf8');
    return JSON.parse(data);
  }
  return [];
}

export function saveEkoraProducts(products: any[]) {
  fs.writeFileSync(PRODUCTS_JSON_PATH, JSON.stringify(products, null, 2), 'utf8');
}

export async function setEkoraProductStock(productId: string, inStock: boolean) {
  const products = getEkoraProducts();
  const product = products.find((p: any) => String(p.id) === String(productId));
  if (product) {
    product.inStock = inStock;
    product.isQuoteOnly = !inStock;
    saveEkoraProducts(products);
  }

  if (dbPool) {
    const stockValue = inStock ? 500 : 0;
    try {
      await dbPool.query('UPDATE "Product" SET stock = $1 WHERE id = $2', [stockValue, Number(productId)]);
    } catch (err) {
      console.error(`[DB] Failed to update product ${productId} in DB:`, err);
    }
  }
}

export interface TrackedItem {
  ekoraId: string;
  jindealId: string;
  title: string;
  outOfStockSince: string;
}

export function loadTrackerState(): Record<string, TrackedItem> {
  if (fs.existsSync(STATE_JSON_PATH)) {
    return JSON.parse(fs.readFileSync(STATE_JSON_PATH, 'utf8'));
  }
  return {};
}

export function saveTrackerState(state: Record<string, TrackedItem>) {
  fs.writeFileSync(STATE_JSON_PATH, JSON.stringify(state, null, 2), 'utf8');
}
