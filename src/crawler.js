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
exports.crawlJindeal = crawlJindeal;
const cheerio = __importStar(require("cheerio"));
async function crawlJindeal(maxPages = 50) {
    const products = [];
    let page = 1;
    const baseUrl = 'https://jindeal.com/shop/';
    while (page <= maxPages) {
        const url = page === 1 ? baseUrl : `${baseUrl}page/${page}/`;
        console.log(`[Crawler] Fetching page ${page}...`);
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            if (!response.ok) {
                if (response.status === 404)
                    break; // Reached end of pagination
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const html = await response.text();
            const $ = cheerio.load(html);
            const productElements = $('.product-small');
            if (productElements.length === 0) {
                console.log(`[Crawler] No products found on page ${page}. Ending crawl.`);
                break;
            }
            productElements.each((_, el) => {
                const titleEl = $(el).find('.woocommerce-loop-product__title');
                const title = titleEl.text().trim();
                const productUrl = titleEl.find('a').attr('href') || '';
                let jindealId = '';
                const classStr = $(el).attr('class') || '';
                const idMatch = classStr.match(/post-(\d+)/);
                if (idMatch) {
                    jindealId = idMatch[1];
                }
                const isOutOfStock = $(el).hasClass('outofstock') || $(el).find('.out-of-stock-label').length > 0;
                if (title && jindealId) {
                    products.push({
                        jindealId,
                        jindealTitle: title,
                        jindealUrl: productUrl,
                        isOutOfStock
                    });
                }
            });
            const nextBtn = $('.next.page-number');
            if (nextBtn.length === 0) {
                console.log(`[Crawler] No next page button found. Ending crawl at page ${page}.`);
                break;
            }
            page++;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        catch (error) {
            console.error(`[Crawler] Error fetching page ${page}:`, error);
            break;
        }
    }
    return products;
}
