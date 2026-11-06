import React, { useState } from 'react';
import { Sparkles, ArrowRight, Check, Tag } from 'lucide-react';

export const AiNormalizerPlayground: React.FC = () => {
  const [sampleTitle, setSampleTitle] = useState(
    'Vedini Christmas Stocking Bow Hat Gift Box Baking DIY Tools Chocolate Silicone Mold JKB-3669'
  );
  const [samplePrice, setSamplePrice] = useState('129');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const presets = [
    {
      title: 'Vedini Christmas Stocking Bow Hat Gift Box Baking DIY Tools Chocolate Silicone Mold JKB-3669',
      price: '129',
    },
    {
      title: 'Vedini Luxury Oval Vanity Jewelry Trinket Dish Casting Mold By Jindeal JKB-3670',
      price: '320',
    },
    {
      title: 'Vedini Rose Flower Bouquet Fondant Cupcake Silicone Decorating Mold JKB-3671',
      price: '145',
    },
    {
      title: 'Jindeal 3D Geometric Bear Candle Mold Silicone Wax Aroma Mould JKB-3664',
      price: '199',
    },
  ];

  const handleRunAi = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ai/test-normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawTitle: sampleTitle, rawPrice: samplePrice }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-md mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Gemini 3.8 Flash Engine</span>
        </div>
        <h1 className="text-2xl font-bold font-display text-slate-900">
          AI Catalog Normalization & 40% Margin Calculator
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Test how raw supplier titles are sanitized (removing brand keywords and model numbers like "Vedini", "Jindeal", "JKB-3669"), categorized, and priced with a 40% profit margin.
        </p>
      </div>

      {/* Preset Buttons */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-slate-500 block">Try with real supplier title presets:</span>
        <div className="flex flex-wrap gap-2">
          {presets.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSampleTitle(p.title);
                setSamplePrice(p.price);
              }}
              className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer text-left truncate max-w-sm"
            >
              {p.title.substring(0, 42)}... (₹{p.price})
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Input Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Raw Supplier Product Title
            </label>
            <textarea
              rows={3}
              value={sampleTitle}
              onChange={(e) => setSampleTitle(e.target.value)}
              placeholder="Paste raw supplier title here..."
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="w-48">
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Supplier Price (₹)
              </label>
              <input
                type="number"
                value={samplePrice}
                onChange={(e) => setSamplePrice(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono tabular-nums"
              />
            </div>

            <div className="pt-5 flex-1">
              <button
                type="button"
                disabled={isLoading || !sampleTitle.trim()}
                onClick={handleRunAi}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Processing via Gemini...' : 'Normalize & Categorize with AI'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Formula Explainer */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
          <span className="font-semibold text-slate-900 block border-b border-slate-200 pb-2">
            Automated Pricing Formula
          </span>
          <div className="space-y-1 text-slate-600">
            <div className="flex justify-between">
              <span>Original Supplier Price:</span>
              <span className="font-mono tabular-nums font-medium">₹{samplePrice || 0}</span>
            </div>
            <div className="flex justify-between text-indigo-700 font-medium">
              <span>Profit Markup:</span>
              <span>+40%</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Store Selling Price:</span>
              <span className="font-mono tabular-nums font-bold">
                ₹{Math.round((Number(samplePrice) || 0) * 1.4)}
              </span>
            </div>
            <div className="flex justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200">
              <span>Gross Profit Margin:</span>
              <span className="font-mono tabular-nums">
                ₹{Math.round((Number(samplePrice) || 0) * 1.4) - (Number(samplePrice) || 0)}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-normal pt-1">
            "if there is a product that is not on my website it should add that product to my stock , use ai to categorise it and normalise its name removing keywords like 'jindeal', 'vedini' or any model number like jkb and add 40% profit margin to the original retail price."
          </p>
        </div>
      </div>

      {/* AI Results Card */}
      {result && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">
                AI Optimization Result
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Model: Gemini 3.8 Flash (Server-Side)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Title & Category */}
            <div className="space-y-4">
              <div>
                <span className="text-xs text-slate-500 block mb-1">
                  Normalized Customer-Ready Title
                </span>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm font-semibold text-slate-900">
                  {result.normalizedTitle}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-slate-500 block mb-1">Assigned Category</span>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs font-semibold text-indigo-700">
                    {result.category}
                  </div>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block mb-1">Calculated Store Price</span>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono font-bold text-emerald-700">
                    ₹{result.calculatedPrice} (+40%)
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-500 block mb-1">AI Product Description</span>
                <p className="text-xs text-slate-600 leading-relaxed p-3 bg-slate-50 rounded-lg border border-slate-200">
                  {result.description}
                </p>
              </div>
            </div>

            {/* Features & Tags */}
            <div className="space-y-4">
              <div>
                <span className="text-xs text-slate-500 block mb-1">Generated Feature Bullets</span>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  {result.features.map((feat: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-500 block mb-1">SEO & Catalog Tags</span>
                <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  {result.tags.map((tag: string, i: number) => (
                    <span
                      key={i}
                      className="text-[11px] font-medium text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1"
                    >
                      <Tag className="w-3 h-3 text-slate-400" />
                      <span>{tag}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
