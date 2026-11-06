import React from 'react';
import { ToggleLeft, ToggleRight, Sparkles, Ban, CheckCircle2, ArrowRight } from 'lucide-react';
import { StoreProduct } from '../types.ts';

interface InventoryManagerProps {
  products: StoreProduct[];
  onToggleStock: (productId: string) => void;
  onNavigateToStorefront: () => void;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  products,
  onToggleStock,
  onNavigateToStorefront,
}) => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold font-display text-slate-900">
            Store Catalog & Inventory Manager
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Toggle product stock status in one click to verify how the customer-facing storefront changes "Add to Cart" and "Buy Now" buttons in real time.
          </p>
        </div>

        <button
          onClick={onNavigateToStorefront}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>View on Storefront</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px]">
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Model</th>
                <th className="py-3 px-4">Supplier Cost</th>
                <th className="py-3 px-4">Selling Price (+40%)</th>
                <th className="py-3 px-4">Current Stock</th>
                <th className="py-3 px-4 text-center">Interactive Stock Toggle</th>
                <th className="py-3 px-4">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=600&q=80';
                        }}
                        className="w-10 h-10 object-contain rounded border border-slate-200 bg-white p-0.5 shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900 block truncate max-w-xs">
                          {product.title}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {product.id}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-medium">
                    {product.category}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600">
                    {product.modelCode || '—'}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums text-slate-600">
                    ₹{product.originalRetailPrice}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums font-bold text-slate-900">
                    ₹{product.price}
                    <span className="text-[10px] text-indigo-600 font-normal ml-1">
                      (+₹{product.profitAmount})
                    </span>
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    {product.inStock ? (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 w-max">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>In Stock ({product.stockQuantity})</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1 w-max">
                        <Ban className="w-3 h-3 text-rose-600" />
                        <span>Out of Stock</span>
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap text-center">
                    <button
                      type="button"
                      onClick={() => onToggleStock(product.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer border ${
                        product.inStock
                          ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {product.inStock ? (
                        <>
                          <ToggleRight className="w-4 h-4 text-emerald-600" />
                          <span>Simulate Out of Stock</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-4 h-4 text-rose-600" />
                          <span>Simulate Restock</span>
                        </>
                      )}
                    </button>
                  </td>

                  <td className="py-3 px-4 whitespace-nowrap">
                    {product.source === 'jindeal_crawler' ? (
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1 w-max">
                        <Sparkles className="w-3 h-3 text-indigo-600" />
                        <span>AI Intake</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded w-max block">
                        Default Store
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
