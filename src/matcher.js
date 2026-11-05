"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanBrandPrefix = cleanBrandPrefix;
exports.normalizeCore = normalizeCore;
exports.extractModelCode = extractModelCode;
exports.getEkoraModelCode = getEkoraModelCode;
exports.findEkoraMatch = findEkoraMatch;
function cleanBrandPrefix(title) {
    return title
        .replace(/\b(VEDINI|JINDEAL|VEDINI INC|JINDEAL INC|BY JINDEAL|BY VEDINI)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[-–—:|,\s]+|[-–—:|,\s]+$/g, '');
}
function normalizeCore(title) {
    return cleanBrandPrefix(title)
        .toUpperCase()
        .replace(/\b(JKB-?\d+|JK-?\d+)\b/gi, '')
        .replace(/[^A-Z0-9]/g, '');
}
function extractModelCode(str) {
    if (!str)
        return null;
    const match = str.match(/\b(JKB|JK)[-\s]?(\d+)\b/i) || str.match(/(?:mold|mould)?(jkb|jk)[-\s]?(\d+)/i);
    return match ? (match[1].toUpperCase() + match[2]) : null;
}
function getEkoraModelCode(product) {
    if (!product)
        return null;
    const fromName = extractModelCode(product.name || '');
    if (fromName)
        return fromName;
    if (Array.isArray(product.tags)) {
        for (const tag of product.tags) {
            const fromTag = extractModelCode(tag);
            if (fromTag)
                return fromTag;
        }
    }
    return null;
}
function findEkoraMatch(jp, ekoraByModel, ekoraByTitle) {
    const jpModel = extractModelCode(jp.jindealTitle);
    if (jpModel) {
        // Exact model code match takes highest priority
        if (ekoraByModel.has(jpModel)) {
            return ekoraByModel.get(jpModel);
        }
        // If Jindeal has a model code, but Ekora doesn't have THAT code:
        // Check if title matches, but ensure the Ekora product does NOT have a conflicting model code
        const normTitle = normalizeCore(jp.jindealTitle);
        const candidate = ekoraByTitle.get(normTitle);
        if (candidate) {
            const candidateModel = getEkoraModelCode(candidate);
            if (candidateModel && candidateModel !== jpModel) {
                // Different model codes, do not match!
                return null;
            }
            return candidate;
        }
        return null;
    }
    // Jindeal item has no model code: fallback to title match
    const normTitle = normalizeCore(jp.jindealTitle);
    return ekoraByTitle.get(normTitle) || null;
}
