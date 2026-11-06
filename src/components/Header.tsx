import React from 'react';
import { ShoppingBag, RefreshCw } from 'lucide-react';

interface HeaderProps {
  currentTab: 'storefront' | 'crawler' | 'ai-normalizer' | 'repo-audit' | 'inventory';
  onSelectTab: (tab: 'storefront' | 'crawler' | 'ai-normalizer' | 'repo-audit' | 'inventory') => void;
  cartCount: number;
  onOpenCart: () => void;
  isSyncing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  cartCount,
  onOpenCart,
  isSyncing,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onSelectTab('storefront')}
            className="text-left group cursor-pointer focus:outline-none"
          >
            <span className="font-display text-xl font-bold tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors whitespace-nowrap">
              Ekora Goods
            </span>
          </button>
        </div>

        {/* Zone 2: Navigation Links (single line, unboxed, quiet active indicators) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <button
            onClick={() => onSelectTab('storefront')}
            className={`whitespace-nowrap transition-colors py-1 relative ${
              currentTab === 'storefront'
                ? 'text-slate-900 font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Storefront
          </button>
          <button
            onClick={() => onSelectTab('crawler')}
            className={`whitespace-nowrap transition-colors py-1 relative flex items-center gap-1.5 ${
              currentTab === 'crawler'
                ? 'text-slate-900 font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Crawler & Sync</span>
            {isSyncing && <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />}
          </button>
          <button
            onClick={() => onSelectTab('ai-normalizer')}
            className={`whitespace-nowrap transition-colors py-1 relative ${
              currentTab === 'ai-normalizer'
                ? 'text-slate-900 font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            AI Normalizer
          </button>
          <button
            onClick={() => onSelectTab('repo-audit')}
            className={`whitespace-nowrap transition-colors py-1 relative ${
              currentTab === 'repo-audit'
                ? 'text-slate-900 font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Repo Audit
          </button>
          <button
            onClick={() => onSelectTab('inventory')}
            className={`whitespace-nowrap transition-colors py-1 relative ${
              currentTab === 'inventory'
                ? 'text-slate-900 font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Inventory
          </button>
        </nav>

        {/* Zone 3: Primary Action (Shopping Bag Cart Button) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onOpenCart}
            aria-label="View Shopping Cart"
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4 text-slate-700" />
            <span className="hidden sm:inline">Bag</span>
            <span className="tabular-nums font-semibold px-1.5 py-0.2 text-xs bg-slate-900 text-white rounded">
              {cartCount}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile nav row */}
      <div className="flex md:hidden overflow-x-auto border-t border-slate-100 px-4 py-2 gap-4 text-xs font-medium scrollbar-none">
        <button
          onClick={() => onSelectTab('storefront')}
          className={`whitespace-nowrap shrink-0 ${
            currentTab === 'storefront' ? 'text-indigo-600 font-semibold' : 'text-slate-600'
          }`}
        >
          Storefront
        </button>
        <button
          onClick={() => onSelectTab('crawler')}
          className={`whitespace-nowrap shrink-0 ${
            currentTab === 'crawler' ? 'text-indigo-600 font-semibold' : 'text-slate-600'
          }`}
        >
          Crawler & Sync
        </button>
        <button
          onClick={() => onSelectTab('ai-normalizer')}
          className={`whitespace-nowrap shrink-0 ${
            currentTab === 'ai-normalizer' ? 'text-indigo-600 font-semibold' : 'text-slate-600'
          }`}
        >
          AI Normalizer
        </button>
        <button
          onClick={() => onSelectTab('repo-audit')}
          className={`whitespace-nowrap shrink-0 ${
            currentTab === 'repo-audit' ? 'text-indigo-600 font-semibold' : 'text-slate-600'
          }`}
        >
          Repo Audit
        </button>
        <button
          onClick={() => onSelectTab('inventory')}
          className={`whitespace-nowrap shrink-0 ${
            currentTab === 'inventory' ? 'text-indigo-600 font-semibold' : 'text-slate-600'
          }`}
        >
          Inventory
        </button>
      </div>
    </header>
  );
};
