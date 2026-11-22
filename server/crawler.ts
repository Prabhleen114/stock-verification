import * as cheerio from 'cheerio';
import { ScrapedSupplierProduct, ProductVariantItem } from './types.ts';
import { cleanBrandPrefix, extractModelCode } from './matcher.ts';

// Helper to fetch WooCommerce variations if a product has multiple options
async function fetchWooCommerceVariations(productUrl: string): Promise<ProductVariantItem[]> {
  if (!productUrl) return [];
  try {
    const res = await fetch(productUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const form = $('form.variations_form');
    const variationsAttr = form.attr('data-product_variations');
    if (!variationsAttr) return [];
    const variationsData = JSON.parse(variationsAttr);
    if (!Array.isArray(variationsData)) return [];

    return variationsData.map((v: any) => {
      const attrVals = Object.values(v.attributes || {}).filter(Boolean).map(String);
      const title = attrVals.join(' / ') || `Option ${v.variation_id}`;
      const priceVal = v.display_price || v.display_regular_price || 0;
      return {
        id: String(v.variation_id),
        title,
        sku: v.sku ? String(v.sku).trim() : null,
        pricePaise: Math.round(Number(priceVal) * 100),
        available: v.is_in_stock !== false,
        imageUrl: v.image?.url || v.image?.src || null,
        options: v.attributes || {},
      };
    });
  } catch {
    return [];
  }
}

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

// Helper to construct paginated URLs across WooCommerce and Shopify shops
export function getPageUrl(baseUrl: string, page: number): string {
  if (page === 1) return baseUrl;
  try {
    const parsed = new URL(baseUrl);
    // If Shopify /collections/ or query parameter exists
    if (parsed.pathname.includes('/collections/') || parsed.searchParams.has('page')) {
      parsed.searchParams.set('page', String(page));
      return parsed.toString();
    }
    let pathname = parsed.pathname.replace(/\/page\/\d+\/?$/, '').replace(/\/$/, '');
    parsed.pathname = `${pathname}/page/${page}/`;
    return parsed.toString();
  } catch {
    return `${baseUrl.replace(/\/$/, '')}/page/${page}/`;
  }
}

// Specialized Shopify multi-variant crawler (e.g. Matin Impex or any Shopify store)
async function crawlShopifySupplier(
  baseUrl: string,
  maxPages: number,
  logs: string[]
): Promise<ScrapedSupplierProduct[]> {
  const products: ScrapedSupplierProduct[] = [];
  const seenSupplierIds = new Set<string>();

  const urlObj = new URL(baseUrl);
  const origin = urlObj.origin;
  let collectionPath = urlObj.pathname.replace(/\/products\.json.*$/, '').replace(/\/$/, '');
  if (!collectionPath.startsWith('/collections/')) {
    collectionPath = '/collections/all';
  }

  const endpointBase = `${origin}${collectionPath}/products.json`;
  const startMsg = `[Shopify Crawler] Connecting to ${endpointBase} with multi-variant extraction...`;
  logs.push(startMsg);
  console.log(startMsg);

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = `${endpointBase}?limit=250&page=${page}`;
    let attempts = 0;
    let pageSuccess = false;

    while (attempts < 3 && !pageSuccess) {
      attempts++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(pageUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 404) {
            const endMsg = `[Shopify Crawler] Page ${page} returned 404 (Reached end of pagination).`;
            logs.push(endMsg);
            console.log(endMsg);
            return products;
          }
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.products || data.products.length === 0) {
          const endMsg = `[Shopify Crawler] No more products found at page ${page}. Finished crawl.`;
          logs.push(endMsg);
          console.log(endMsg);
          return products;
        }

        let pageExtracted = 0;
        for (const p of data.products) {
          const variants = p.variants || [];
          const baseTitle = p.title.trim();
          const cleanTitle = cleanBrandPrefix(baseTitle);
          const handle = p.handle;
          const defaultImg = p.images?.[0]?.src || null;
          const productId = String(p.id);

          if (seenSupplierIds.has(productId)) continue;
          seenSupplierIds.add(productId);

          // Group all variants under this single product
          let parsedVariants: ProductVariantItem[] = [];
          if (variants.length > 1) {
            parsedVariants = variants.map((v: any) => {
              const vTitle = v.title && v.title !== 'Default Title' ? v.title.trim() : 'Default';
              const vPrice = parsePrice(String(v.price));
              return {
                id: String(v.id),
                title: vTitle,
                sku: v.sku?.trim() || null,
                pricePaise: Math.round(vPrice * 100),
                available: v.available !== false,
                imageUrl: v.featured_image?.src || defaultImg,
                options: {
                  option1: v.option1,
                  option2: v.option2,
                  option3: v.option3,
                },
              };
            });
          }

          const validPrices = parsedVariants.map((v) => v.pricePaise).filter((p) => p > 0);
          const minPrice = validPrices.length > 0
            ? Math.min(...validPrices) / 100
            : parsePrice(String(variants[0]?.price || p.price || 0));

          const allOos = parsedVariants.length > 0
            ? parsedVariants.every((v) => !v.available)
            : variants[0]?.available === false;

          const modelCode = variants[0]?.sku?.trim() || extractModelCode(baseTitle) || null;
          const productUrl = `${origin}/products/${handle}`;
          const imageUrl = variants[0]?.featured_image?.src || defaultImg;

          products.push({
            supplierId: productId,
            rawTitle: baseTitle,
            cleanTitle,
            modelCode,
            rawPrice: minPrice,
            isOutOfStock: allOos,
            productUrl,
            imageUrl,
            variants: parsedVariants,
            rawPayload: p,
            page,
          });
          pageExtracted++;
        }

        const progressMsg = `[Shopify Crawler] Page ${page}/${maxPages}: Scraped ${pageExtracted} products (Total scraped: ${products.length})`;
        logs.push(progressMsg);
        console.log(progressMsg);
        pageSuccess = true;

        await new Promise((res) => setTimeout(res, 200));
      } catch (err: any) {
        console.warn(`[Shopify Crawler] Attempt ${attempts}/3 failed for page ${page}:`, err.message);
        if (attempts >= 3) {
          logs.push(`[Shopify Crawler] Skipping page ${page} after 3 failed attempts: ${err.message}`);
          break;
        }
        await new Promise((res) => setTimeout(res, 1000 * attempts));
      }
    }
  }

  return products;
}

// Live web crawler targeting Jindeal (WooCommerce), Matin Impex (Shopify), or any custom shop URL
export async function crawlLiveSupplier(
  baseUrl = 'https://jindeal.com/shop/',
  maxPages = 50
): Promise<{ products: ScrapedSupplierProduct[]; error?: string; logs: string[] }> {
  const products: ScrapedSupplierProduct[] = [];
  const logs: string[] = [];
  const seenSupplierIds = new Set<string>();
  const seenUrls = new Set<string>();

  // 1. Detect if Shopify store (e.g. Matin Impex)
  const isShopify = baseUrl.includes('/collections/') || baseUrl.includes('myshopify.com') || baseUrl.includes('matinimpex');
  if (isShopify) {
    try {
      const shopifyProducts = await crawlShopifySupplier(baseUrl, maxPages, logs);
      if (shopifyProducts.length > 0) {
        return { products: shopifyProducts, logs };
      }
    } catch (err: any) {
      const fallbackMsg = `[Crawler] Shopify endpoint notice: ${err.message}. Proceeding to HTML scraper.`;
      logs.push(fallbackMsg);
      console.warn(fallbackMsg);
    }
  }

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
        const pageItems: Array<{
          supplierId: string;
          rawTitle: string;
          cleanTitle: string;
          modelCode: string | null;
          rawPrice: number;
          isOutOfStock: boolean;
          productUrl: string;
          imageUrl: string | null;
          isVariable: boolean;
        }> = [];

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

          // Variable product detection
          const isVariable =
            $(el).hasClass('product-type-variable') ||
            $(el).find('.product_type_variable').length > 0 ||
            $(el).find('a:contains("Select options")').length > 0;

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
            null;

          const modelCode = extractModelCode(rawTitle);
          const cleanTitle = cleanBrandPrefix(rawTitle);

          pageItems.push({
            supplierId,
            rawTitle,
            cleanTitle,
            modelCode,
            rawPrice,
            isOutOfStock,
            productUrl,
            imageUrl,
            isVariable,
          });
        });

        // Process extracted items and fetch variations for variable items
        for (const item of pageItems) {
          let itemVariants: ProductVariantItem[] = [];
          let finalPrice = item.rawPrice;
          let finalOos = item.isOutOfStock;

          if (item.isVariable && item.productUrl) {
            const variations = await fetchWooCommerceVariations(item.productUrl);
            if (variations.length > 0) {
              itemVariants = variations;
              const validPrices = variations.map((v) => v.pricePaise).filter((p) => p > 0);
              if (validPrices.length > 0) {
                finalPrice = Math.min(...validPrices) / 100;
              }
              finalOos = variations.every((v) => !v.available);
            }
          }

          products.push({
            supplierId: item.supplierId,
            rawTitle: item.rawTitle,
            cleanTitle: item.cleanTitle,
            modelCode: item.modelCode,
            rawPrice: finalPrice,
            isOutOfStock: finalOos,
            productUrl: item.productUrl,
            imageUrl: item.imageUrl,
            variants: itemVariants,
            page,
          });
          pageExtracted++;
        }

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
