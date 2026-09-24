"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanBrandPrefix = cleanBrandPrefix;
exports.normalizeCore = normalizeCore;
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
