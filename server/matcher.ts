import { StoreProduct, ScrapedSupplierProduct } from './types.ts';

// Clean out brand keywords like Vedini or Jindeal
export function cleanBrandPrefix(title: string): string {
  if (!title) return '';
  return title
    .replace(/\b(VEDINI\s+INC|JINDEAL\s+INC|BY\s+JINDEAL|BY\s+VEDINI|VEDINI|JINDEAL)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-–—:|,\s]+|[-–—:|,\s]+$/g, '');
}

// Extract model codes such as JKB-3669, JKB3669, JK-12, etc. Standardized to alphanumeric (e.g. JKB3669)
export function extractModelCode(str: string): string | null {
  if (!str) return null;
  const match =
    str.match(/\b(JKB|JK)[-\s]?(\d{1,6})\b/i) ||
    str.match(/(?:mold|mould)[-\s]*(jkb|jk)[-\s]?(\d{1,6})/i) ||
    str.match(/^(?:jkb|jk)[-_]?(\d{1,6})$/i);
  return match ? `${match[1].toUpperCase()}${match[2]}` : null;
}

// Extract model code from Ekora product (checks modelCode, tags, and title)
export function getEkoraModelCode(product: any): string | null {
  if (!product) return null;
  if (product.modelCode) {
    const code = extractModelCode(product.modelCode);
    if (code) return code;
  }
  if (product.tags && Array.isArray(product.tags)) {
    for (const tag of product.tags) {
      const code = extractModelCode(String(tag));
      if (code) return code;
    }
  }
  return extractModelCode(product.title || product.name || '');
}

// Normalize text for comparison: remove brands, model codes, and all non-alphanumeric chars
export function normalizeCore(title: string): string {
  if (!title) return '';
  return cleanBrandPrefix(title)
    .toUpperCase()
    .replace(/\b(JKB-?\d+|JK-?\d+)\b/gi, '')
    .replace(/[^A-Z0-9]/g, '');
}

// Tokenize title into meaningful keywords for fuzzy scoring
export function tokenize(str: string): Set<string> {
  const stopWords = new Set(['AND', 'OF', 'FOR', 'WITH', 'THE', 'IN', 'ON', 'A', 'AN', 'SET', 'PCS', 'PIECE', 'PIECES']);
  const clean = cleanBrandPrefix(str)
    .toUpperCase()
    .replace(/\b(JKB-?\d+|JK-?\d+)\b/gi, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = clean
    .split(/\s+/)
    .filter(token => token.length > 1 && !stopWords.has(token));
  return new Set(tokens);
}

// Token Set overlap similarity (Jaccard / Dice hybrid)
export function tokenSetSimilarity(str1: string, str2: string): number {
  const set1 = tokenize(str1);
  const set2 = tokenize(str2);
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const token of set1) {
    if (set2.has(token)) {
      intersection++;
    } else {
      // Partial prefix/stem match (e.g., "SILICONE" vs "SILICON", "MOULD" vs "MOLD")
      for (const t2 of set2) {
        if (
          (token.startsWith(t2) || t2.startsWith(token)) &&
          Math.min(token.length, t2.length) >= 4
        ) {
          intersection += 0.85;
          break;
        }
      }
    }
  }

  // Dice coefficient: 2 * |A ∩ B| / (|A| + |B|)
  return (2 * intersection) / (set1.size + set2.size);
}

// Standard Levenshtein Distance for fuzzy string similarity
export function levenshteinDistance(s1: string, s2: string): number {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function stringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeCore(str1);
  const s2 = normalizeCore(str2);
  if (!s1 && !s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1 === s2) return 1.0;

  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  const levSim = Math.max(0, (maxLen - distance) / maxLen);
  const tokenSim = tokenSetSimilarity(str1, str2);

  // Weight token set higher for product titles because word order can vary
  return Math.round((tokenSim * 0.7 + levSim * 0.3) * 100) / 100;
}

export interface MatchResult {
  match: StoreProduct | null;
  score: number;
  matchType: 'model_exact' | 'fuzzy_title' | 'none';
  reason: string;
}

export interface CatalogIndex {
  byModel: Map<string, StoreProduct>;
  byTitle: Map<string, StoreProduct>;
  items: { product: StoreProduct; model: string | null; normTitle: string; tokens: Set<string> }[];
}

export function buildCatalogIndex(catalog: StoreProduct[]): CatalogIndex {
  const byModel = new Map<string, StoreProduct>();
  const byTitle = new Map<string, StoreProduct>();
  const items: { product: StoreProduct; model: string | null; normTitle: string; tokens: Set<string> }[] = [];

  for (const p of catalog) {
    const model = getEkoraModelCode(p);
    if (model) {
      byModel.set(model, p);
    }
    const normTitle = normalizeCore(p.title);
    if (normTitle) {
      byTitle.set(normTitle, p);
    }
    items.push({
      product: p,
      model,
      normTitle,
      tokens: tokenize(p.title),
    });
  }

  return { byModel, byTitle, items };
}

export function findFastStoreMatch(
  scraped: ScrapedSupplierProduct,
  index: CatalogIndex
): MatchResult {
  const scrapedModel = extractModelCode(scraped.modelCode || scraped.rawTitle);

  // 1. Exact Model Code Match O(1) - 100% confidence
  if (scrapedModel && index.byModel.has(scrapedModel)) {
    return {
      match: index.byModel.get(scrapedModel)!,
      score: 1.0,
      matchType: 'model_exact',
      reason: `Exact model code matched (${scrapedModel})`,
    };
  }

  // 2. Normalized Core Title Match O(1) - 99% confidence
  const scrapedNorm = normalizeCore(scraped.rawTitle);
  if (scrapedNorm && index.byTitle.has(scrapedNorm)) {
    const candidate = index.byTitle.get(scrapedNorm)!;
    const candidateModel = getEkoraModelCode(candidate);
    if (!scrapedModel || !candidateModel || scrapedModel === candidateModel) {
      return {
        match: candidate,
        score: 0.99,
        matchType: 'fuzzy_title',
        reason: 'Identical normalized core title',
      };
    }
  }

  // 3. Fast-pruned Fuzzy Match (only if sharing words and not colliding on model)
  let bestScore = 0;
  let bestProduct: StoreProduct | null = null;

  for (const item of index.items) {
    if (scrapedModel && item.model && scrapedModel !== item.model) continue;

    // Fast token pre-filter: check if token overlap is substantial (>= 60%)
    const tokenSim = tokenSetSimilarity(scraped.rawTitle, item.product.title);
    if (tokenSim < 0.6) continue;

    const similarity = stringSimilarity(scraped.rawTitle, item.product.title);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestProduct = item.product;
    }
  }

  if (bestProduct && bestScore >= 0.65) {
    return {
      match: bestProduct,
      score: bestScore,
      matchType: 'fuzzy_title',
      reason: `Fuzzy title match with ${(bestScore * 100).toFixed(0)}% confidence`,
    };
  }

  return {
    match: null,
    score: bestScore,
    matchType: 'none',
    reason:
      bestScore > 0
        ? `Similarity ${Math.round(bestScore * 100)}% below 65% match threshold`
        : 'No similar title found in catalog',
  };
}

export function findBestStoreMatch(
  scraped: ScrapedSupplierProduct,
  catalog: StoreProduct[]
): MatchResult {
  const index = buildCatalogIndex(catalog);
  return findFastStoreMatch(scraped, index);
}
