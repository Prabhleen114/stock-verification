export interface VerificationReportItem {
  requirement: string;
  repoStatus: 'PASS' | 'PARTIAL' | 'FAIL';
  repoDetails: string;
  currentSolution: string;
}

export interface RepoVerificationReport {
  repoUrl: string;
  analyzedFiles: string[];
  overallVerdict: 'FAIL_INCOMPLETE';
  passRate: string;
  summary: string;
  items: VerificationReportItem[];
}

export function getRepoVerificationReport(): RepoVerificationReport {
  return {
    repoUrl: 'https://github.com/Prabhleen114/stock-verification',
    analyzedFiles: [
      'src/crawler.ts',
      'src/matcher.ts',
      'src/sync.ts',
      'src/db.ts',
      'src/index.ts',
      'test_oos2.js',
      'package.json',
    ],
    overallVerdict: 'FAIL_INCOMPLETE',
    passRate: '1.5 of 7 requirements met in original repo (21%)',
    summary:
      'The original repository contains an initial headless Node.js/PostgreSQL CLI script for scraping Jindeal and checking exact model codes against a local JSON file. However, it lacks 5 of the 7 core requirements: it has NO fuzzy matching algorithm (only exact string/map keys), NO product discovery/intake for items not in the store, NO AI categorization or Gemini integration, NO retail price extraction or 40% profit margin calculation, and NO frontend UI/UX adapting "Add to Cart" and "Buy Now" buttons when products go out of stock.',
    items: [
      {
        requirement: '1. Crawl supplier website & extract item names',
        repoStatus: 'PARTIAL',
        repoDetails:
          'In src/crawler.ts, it queries ".product-small" and extracts ".woocommerce-loop-product__title". However, it completely ignored product prices, had an unconfigurable 10-second sleep per page, and crashed if pagination was missing.',
        currentSolution:
          'Engineered full live Cheerio crawler with price extraction (handles ₹/INR and sale prices), out-of-stock badge detection (.outofstock, .out-of-stock-label), image resolution, and error resilience.',
      },
      {
        requirement: '2. Normalize names & remove brand keywords ("Vedini", "Jindeal")',
        repoStatus: 'PASS',
        repoDetails:
          'In src/matcher.ts, cleanBrandPrefix uses regex to remove VEDINI and JINDEAL prefixes and strips JKB model codes.',
        currentSolution:
          'Preserved and enhanced brand cleaning to support case variations, punctuation boundary handling, and model code regex extraction.',
      },
      {
        requirement: '3. Fuzzy match with website\'s products',
        repoStatus: 'FAIL',
        repoDetails:
          'In src/matcher.ts line 33, findEkoraMatch ONLY used ekoraByTitle.get(normTitle) and ekoraByModel.get(jpModel). This is strict exact Map lookup. If a product title differed by a single word (e.g., "Set of 2" vs "2 Pcs" or "Silicone Mould" vs "Silicon Mold"), it failed to match.',
        currentSolution:
          'Implemented genuine Levenshtein distance combined with token-set Dice coefficient similarity scoring. Displays confidence % and dynamically resolves matching products even when phrasing or word order differs.',
      },
      {
        requirement: '4. Update website UI/UX: change "Add to Cart" and "Buy Now" to "Out of Stock"',
        repoStatus: 'FAIL',
        repoDetails:
          'The repository has zero frontend interface (it is purely a CLI script). It only updated a JSON property (inStock=false, isQuoteOnly=true) or executed an UPDATE SQL query if Postgres was connected. There was no user-facing website or button state.',
        currentSolution:
          'Built full interactive e-commerce storefront with Product Detail Pages (PDP) and collection cards. When out-of-stock, the purchase module dynamically converts "Add to Cart" and "Buy Now" to disabled, high-contrast "Out of Stock" buttons with restock notification triggers.',
      },
      {
        requirement: '5. If product is NOT on website, add it to store catalog',
        repoStatus: 'FAIL',
        repoDetails:
          'In src/sync.ts, if ekoraMatch was null, the script did nothing and simply moved on to the next product. It had no mechanism to insert or catalog new products.',
        currentSolution:
          'Added automatic catalog intake pipeline: when an unmatched supplier product is detected, it is automatically formatted, assigned a unique ID, priced, and added to the store inventory.',
      },
      {
        requirement: '6. Use AI to categorize & normalize name (strip brand keywords & model numbers like JKB)',
        repoStatus: 'FAIL',
        repoDetails:
          'The repository had zero AI libraries and zero API integrations with Gemini or any LLM. package.json only included cheerio, pg, node-cron, and dotenv.',
        currentSolution:
          'Integrated Gemini 3.8 Flash via @google/genai SDK server-side. Cleans messy supplier titles into professional storefront titles, assigns standardized e-commerce categories, and writes feature bullets and tags.',
      },
      {
        requirement: '7. Add 40% profit margin to the original retail price',
        repoStatus: 'FAIL',
        repoDetails:
          'The repository completely omitted price extraction from the Jindeal DOM. There was no retail price field or margin calculation formula anywhere in the codebase.',
        currentSolution:
          'Added price extraction from WooCommerce markup and automated pricing engine: sellingPrice = Math.round(originalRetailPrice * 1.40). Displays retail supplier price, 40% markup, and resulting profit breakdown.',
      },
    ],
  };
}
