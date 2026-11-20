import prisma from './db.ts';
import { cleanBrandPrefix, extractModelCode } from './matcher.ts';

// Closed list of Ekora Bazaar's 38 Canonical Categories
export const CANONICAL_CATEGORIES = [
  'Eco-Resin & Stone Moulds',
  'Culinary & Fondant Moulds',
  'General Silicone Moulds',
  'Candle & Pillar Moulds',
  'Soap & Bar Moulds',
  'Candle Jars & Containers',
  'Attar & Perfume Bottles',
  'Cosmetic Jars & Bottles',
  'Packaging Boxes & Mailers',
  'Lids, Caps & Closures',
  'Metal Containers & Tins',
  'Diffuser Bottles & Accessories',
  'Studio Equipment',
  'Soap Making Tools',
  'Wick Systems & Hardware',
  'Micas & Pigments',
  'Essential Oils',
  'Fragrance Oils',
  'Candle Waxes & Additives',
  'Raw Butters & Carrier Oils',
  'Skin Safe Fragrances',
  'Hydrosols & Floral Waters',
  'Artisan Soap Bases',
  'Skincare & Body Bases',
  'Cosmetic Preservatives & Chemicals',
  'Food-Grade Flavor Oils',
  'Body & Facial Scrubs',
  'Haircare & Wash Bases',
  'Dried Botanicals & Additives',
  'Stickers & Labels',
  'Gift Bags & Pouches',
  'Packaging & Containers',
  'Silicone & Baking Molds',
  'Candle & Soap Making',
  'Resin & Concrete Craft',
  'Festive & Holiday Molds',
  'Cake & Chocolate Decorating',
  'Storage & Trays',
] as const;

export type CanonicalCategory = typeof CANONICAL_CATEGORIES[number];

// Cached mapping of category name/slug to DB ID
let categoryCache: Map<string, { id: string; name: string; slug: string }> | null = null;

export async function getCategoryMap(): Promise<Map<string, { id: string; name: string; slug: string }>> {
  if (categoryCache && categoryCache.size > 0) {
    return categoryCache;
  }
  const dbCategories = await prisma.category.findMany();
  categoryCache = new Map();
  for (const c of dbCategories) {
    categoryCache.set(c.name.toLowerCase(), c);
    categoryCache.set(c.slug.toLowerCase(), c);
  }
  return categoryCache;
}

/**
 * USER MANDATORY CONSTRAINT:
 * "dont add any new fragrance oil or wax"
 * Returns true if the scraped item is any form of fragrance oil, perfume oil, aroma oil, or candle wax.
 */
export function isFragranceOilOrWax(item: {
  title: string;
  handle?: string | null;
  tags?: string[];
  productType?: string | null;
}): boolean {
  const combinedText = [
    item.title || '',
    item.handle || '',
    item.productType || '',
    ...(item.tags || []),
  ]
    .join(' ')
    .toLowerCase();

  // Patterns indicating fragrance oils, aroma oils, scent oils, perfume oils
  const fragrancePatterns = [
    /\bfragrance\s*oil\b/,
    /\bfragrance\b/,
    /\bperfume\s*oil\b/,
    /\baroma\s*oil\b/,
    /\bscent\s*oil\b/,
    /\bflavor\s*oil\b/,
    /\bflavour\s*oil\b/,
    /\bessential\s*oil\b/,
    /\battar\s*oil\b/,
  ];

  // Patterns indicating wax or wax additives
  const waxPatterns = [
    /\bsoya?\s*wax\b/,
    /\bsoy\s*wax\b/,
    /\bbeeswax\b/,
    /\bparaffin\b/,
    /\bgel\s*wax\b/,
    /\bpalm\s*wax\b/,
    /\bcoconut\s*wax\b/,
    /\bcandle\s*wax\b/,
    /\bmicrocrystalline\s*wax\b/,
    /\bwax\s*pellets\b/,
    /\bwax\s*flakes\b/,
    /\bwax\s*slab\b/,
    /\bwax\s*blend\b/,
    /\braw\s*wax\b/,
    /\bhard\s*wax\b/,
  ];

  for (const p of fragrancePatterns) {
    if (p.test(combinedText)) return true;
  }

  for (const p of waxPatterns) {
    if (p.test(combinedText)) return true;
  }

  // Standalone word check for 'wax' (making sure not to false-positive on 'wick' or 'mould')
  if (/\bwax\b/.test(combinedText) && !combinedText.includes('mould') && !combinedText.includes('mold') && !combinedText.includes('tin')) {
    return true;
  }

  return false;
}

export interface ClassificationResult {
  categoryName: CanonicalCategory;
  categorySlug: string;
  categoryId?: string;
  confidence: 'HIGH' | 'LOW' | 'UNCLASSIFIED';
  status: 'CLASSIFIED' | 'NEEDS_REVIEW';
  reason: string;
}

/**
 * Strict hierarchical classification against the 38 canonical categories.
 */
export async function classifyProduct(item: {
  title: string;
  handle?: string | null;
  tags?: string[];
  productType?: string | null;
}): Promise<ClassificationResult> {
  const catMap = await getCategoryMap();
  const text = [item.title || '', item.handle || '', item.productType || '', ...(item.tags || [])]
    .join(' ')
    .toLowerCase();

  const titleLower = (item.title || '').toLowerCase();

  let targetCategory: CanonicalCategory = 'General Silicone Moulds';
  let confidence: 'HIGH' | 'LOW' | 'UNCLASSIFIED' = 'LOW';
  let status: 'CLASSIFIED' | 'NEEDS_REVIEW' = 'NEEDS_REVIEW';
  let reason = 'Default fallback';

  // 1. Metal Containers & Tins (e.g. tin-sliding-containers-lbc001-to-lbc005, aluminum tins)
  if (
    titleLower.includes('tin') ||
    titleLower.includes('metal container') ||
    titleLower.includes('sliding container') ||
    titleLower.includes('tin canister') ||
    titleLower.includes('aluminum tin') ||
    titleLower.includes('aluminium tin')
  ) {
    targetCategory = 'Metal Containers & Tins';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched metal tin container keywords';
  }
  // 2. Candle Jars & Glass Containers
  else if (
    titleLower.includes('candle jar') ||
    titleLower.includes('glass jar') ||
    titleLower.includes('amber jar') ||
    titleLower.includes('frosted jar') ||
    titleLower.includes('candle tumbler') ||
    titleLower.includes('concrete jar')
  ) {
    targetCategory = 'Candle Jars & Containers';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched candle jar keywords';
  }
  // 3. Attar & Perfume Bottles
  else if (
    titleLower.includes('attar bottle') ||
    titleLower.includes('perfume bottle') ||
    titleLower.includes('roll on') ||
    titleLower.includes('dropper bottle') ||
    titleLower.includes('cologne bottle')
  ) {
    targetCategory = 'Attar & Perfume Bottles';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched perfume/attar bottle keywords';
  }
  // 4. Diffuser Bottles & Accessories
  else if (
    titleLower.includes('diffuser') ||
    titleLower.includes('reed stick') ||
    titleLower.includes('car diffuser') ||
    titleLower.includes('diffuser bottle')
  ) {
    targetCategory = 'Diffuser Bottles & Accessories';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched diffuser keywords';
  }
  // 5. Wick Systems & Hardware
  else if (
    titleLower.includes('wick') ||
    titleLower.includes('sustainer') ||
    titleLower.includes('wick holder') ||
    titleLower.includes('wick sticker') ||
    titleLower.includes('wick trimmer')
  ) {
    targetCategory = 'Wick Systems & Hardware';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched candle wick hardware keywords';
  }
  // 6. Packaging Boxes & Mailers
  else if (
    titleLower.includes('box') ||
    titleLower.includes('mailer') ||
    titleLower.includes('corrugated') ||
    titleLower.includes('carton') ||
    titleLower.includes('kraft box')
  ) {
    targetCategory = 'Packaging Boxes & Mailers';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched packaging box keywords';
  }
  // 7. Lids, Caps & Closures
  else if (
    titleLower.includes('lid') ||
    titleLower.includes('cap') ||
    titleLower.includes('closure') ||
    titleLower.includes('cork stopper')
  ) {
    targetCategory = 'Lids, Caps & Closures';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched lid/closure keywords';
  }
  // 8. Soap Making Tools
  else if (
    titleLower.includes('soap cutter') ||
    titleLower.includes('soap beveler') ||
    titleLower.includes('soap stamp') ||
    titleLower.includes('soap slicer')
  ) {
    targetCategory = 'Soap Making Tools';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched soap tool keywords';
  }
  // 9. Micas & Pigments
  else if (
    titleLower.includes('mica') ||
    titleLower.includes('pigment') ||
    titleLower.includes('colorant') ||
    titleLower.includes('glitter')
  ) {
    targetCategory = 'Micas & Pigments';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched mica/pigment keywords';
  }
  // 10. Dried Botanicals & Additives
  else if (
    titleLower.includes('botanical') ||
    titleLower.includes('dried rose') ||
    titleLower.includes('lavender bud') ||
    titleLower.includes('flower petal') ||
    titleLower.includes('jasmine bud')
  ) {
    targetCategory = 'Dried Botanicals & Additives';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched dried botanical keywords';
  }
  // 11. Gift Bags & Pouches
  else if (
    titleLower.includes('pouch') ||
    titleLower.includes('gift bag') ||
    titleLower.includes('organza') ||
    titleLower.includes('potli') ||
    titleLower.includes('jute bag')
  ) {
    targetCategory = 'Gift Bags & Pouches';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched gift bag/pouch keywords';
  }
  // 12. Stickers & Labels
  else if (
    titleLower.includes('sticker') ||
    titleLower.includes('label') ||
    titleLower.includes('warning label') ||
    titleLower.includes('candle safety')
  ) {
    targetCategory = 'Stickers & Labels';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched sticker/label keywords';
  }
  // 13. Festive & Holiday Molds
  else if (
    titleLower.includes('christmas') ||
    titleLower.includes('santa') ||
    titleLower.includes('elk') ||
    titleLower.includes('tree') ||
    titleLower.includes('halloween') ||
    titleLower.includes('diwali') ||
    titleLower.includes('easter') ||
    titleLower.includes('valentine') ||
    titleLower.includes('snow') ||
    titleLower.includes('pumpkin')
  ) {
    targetCategory = 'Festive & Holiday Molds';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched holiday/festive keywords';
  }
  // 14. Candle & Pillar Moulds
  else if (
    (titleLower.includes('candle') || titleLower.includes('pillar') || titleLower.includes('bubble')) &&
    (titleLower.includes('mould') || titleLower.includes('mold'))
  ) {
    targetCategory = 'Candle & Pillar Moulds';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched candle mould keywords';
  }
  // 15. Soap & Bar Moulds
  else if (
    titleLower.includes('soap') &&
    (titleLower.includes('mould') || titleLower.includes('mold') || titleLower.includes('cavity') || titleLower.includes('bar'))
  ) {
    targetCategory = 'Soap & Bar Moulds';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched soap mould keywords';
  }
  // 16. Culinary & Fondant Moulds / Cake & Chocolate Decorating
  else if (
    titleLower.includes('fondant') ||
    titleLower.includes('chocolate') ||
    titleLower.includes('candy') ||
    titleLower.includes('cake') ||
    titleLower.includes('baking') ||
    titleLower.includes('cupcake')
  ) {
    targetCategory = 'Culinary & Fondant Moulds';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched confectionery/culinary keywords';
  }
  // 17. Eco-Resin & Stone Moulds / Storage & Trays
  else if (
    titleLower.includes('tray') ||
    titleLower.includes('plate') ||
    titleLower.includes('coaster') ||
    titleLower.includes('dish') ||
    titleLower.includes('platter')
  ) {
    targetCategory = 'Storage & Trays';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched tray/dish/coaster storage keywords';
  }
  else if (
    titleLower.includes('resin') ||
    titleLower.includes('jesmonite') ||
    titleLower.includes('concrete') ||
    titleLower.includes('cement')
  ) {
    targetCategory = 'Eco-Resin & Stone Moulds';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Matched resin/concrete craft keywords';
  }
  // 18. General Silicone Moulds (generic mould)
  else if (titleLower.includes('mould') || titleLower.includes('mold') || titleLower.includes('silicone')) {
    targetCategory = 'General Silicone Moulds';
    confidence = 'HIGH';
    status = 'CLASSIFIED';
    reason = 'Generic silicone mould keyword';
  } else {
    // Unsure: Needs human admin review
    targetCategory = 'General Silicone Moulds';
    confidence = 'LOW';
    status = 'NEEDS_REVIEW';
    reason = 'Ambiguous product text; routed to admin review';
  }

  // Lookup DB ID
  const entry = catMap.get(targetCategory.toLowerCase());
  const slug = entry ? entry.slug : targetCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return {
    categoryName: targetCategory,
    categorySlug: slug,
    categoryId: entry?.id,
    confidence,
    status,
    reason,
  };
}
