import React, { useState } from 'react';
import { Plus, Ban, Eye, Sparkles } from 'lucide-react';
import { StoreProduct } from '../types.ts';

interface StorefrontProps {
  products: StoreProduct[];
  onOpenProduct: (product: StoreProduct) => void;
  onQuickAddToCart: (product: StoreProduct) => void;
  onNavigateToCrawler: () => void;
  isSyncing: boolean;
}

export const Storefront: React.FC<StorefrontProps> = ({
  products,
  onOpenProduct,
  onQuickAddToCart,
  onNavigateToCrawler,
  isSyncing,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Categories list
  const categories = [
    'All',
    'Festive & Holiday Molds',
    'Silicone & Baking Molds',
    'Resin & Concrete Craft',
    'Candle & Soap Making',
    'Cake & Chocolate Decorating',
  ];

  const filteredProducts = products.filter(
    (p) => selectedCategory === 'All' || p.category === selectedCategory
  );

  const outOfStockCount = products.filter((p) => !p.inStock).length;
  const inStockCount = products.filter((p) => p.inStock).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-8 md:p-12 shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-md text-xs font-medium text-indigo-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Autonomous Stock Verification & Catalog Intake Engine</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold font-display tracking-tight text-white leading-tight">
            Curated Silicone Molds & Craft Supplies
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Live catalog synchronized with supplier inventory. Products marked out-of-stock on the supplier automatically disable purchase actions here. Uncataloged supplier items are ingested via Gemini AI with a standard 40% margin.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-300">
                <span className="font-semibold text-white tabular-nums">{inStockCount}</span> In Stock
              </span>
            </div>

            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span className="text-slate-300">
                <span className="font-semibold text-white tabular-nums">{outOfStockCount}</span> Out of Stock (UI Disabled)
              </span>
            </div>

            <button
              onClick={onNavigateToCrawler}
              className="px-4 py-2 bg-white text-slate-900 font-semibold rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {isSyncing ? 'Syncing...' : 'Open Crawler Engine'}
            </button>
          </div>
        </div>
      </div>

      {/* Category Segmented Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500 tabular-nums">
          Showing {filteredProducts.length} products
        </div>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            className={`group bg-white rounded-xl border transition-all duration-200 flex flex-col justify-between overflow-hidden relative ${
              product.inStock
                ? 'border-slate-200 hover:shadow-lg hover:-translate-y-0.5'
                : 'border-slate-200/80 bg-slate-50/50 opacity-95'
            }`}
          >
            {/* Image & Overlay */}
            <div
              onClick={() => onOpenProduct(product)}
              className="relative w-full pt-[85%] bg-slate-100 cursor-pointer overflow-hidden"
            >
              <img
                src={product.imageUrl}
                alt={product.title}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=600&q=80';
                }}
                className={`absolute inset-0 w-full h-full object-contain p-4 transition-transform duration-300 group-hover:scale-105 ${
                  !product.inStock ? 'grayscale-[40%]' : ''
                }`}
              />

              {/* Status Badge */}
              <div className="absolute top-3 left-3">
                {product.inStock ? (
                  <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50/90 backdrop-blur px-2 py-0.5 rounded border border-emerald-200/60 shadow-xs">
                    In Stock
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-rose-800 bg-rose-50/90 backdrop-blur px-2 py-0.5 rounded border border-rose-200 shadow-xs flex items-center gap-1">
                    <Ban className="w-3 h-3 text-rose-600" />
                    <span>Out of Stock</span>
                  </span>
                )}
              </div>

              {/* Source Indicator */}
              {product.source === 'jindeal_crawler' && (
                <div className="absolute top-3 right-3 text-[10px] font-semibold text-indigo-700 bg-indigo-50/90 backdrop-blur px-1.5 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                  <span>AI Ingested</span>
                </div>
              )}

              {/* Quick View Hover Button */}
              <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <span className="px-3 py-1.5 bg-white/90 backdrop-blur text-slate-800 text-xs font-medium rounded-md shadow-sm flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Details</span>
                </span>
              </div>
            </div>

            {/* Product Body */}
            <div className="p-4 flex-1 flex flex-col justify-between">
              <div>
                {/* Quiet Unboxed Metadata */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1.5 truncate">
                  <span className="font-medium text-slate-600 truncate">{product.category}</span>
                  {product.modelCode && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{product.modelCode}</span>
                    </>
                  )}
                </div>

                {/* Product Title */}
                <h3
                  onClick={() => onOpenProduct(product)}
                  className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 cursor-pointer leading-snug"
                >
                  {product.title}
                </h3>
              </div>

              {/* Price & Primary Dynamic Action */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-bold font-mono text-slate-900 tabular-nums">
                    ₹{product.price.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                    <span>Base ₹{product.originalRetailPrice}</span>
                    <span className="text-indigo-600 font-medium">+40%</span>
                  </div>
                </div>

                {/* DYNAMIC UI/UX ADAPTATION: Add to Cart vs Out of Stock */}
                {product.inStock ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickAddToCart(product);
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add to Bag</span>
                  </button>
                ) : (
                  <button
                    disabled
                    type="button"
                    className="px-2.5 py-1.5 bg-slate-100 text-slate-400 text-xs font-semibold rounded-lg cursor-not-allowed flex items-center gap-1 shrink-0 border border-slate-200"
                  >
                    <Ban className="w-3.5 h-3.5 text-slate-400" />
                    <span>Out of Stock</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
