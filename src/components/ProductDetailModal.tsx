import React, { useState } from 'react';
import { X, Check, Bell, ShieldCheck, ArrowRight, Ban, Sparkles } from 'lucide-react';
import { StoreProduct } from '../types.ts';

interface ProductDetailModalProps {
  product: StoreProduct | null;
  onClose: () => void;
  onAddToCart: (product: StoreProduct, quantity: number) => void;
  onBuyNow: (product: StoreProduct) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifySubscribed, setNotifySubscribed] = useState(false);

  if (!product) return null;

  const handleNotifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (notifyEmail.trim()) {
      setNotifySubscribed(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
    >
      <div className="relative bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col md:flex-row">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close details"
          className="absolute top-4 right-4 z-10 p-2 text-slate-500 hover:text-slate-800 bg-white/80 hover:bg-white rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Column: Image with fallback */}
        <div className="md:w-1/2 bg-slate-100 flex items-center justify-center relative p-6 min-h-[300px]">
          <img
            src={product.imageUrl}
            alt={product.title}
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=600&q=80';
            }}
            className="w-full h-auto max-h-[360px] object-contain rounded-lg transition-transform duration-300 hover:scale-105"
          />
          {product.source === 'jindeal_crawler' && (
            <div className="absolute bottom-4 left-4 flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/80 backdrop-blur text-white text-xs rounded-md">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Catalog Intake (+40% Margin)</span>
            </div>
          )}
        </div>

        {/* Right Column: PDP Details & Contiguous Purchase Module */}
        <div className="md:w-1/2 p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
          <div>
            {/* Unboxed Metadata */}
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
              <span className="font-medium text-slate-700">{product.category}</span>
              {product.modelCode && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-600">{product.modelCode}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span
                className={`font-semibold ${
                  product.inStock ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {product.inStock ? 'In Stock' : 'Out of Stock'}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-3 leading-snug">
              {product.title}
            </h2>

            {/* Price & 40% Margin Breakdown */}
            <div className="mb-4 pb-4 border-b border-slate-100">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                  ₹{product.price.toLocaleString()}
                </span>
                <span className="text-xs text-slate-500 line-through tabular-nums">
                  MRP ₹{(product.originalRetailPrice * 1.6).toFixed(0)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span className="text-slate-600">
                  Supplier Base: <span className="tabular-nums font-mono font-medium">₹{product.originalRetailPrice}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-indigo-600 font-medium">
                  +40% Margin (Profit: ₹{product.profitAmount})
                </span>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              {product.description}
            </p>

            {/* Features list */}
            {product.features && product.features.length > 0 && (
              <ul className="mb-6 space-y-1.5 text-xs text-slate-600">
                {product.features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* CONTIGUOUS PURCHASE MODULE (ADAPTIVE BASED ON STOCK) */}
          <div className="pt-4 border-t border-slate-100">
            {product.inStock ? (
              /* IN STOCK STATE: Active Add to Cart & Buy Now */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-slate-200 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-3 py-2 text-slate-600 hover:text-slate-900 transition-colors"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="px-3 py-2 text-sm font-medium tabular-nums min-w-9 text-center">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="px-3 py-2 text-slate-600 hover:text-slate-900 transition-colors"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onAddToCart(product, quantity);
                      onClose();
                    }}
                    className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer text-center whitespace-nowrap"
                  >
                    Add to Bag
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onBuyNow(product);
                    onClose();
                  }}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>Buy Now</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 text-xs text-emerald-700 pt-1">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>In Stock · Ready to dispatch within 24 hours</span>
                </div>
              </div>
            ) : (
              /* OUT OF STOCK STATE: Buttons Replaced/Disabled with Out of Stock State */
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
                  <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Currently Out of Stock</span>
                    <span className="text-rose-700">
                      Synchronized from supplier website. "Add to Cart" and "Buy Now" are disabled until inventory is restocked.
                    </span>
                  </div>
                </div>

                {/* Disabled Out of Stock Action Button replacing Add to Cart & Buy Now */}
                <button
                  disabled
                  className="w-full py-3 px-4 bg-slate-200 text-slate-400 font-semibold text-sm rounded-lg cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4 text-slate-400" />
                  <span>Out of Stock</span>
                </button>

                {/* Restock Notification Form */}
                {notifySubscribed ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>You will be notified as soon as this item is restocked!</span>
                  </div>
                ) : (
                  <form onSubmit={handleNotifySubmit} className="space-y-1.5">
                    <label className="text-xs text-slate-500 block">
                      Notify me when back in stock:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        required
                        value={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        <span>Notify Me</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
