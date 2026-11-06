import * as cheerio from 'cheerio';
import { ScrapedSupplierProduct } from './types.ts';
import { cleanBrandPrefix, extractModelCode } from './matcher.ts';

// Helper to parse rupee or dollar price string like "₹129.00", "₹269.00 You save", "129"
export function parsePrice(priceText: string): number {
  if (!priceText) return 150;
  const cleaned = priceText.replace(/,/g, '');
  const match = cleaned.match(/(?:₹|\$|Rs\.?|INR)?\s*(\d+(?:\.\d{1,2})?)/i);
  if (match) {
    const val = parseFloat(match[1]);
    return isNaN(val) || val <= 0 ? 150 : Math.round(val);
  }
  return 150;
}

// Helper to construct paginated URLs across standard WooCommerce shops
export function getPageUrl(baseUrl: string, page: number): string {
  if (page === 1) return baseUrl;
  try {
    const parsed = new URL(baseUrl);
    let pathname = parsed.pathname.replace(/\/page\/\d+\/?$/, '').replace(/\/$/, '');
    parsed.pathname = `${pathname}/page/${page}/`;
    return parsed.toString();
  } catch {
    return `${baseUrl.replace(/\/$/, '')}/page/${page}/`;
  }
}

// Live web crawler targeting Jindeal (WooCommerce shop) or any custom shop URL
export async function crawlLiveSupplier(
  baseUrl = 'https://jindeal.com/shop/',
  maxPages = 50
): Promise<{ products: ScrapedSupplierProduct[]; error?: string; logs: string[] }> {
  const products: ScrapedSupplierProduct[] = [];
  const logs: string[] = [];
  const seenSupplierIds = new Set<string>();
  const seenUrls = new Set<string>();

  const startMsg = `[Crawler] Connecting to ${baseUrl} (Crawling all pages up to: ${maxPages})...`;
  logs.push(startMsg);
  console.log(startMsg);

  for (let page = 1; page <= maxPages; page++) {
    const url = getPageUrl(baseUrl, page);
    let attempts = 0;
    const maxAttempts = 3;
    let pageSuccess = false;

    while (attempts < maxAttempts && !pageSuccess) {
      attempts++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 404) {
            const endMsg = `[Crawler] Page ${page} returned 404 (Reached end of pagination).`;
            logs.push(endMsg);
            console.log(endMsg);
            return { products, logs };
          }
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        let productElements = $('.product-small');
        if (productElements.length === 0) {
          productElements = $('li.product, .type-product, .product');
        }

        if (productElements.length === 0) {
          const endMsg = `[Crawler] No product items found on page ${page}. Ending crawl.`;
          logs.push(endMsg);
          console.log(endMsg);
          return { products, logs };
        }

        let pageExtracted = 0;
        productElements.each((_, el) => {
          // If element is an inner Flatsome box wrapper, skip to avoid double counting
          if ($(el).hasClass('box') && $(el).parents('.product-small').length > 0) return;

          const titleEl = $(el).find('.woocommerce-loop-product__title, .product-title, .entry-title, h2, h3, .name').first();
          const rawTitle = titleEl.text().trim();
          if (!rawTitle) return;

          const productUrl = titleEl.find('a').attr('href') || $(el).find('a').attr('href') || '';
          if (productUrl && seenUrls.has(productUrl)) return;
          if (productUrl) seenUrls.add(productUrl);

          const classStr = $(el).attr('class') || '';
          const idMatch = classStr.match(/post-(\d+)/) || $(el).attr('id')?.match(/post-(\d+)/);
          const supplierId = idMatch ? idMatch[1] : (productUrl || `item-${page}-${_}`);
          if (seenSupplierIds.has(supplierId)) return;
          seenSupplierIds.add(supplierId);

          // Out of stock detection (supports WooCommerce classes + label text)
          const isOutOfStock =
            $(el).hasClass('outofstock') ||
            $(el).find('.out-of-stock-label').length > 0 ||
            $(el).find('.outofstock-badge').length > 0 ||
            $(el).text().toLowerCase().includes('out of stock');

          // Price extraction
          const priceEl = $(el).find('.price');
          const currentPriceText =
            priceEl.find('ins .woocommerce-Price-amount').text().trim() ||
            priceEl.find('.woocommerce-Price-amount').first().text().trim() ||
            priceEl.text().trim();
          const rawPrice = parsePrice(currentPriceText);

          // Product image extraction
          const imgEl = $(el).find('img');
          const imageUrl =
            imgEl.attr('data-src') ||
            imgEl.attr('data-lazy-src') ||
            imgEl.attr('src') ||
            'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=600&q=80';

          const modelCode = extractModelCode(rawTitle);
          const cleanTitle = cleanBrandPrefix(rawTitle);

          products.push({
            supplierId,
            rawTitle,
            cleanTitle,
            modelCode,
            rawPrice,
            isOutOfStock,
            productUrl,
            imageUrl,
            page,
          });
          pageExtracted++;
        });

        const progressMsg = `[Crawler] Page ${page}/${maxPages}: Extracted ${pageExtracted} products (Total crawled: ${products.length})`;
        logs.push(progressMsg);
        console.log(progressMsg);

        pageSuccess = true;

        // Check next page button
        const nextBtn = $('.next.page-number, .next-page, a.next');
        if (nextBtn.length === 0 || page >= maxPages) {
          const finishedMsg = `[Crawler] Finished crawl at page ${page}. Total extracted: ${products.length} products.`;
          logs.push(finishedMsg);
          console.log(finishedMsg);
          return { products, logs };
        }

        // Polite pacing
        await new Promise((r) => setTimeout(r, 300));
      } catch (err: any) {
        if (attempts < maxAttempts) {
          const retryMsg = `[Crawler] Warning on page ${page} (attempt ${attempts}/${maxAttempts}): ${err.message}. Retrying in 1s...`;
          logs.push(retryMsg);
          console.log(retryMsg);
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          const skipMsg = `[Crawler] Failed page ${page} after ${maxAttempts} attempts: ${err.message}. Continuing...`;
          logs.push(skipMsg);
          console.log(skipMsg);
          pageSuccess = true;
        }
      }
    }
  }

  return { products, logs };
}

// Curated live-scraped representative test feed from Jindeal for instant simulations and offline tests
export function getSampleScrapedFeed(): ScrapedSupplierProduct[] {
  return [
    {
      supplierId: '3669',
      rawTitle: 'Vedini Christmas Stocking Bow Hat Gift Box Baking DIY Tools Chocolate Silicone Mold JKB-3669',
      cleanTitle: 'Christmas Stocking Bow Hat Gift Box Baking DIY Tools Chocolate Silicone Mold',
      modelCode: 'JKB-3669',
      rawPrice: 129,
      isOutOfStock: false,
      productUrl: 'https://jindeal.com/shop/christmas-stocking-silicone-mold-jkb-3669',
      imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/O1CN01iSM1Ih1Z7NZTOQjwh_2207771553147-0-cib-247x296.jpg',
      page: 1,
    },
    {
      supplierId: '3668',
      rawTitle: 'Vedini Christmas Theme Santa Elk Christmas Tree Shape Silicone Mold Christmas JKB-3668',
      cleanTitle: 'Christmas Theme Santa Elk Christmas Tree Shape Silicone Mold Christmas',
      modelCode: 'JKB-3668',
      rawPrice: 79,
      isOutOfStock: true,
      productUrl: 'https://jindeal.com/shop/christmas-theme-santa-elk-jkb-3668',
      imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/O1CN01W5dbjb1UoMVznbvSC_3031422564-0-cib-247x296.jpg',
      page: 1,
    },
    {
      supplierId: '3666',
      rawTitle: 'Vedini Fondant Space Astronaut Spacecraft Set Of 2 Silicon Mold JKB-3666',
      cleanTitle: 'Fondant Space Astronaut Spacecraft Set Of 2 Silicon Mold',
      modelCode: 'JKB-3666',
      rawPrice: 139,
      isOutOfStock: false,
      productUrl: 'https://jindeal.com/shop/space-astronaut-spacecraft-silicone-mold-jkb-3666',
      imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/O1CN01zsOuGY1Z7NKZvH040_2207771553147-0-cib-247x296.jpg',
      page: 1,
    },
    {
      supplierId: '3665',
      rawTitle: 'Vedini Concrete, Resin Heart Shaped Tray silicon Mold JKB-3665',
      cleanTitle: 'Concrete, Resin Heart Shaped Tray silicon Mold',
      modelCode: 'JKB-3665',
      rawPrice: 269,
      isOutOfStock: false,
      productUrl: 'https://jindeal.com/shop/heart-shaped-tray-silicon-mold-jkb-3665',
      imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/Screenshot-2026-11-04-154523-247x296.png',
      page: 1,
    },
    {
      supplierId: '3664',
      rawTitle: 'Jindeal 3D Geometric Bear Candle Mold Silicone Wax Aroma Mould JKB-3664',
      cleanTitle: '3D Geometric Bear Candle Mold Silicone Wax Aroma Mould',
      modelCode: 'JKB-3664',
      rawPrice: 199,
      isOutOfStock: true,
      productUrl: 'https://jindeal.com/shop/geometric-bear-candle-mold-jkb-3664',
      imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/O1CN01iSM1Ih1Z7NZTOQjwh_2207771553147-0-cib-247x296.jpg',
      page: 1,
    },
    {
      supplierId: '3670',
      rawTitle: 'Vedini Luxury Oval Vanity Jewelry Trinket Dish Casting Mold By Jindeal JKB-3670',
      cleanTitle: 'Luxury Oval Vanity Jewelry Trinket Dish Casting Mold',
      modelCode: 'JKB-3670',
      rawPrice: 320,
      isOutOfStock: false,
      productUrl: 'https://jindeal.com/shop/oval-vanity-trinket-dish-mold-jkb-3670',
      imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/Screenshot-2026-11-04-154523-247x296.png',
      page: 1,
    },
    {
      supplierId: '3671',
      rawTitle: 'Vedini Rose Flower Bouquet Fondant Cupcake Silicone Decorating Mold JKB-3671',
      cleanTitle: 'Rose Flower Bouquet Fondant Cupcake Silicone Decorating Mold',
      modelCode: 'JKB-3671',
      rawPrice: 145,
      isOutOfStock: false,
      productUrl: 'https://jindeal.com/shop/rose-flower-bouquet-fondant-mold-jkb-3671',
      imageUrl: 'https://jindeal.com/wp-content/uploads/2026/11/O1CN01zsOuGY1Z7NKZvH040_2207771553147-0-cib-247x296.jpg',
      page: 1,
    },
  ];
}
