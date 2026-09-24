const cheerio = require('cheerio');
async function test() {
  const response = await fetch('https://jindeal.com/shop/');
  const html = await response.text();
  const $ = cheerio.load(html);
  let oos = 0;
  $('.product-small').each((i, el) => {
    if($(el).hasClass('outofstock') || $(el).find('.out-of-stock-label').length > 0) oos++;
  });
  console.log('Total products on page:', $('.product-small').length);
  console.log('OOS products on page:', oos);
}
test();
