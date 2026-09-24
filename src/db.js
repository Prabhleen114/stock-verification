"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATE_JSON_PATH = exports.PRODUCTS_JSON_PATH = exports.dbPool = void 0;
exports.getEkoraProducts = getEkoraProducts;
exports.saveEkoraProducts = saveEkoraProducts;
exports.setEkoraProductStockInDB = setEkoraProductStockInDB;
exports.loadTrackerState = loadTrackerState;
exports.saveTrackerState = saveTrackerState;
const pg_1 = require("pg");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
const connectionString = process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
exports.dbPool = connectionString ? new pg_1.Pool({ connectionString }) : null;
exports.PRODUCTS_JSON_PATH = path.join(__dirname, '../../src/lib/data/products.json');
exports.STATE_JSON_PATH = path.join(__dirname, '../tracker_state.json');
function getEkoraProducts() {
    if (fs.existsSync(exports.PRODUCTS_JSON_PATH)) {
        const data = fs.readFileSync(exports.PRODUCTS_JSON_PATH, 'utf8');
        return JSON.parse(data);
    }
    return [];
}
function saveEkoraProducts(products) {
    fs.writeFileSync(exports.PRODUCTS_JSON_PATH, JSON.stringify(products, null, 2), 'utf8');
}
async function setEkoraProductStockInDB(productId, inStock) {
    if (exports.dbPool) {
        const stockValue = inStock ? 500 : 0;
        try {
            await exports.dbPool.query('UPDATE "Product" SET stock = $1 WHERE id = $2', [stockValue, Number(productId)]);
        }
        catch (err) {
            console.error(`[DB] Failed to update product ${productId} in DB:`, err);
        }
    }
}
function loadTrackerState() {
    if (fs.existsSync(exports.STATE_JSON_PATH)) {
        return JSON.parse(fs.readFileSync(exports.STATE_JSON_PATH, 'utf8'));
    }
    return {};
}
function saveTrackerState(state) {
    fs.writeFileSync(exports.STATE_JSON_PATH, JSON.stringify(state, null, 2), 'utf8');
}
