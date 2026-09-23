import * as cheerio from 'cheerio';

export interface ScrapedProduct {
  jindealId: string;
  jindealTitle: string;
  jindealUrl: string;
  isOutOfStock: boolean;
}

export async function crawlJindeal(maxPages = 50): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
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
        if (response.status === 404) break; // Reached end of pagination
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
    } catch (error) {
      console.error(`[Crawler] Error fetching page ${page}:`, error);
      break;
    }
  }

  return products;
}
