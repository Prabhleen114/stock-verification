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

  // Extract model code prefix
  const modelCode = extractModelCode(item.title || '');
  let prefix = '';
  if (modelCode) {
    const pMatch = modelCode.match(/^([A-Za-z]+)/);
    if (pMatch) prefix = pMatch[1].toUpperCase();
  }

  // 1. Direct SKU prefix checks
  if (prefix === 'FO' && !combinedText.includes('foil')) {
    return true;
  }
  if (prefix === 'CX' && (combinedText.includes('wax') || combinedText.includes('flakes'))) {
    return true;
  }

  // 2. Patterns indicating fragrance oils, aroma oils, scent oils, perfume oils
  const fragrancePatterns = [
    /\bfragrances?\s*oils?\b/,
    /\bfragrances?\b/,
    /\bperfumes?\s*oils?\b/,
    /\baromas?\s*oils?\b/,
    /\bscents?\s*oils?\b/,
    /\battars?\s*oils?\b/,
  ];

  // 3. Patterns indicating raw wax or wax additives
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
    if (p.test(combinedText) && !combinedText.includes('skin safe') && !combinedText.includes('mould') && !combinedText.includes('mold') && !combinedText.includes('foil')) {
      return true;
    }
  }

  for (const p of waxPatterns) {
    if (p.test(combinedText) && !combinedText.includes('mould') && !combinedText.includes('mold') && !combinedText.includes('tin') && !combinedText.includes('melter') && !combinedText.includes('heater')) {
      return true;
    }
  }

  // Standalone word check for 'wax' (making sure not to false-positive on 'mould', 'mold', 'tin', 'melter', 'heater')
  if (
    /\bwax\b/.test(combinedText) &&
    !combinedText.includes('mould') &&
    !combinedText.includes('mold') &&
    !combinedText.includes('tin') &&
    !combinedText.includes('melter') &&
    !combinedText.includes('heater')
  ) {
    return true;
  }

  return false;
}

/**
 * Detects whether a product title represents a multi-pack or bundle listing
 * where volume tier wholesale discounts must be disabled (noBulkTiers: true).
 */
export function detectMultiPack(title: string): { noBulkTiers: boolean; reason?: string } {
  const t = title.trim();

  // Explicit single piece exclusions (e.g. "- 1", "- 1 Pcs", "Single PCS", "1 Pcs", "1 Pc")
  if (
    /(?:-\s*1\s*(?:pcs?|piece)?$)/i.test(t) ||
    /(?:\|\s*1\s*(?:pcs?|piece)$)/i.test(t) ||
    /\bsingle\s*pcs?\b/i.test(t) ||
    /\b1\s*(?:pcs?|piece)\s*$/i.test(t)
  ) {
    if (!/\bpack\s*of\s*[2-9]\d*\b/i.test(t) && !/\bset\s*of\s*[2-9]\d*\b/i.test(t)) {
      return { noBulkTiers: false };
    }
  }

  // Trailing quantity bundle (- 5, - 10, - 25, - 50, - 100, - 500, etc.)
  const trailingDashMatch = t.match(/-\s*([2-9]|\d{2,5})\s*(?:pcs?|pieces?|strip|strips)?\s*$/i);
  if (trailingDashMatch) {
    return { noBulkTiers: true, reason: `Trailing quantity bundle (- ${trailingDashMatch[1]})` };
  }

  // Pack of X (X > 1)
  const packOfMatch = t.match(/\bpack\s*(?:of)?\s*([2-9]|\d{2,5})\s*(?:pcs?|pieces?)?\b/i);
  if (packOfMatch) {
    return { noBulkTiers: true, reason: `Pack of ${packOfMatch[1]}` };
  }

  // Set of X (X > 1)
  const setOfMatch = t.match(/\bset\s*of\s*([2-9]|\d{2,5})\s*(?:pcs?|pieces?|pc)?\b/i);
  if (setOfMatch) {
    return { noBulkTiers: true, reason: `Set of ${setOfMatch[1]}` };
  }

  // X pcs / pieces (X > 1)
  const pcsMatch = t.match(/\b([2-9]|\d{2,5})\s*(?:pcs|pieces|pc)\b/i);
  if (pcsMatch) {
    return { noBulkTiers: true, reason: `${pcsMatch[1]} pcs / pieces` };
  }

  // Combo
  if (/\bcombo\b/i.test(t)) {
    return { noBulkTiers: true, reason: 'Combo bundle' };
  }

  return { noBulkTiers: false };
}

export interface ClassificationResult {
  categoryName: CanonicalCategory;
  categorySlug: string;
  categoryId?: string;
  confidence: 'HIGH' | 'LOW' | 'UNCLASSIFIED';
  status: 'CLASSIFIED' | 'NEEDS_REVIEW';
  reason: string;
  isSafetyRejection?: boolean;
  rejectionReason?: string;
  noBulkTiers?: boolean;
  multiPackReason?: string;
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
  const title = item.title || '';
  const titleLower = title.toLowerCase();
  const textAll = [title, item.handle || '', item.productType || '', ...(item.tags || [])]
    .join(' ')
    .toLowerCase();

  const multiPack = detectMultiPack(title);

  // Extract model code prefix
  const modelCode = extractModelCode(title);
  let prefix = '';
  if (modelCode) {
    const pMatch = modelCode.match(/^([A-Za-z]+)/);
    if (pMatch) prefix = pMatch[1].toUpperCase();
  }
  if (!prefix) {
    const rawMatch = title.match(/\b([A-Za-z]{2,5})\s*(\d{2,5}[a-zA-Z]?)\b/);
    if (rawMatch) prefix = rawMatch[1].toUpperCase();
  }

  let targetCategory: CanonicalCategory = 'General Silicone Moulds';
  let confidence: 'HIGH' | 'LOW' | 'UNCLASSIFIED' = 'HIGH';
  let status: 'CLASSIFIED' | 'NEEDS_REVIEW' = 'CLASSIFIED';
  let reason = 'Matched classification rules';
  let isSafetyRejection = false;
  let rejectionReason: string | undefined = undefined;

  // 1. SAFETY CHECK: Fragrance oils & Waxes
  if (isFragranceOilOrWax(item)) {
    targetCategory = (textAll.includes('wax') || textAll.includes('flakes')) ? 'Candle Waxes & Additives' : 'Fragrance Oils';
    confidence = 'HIGH';
    status = 'NEEDS_REVIEW';
    isSafetyRejection = true;
    rejectionReason = 'Product Safety Violation: Fragrance Oil / Candle Wax prohibited from intake';
    reason = 'Safety Violation';
  }
  // 2. Food-Grade Flavor Oils
  else if (
    prefix === 'LSF' ||
    (/\b(flavour|flavor)s?\b/i.test(titleLower) && /\b(lip\s*balm|lipstick|edible|food\s*grade)\b/i.test(titleLower))
  ) {
    targetCategory = 'Food-Grade Flavor Oils';
    reason = 'Matched lip safe flavor oil keywords';
  }
  // 3. Artisan Soap Bases
  else if (
    prefix === 'SPB' ||
    prefix === 'SSB' ||
    /\bsoap\s*base\b/i.test(titleLower) ||
    (/\bmelt\s*(?:&|and)\s*pour\b/i.test(titleLower) && !titleLower.includes('mould') && !titleLower.includes('mold'))
  ) {
    targetCategory = 'Artisan Soap Bases';
    reason = 'Matched soap base keywords';
  }
  // 4. Haircare & Wash Bases
  else if (
    prefix === 'LB' ||
    /\b(shampoo\s*base|wash\s*base|body\s*wash\s*base|face\s*wash\s*base)\b/i.test(titleLower)
  ) {
    targetCategory = 'Haircare & Wash Bases';
    reason = 'Matched wash/shampoo base keywords';
  }
  // 5. Body & Facial Scrubs
  else if (
    /\bscrub\b/i.test(titleLower) && !titleLower.includes('mould') && !titleLower.includes('mold')
  ) {
    targetCategory = 'Body & Facial Scrubs';
    reason = 'Matched scrub keywords';
  }
  // 6. Hydrosols & Floral Waters
  else if (
    /\b(rose\s*water|hydrosol|floral\s*water)\b/i.test(titleLower)
  ) {
    targetCategory = 'Hydrosols & Floral Waters';
    reason = 'Matched hydrosol/rose water keywords';
  }
  // 7. Skincare & Body Bases
  else if (
    prefix === 'LGB' ||
    /\b(aloe\s*vera\s*gel|alovera\s*gel|lip\s*gloss\s*base|cream\s*base|lotion\s*base|cleansing\s*milk|moisturizing\s*cream|glycerin)\b/i.test(titleLower)
  ) {
    targetCategory = 'Skincare & Body Bases';
    reason = 'Matched skincare base keywords';
  }
  // 8. Raw Butters & Carrier Oils
  else if (
    prefix === 'BT' ||
    prefix === 'CO' ||
    /\b(carrier\s*oil|kokum\s*butter|shea\s*butter|cocoa\s*butter|mango\s*butter)\b/i.test(titleLower) ||
    (/\b(jojoba|avocado|almond|argan|castor|hemp\s*seed|apricot\s*kernel|rosehip|olive|grapeseed)\s*oil\b/i.test(titleLower) && !titleLower.includes('fragrance'))
  ) {
    targetCategory = 'Raw Butters & Carrier Oils';
    reason = 'Matched carrier oil or raw butter keywords';
  }
  // 9. Essential Oils
  else if (
    prefix === 'EO' ||
    /\bessential\s*oil\b/i.test(titleLower)
  ) {
    targetCategory = 'Essential Oils';
    reason = 'Matched essential oil keywords';
  }
  // 10. Cosmetic Preservatives & Chemicals
  else if (
    prefix === 'CH' ||
    prefix === 'ABP' ||
    /\b(phenoxyethanol|salicylic\s*acid|hyaluronic\s*acid|cyclopentasiloxane|polysorbate|denatured\s*ethanol|perfume\s*solvent|fixative|glycol|dimethicone|vitamin\s*e\s*oil)\b/i.test(titleLower)
  ) {
    targetCategory = 'Cosmetic Preservatives & Chemicals';
    reason = 'Matched cosmetic chemical/solvent keywords';
  }
  // 11. Dried Botanicals & Additives
  else if (
    prefix === 'PW' ||
    prefix === 'DP' ||
    prefix === 'ADF' ||
    prefix === 'CL' ||
    prefix === 'CRM' ||
    /\b(dried\s*flower|dried\s*petal|rose\s*petal|lavender\s*bud|butterfly\s*pea|hibiscus\s*petal|jasmine\s*bud|botanical|kaolin\s*clay|bentonite\s*clay|calamine\s*clay|multani\s*mitti|amla\s*powder|neem\s*powder|reetha|shikakai|bhringraj|brahmi|mulethi|ashwagandha|ubtan|menthol\s*crystal)\b/i.test(titleLower)
  ) {
    targetCategory = 'Dried Botanicals & Additives';
    reason = 'Matched dried botanical/clay/powder keywords';
  }
  // 12. Micas & Pigments
  else if (
    ['LC', 'CP', 'CC', 'ACP', 'ACF', 'ARC', 'OC', 'LSC', 'GDC', 'MD', 'CWD'].includes(prefix) ||
    /\b(mica|pigment|powder\s*colou?rs?|candle\s*colou?rs?|soap\s*colou?rs?|liquid\s*colou?rs?|neon\s*colou?rs?|fluorescent\s*colou?rs?|radium\s*colou?r|tempera|acrylic\s*colou?rs?|resin\s*colou?rs?|glitter|wax\s*dye|concrete\s*colou?rs?|conceret\s*colou?rs?|gold\s*dust)\b/i.test(titleLower) ||
    ((titleLower.includes('color') || titleLower.includes('colour')) && (titleLower.includes('acrylic') || titleLower.includes('pearl') || titleLower.includes('powder') || titleLower.includes('liquid') || titleLower.includes('shade kit') || titleLower.includes('conceret') || titleLower.includes('concrete')))
  ) {
    targetCategory = 'Micas & Pigments';
    reason = 'Matched colorant/mica/pigment keywords';
  }
  // 13. Wick Systems & Hardware
  else if (
    /\b(wick|sustainer|wick\s*holder|wick\s*sticker|wick\s*trimmer|wooden\s*wick|cotton\s*wick)\b/i.test(titleLower)
  ) {
    targetCategory = 'Wick Systems & Hardware';
    reason = 'Matched candle wick hardware keywords';
  }
  // 14. Stickers & Labels
  else if (
    /\b(warning\s*label|candle\s*safety|safety\s*sticker|label\s*sticker|sticker\s*sheet)\b/i.test(titleLower)
  ) {
    targetCategory = 'Stickers & Labels';
    reason = 'Matched sticker/label keywords';
  }
  // 15. Soap Making Tools
  else if (
    prefix === 'SC' ||
    prefix === 'LO' ||
    /\b(soap\s*cutter|soap\s*beveler|soap\s*stamp|soap\s*slicer|wooden\s*cutter|loofah)\b/i.test(titleLower)
  ) {
    targetCategory = 'Soap Making Tools';
    reason = 'Matched soap tool keywords';
  }
  // 16. Studio Equipment
  else if (
    prefix === 'NT' ||
    prefix === 'PD' ||
    prefix === 'BBC' ||
    prefix === 'ACM' ||
    /bbco{1,2}\d+/i.test(titleLower) ||
    (prefix === 'ART' && !titleLower.includes('mould') && !titleLower.includes('mold') && !titleLower.includes('dia') && !titleLower.includes('bowl')) ||
    /\b(brush(?:es)?|stencil|spatula|thermometer|digital\s*scale|weight\s*scale|craft\s*knife|heat\s*gun|melter|stainless\s*steel\s*jug|aluminum\s*jug|long\s*spout\s*jug|dropper|pipette|extinguisher|snuffer|tongue\s*cleaner|comb|easel|mixing\s*stick|piping\s*bag|stroke\s*pen)\b/i.test(titleLower)
  ) {
    targetCategory = 'Studio Equipment';
    reason = 'Matched studio equipment/tool keywords';
  }
  // 17. Metal Containers & Tins
  else if (
    (/\b(tin|tins|sliding\s*container|aluminum\s*tin|metal\s*container|canister)\b/i.test(titleLower) && !titleLower.includes('mould') && !titleLower.includes('mold'))
  ) {
    targetCategory = 'Metal Containers & Tins';
    reason = 'Matched metal tin container keywords';
  }
  // 18. Attar & Perfume Bottles
  else if (
    /\b(attar\s*bottle|perfume\s*bottle|roll\s*on\s*bottle|cologne\s*bottle)\b/i.test(titleLower)
  ) {
    targetCategory = 'Attar & Perfume Bottles';
    reason = 'Matched perfume/attar bottle keywords';
  }
  // 19. Candle Jars & Containers
  else if (
    prefix === 'WC' ||
    prefix === 'WCT' ||
    /\b(candle\s*jar|candle\s*tumbler|candle\s*holder|wooden\s*candle\s*bowl|urli|tea\s*glass|ceramic\s*candle\s*holder|t-light|tealight|ceramic.*bowl|wooden\s*bowl|metal\s*diya|ceramic.*dia)\b/i.test(titleLower)
  ) {
    targetCategory = 'Candle Jars & Containers';
    reason = 'Matched candle vessel/jar/urli keywords';
  }
  // 20. Cosmetic Jars & Bottles
  else if (
    /\b(cream\s*jar|frosted\s*cream\s*jar|spray\s*mist|pet\s*bottle|hair\s*oil.*bottle|dropper\s*bottle|cosmetic\s*jar|cosmetic\s*bottle)\b/i.test(titleLower)
  ) {
    targetCategory = 'Cosmetic Jars & Bottles';
    reason = 'Matched cosmetic container keywords';
  }
  // 21. Diffuser Bottles & Accessories
  else if (
    /\b(diffuser|reed\s*stick|car\s*diffuser|aroma\s*nest)\b/i.test(titleLower)
  ) {
    targetCategory = 'Diffuser Bottles & Accessories';
    reason = 'Matched diffuser keywords';
  }
  // 22. Packaging Boxes & Mailers
  else if (
    prefix === 'BCB' ||
    /\b(corrugated|carton|mailer|kraft\s*box|packaging\s*box|gift\s*box|multi\s*purpose\s*box|window\s*box)\b/i.test(titleLower)
  ) {
    targetCategory = 'Packaging Boxes & Mailers';
    reason = 'Matched packaging box keywords';
  }
  // 23. Gift Bags & Pouches
  else if (
    prefix === 'BQN' ||
    /\b(pouch|gift\s*bag|organza|potli|jute\s*bag|bouquet\s*wrapping|mesh\s*net\s*fabric)\b/i.test(titleLower)
  ) {
    targetCategory = 'Gift Bags & Pouches';
    reason = 'Matched gift pouch/bag keywords';
  }
  // 24. Lids, Caps & Closures
  else if (
    /\b(lid|caps?|closure|cork\s*stopper)\b/i.test(titleLower) &&
    !titleLower.includes('mould') && !titleLower.includes('mold')
  ) {
    targetCategory = 'Lids, Caps & Closures';
    reason = 'Matched lid/closure keywords';
  }
  // 25. Packaging & Containers
  else if (
    prefix === 'PM' ||
    /\b(empty\s*paint\s*pots|honeycomb\s*roll|zip\s*lock|butter\s*paper|soap\s*cover|packaging\s*paper|packaging\s*rope|jute\s*rope)\b/i.test(titleLower)
  ) {
    targetCategory = 'Packaging & Containers';
    reason = 'Matched general packaging keywords';
  }
  // 26. Resin & Concrete Craft
  else if (
    prefix === 'SAC' ||
    prefix === 'AFF' ||
    prefix === 'ARA' ||
    prefix === 'ARR' ||
    prefix === 'AGG' ||
    prefix === 'SMB' ||
    prefix === 'AST' ||
    /\b(conceret\s*sealer|concrete\s*sealer|gypsum\s*powder|metallic\s*foil|varak|warak|craft\s*tape|glass\s*granuals|pearls\s*white|moti\s*100gram|pop\s*socket|keychain|evil\s*eye\s*beads|agate\s*ast|agate\s*stone|quartz\s*ast|conch\s*shell|wooden\s*slice|shell\s*pack)\b/i.test(titleLower)
  ) {
    targetCategory = 'Resin & Concrete Craft';
    reason = 'Matched resin/concrete craft raw materials';
  }
  // 27. Festive & Holiday Molds
  else if (
    /\b(diwali|ganesha?|ganpati|shree|lord\s*ganesh|laxmi|lakshmi|ram\s*mandir|modak|christmas|santa|xmas|elk|reindeer|snowflake|snowman|halloween|skull|pumpkin|ghost|witch|bat|easter|bunny|valentine|romantic|heart|cupid)\b/i.test(titleLower)
  ) {
    targetCategory = 'Festive & Holiday Molds';
    reason = 'Matched holiday/festive keywords';
  }
  // 28. Storage & Trays
  else if (
    /\b(tray|plate|dish|coaster|trinket\s*box|storage\s*jar|jewelry\s*dish|platter|bowl\s*mold|ashtray|palette|organizer\s*mold|container\s*mold)\b/i.test(titleLower) ||
    (/\bplain\s*round\s*\d+\b/i.test(titleLower) && prefix === 'ARM')
  ) {
    targetCategory = 'Storage & Trays';
    reason = 'Matched tray/coaster/storage vessel keywords';
  }
  // 29. Eco-Resin & Stone Moulds
  else if (
    prefix === 'ARM' ||
    /\b(planter|flower\s*pot|pot\s*mold|vase|jesmonite|concrete|cement|plaster|stone\s*mold|clock\s*mold|c\s*lock|agate\s*mould|agate\s*mold|bookend|pendent\s*mold|sphere\s*mold|bracelet\s*mold)\b/i.test(titleLower)
  ) {
    targetCategory = 'Eco-Resin & Stone Moulds';
    reason = 'Matched resin casting mould keywords';
  }
  // 30. Culinary & Fondant Moulds
  else if (
    prefix === 'CFM' ||
    prefix === 'CK' ||
    /\b(fondant|chocolate|candy|gummy|cupcake|baking|waffle|donut|ice\s*cream|popcorn|biscuit|cookie|berry|strawberry|fruit|fondant\s*mold|cake\s*decorating)\b/i.test(titleLower)
  ) {
    targetCategory = 'Culinary & Fondant Moulds';
    reason = 'Matched confectionery/culinary mould keywords';
  }
  // 31. Candle & Pillar Moulds
  else if (
    prefix === 'WCM' ||
    /\b(candle|pillar|taper|rib|swirl|cylinder|bubble|torso|bust|sculpture|wax\s*sachet|wax\s*melt|wick|flame|succulent|peony\s*flower|cactus\s*mould)\b/i.test(titleLower)
  ) {
    targetCategory = 'Candle & Pillar Moulds';
    reason = 'Matched candle mould keywords';
  }
  // 32. Soap & Bar Moulds
  else if (
    prefix === 'SSM' ||
    /\b(soap|bar\s*mould|bar\s*mold|massage\s*bar|lotion\s*bar|\d+g\s*mould|\d+g\s*mold)\b/i.test(titleLower)
  ) {
    targetCategory = 'Soap & Bar Moulds';
    reason = 'Matched soap mould keywords';
  }
  // 33. Generic Silicone Moulds fallback
  else if (/\b(mould|mold|silicone|silicon)\b/i.test(titleLower)) {
    targetCategory = 'General Silicone Moulds';
    confidence = 'LOW';
    status = 'NEEDS_REVIEW';
    reason = 'Generic silicone mould keyword';
  }
  // 34. Ambiguous fallback
  else {
    targetCategory = 'General Silicone Moulds';
    confidence = 'UNCLASSIFIED';
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
    isSafetyRejection,
    rejectionReason,
    noBulkTiers: multiPack.noBulkTiers,
    multiPackReason: multiPack.reason,
  };
}
