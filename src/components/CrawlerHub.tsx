import React, { useState } from 'react';
import { Play, Sparkles, AlertCircle, CheckCircle2, Ban, Search, FileCode } from 'lucide-react';
import { SyncAuditItem, SyncSummary } from '../types.ts';

interface CrawlerHubProps {
  summary: SyncSummary | null;
  logs: SyncAuditItem[];
  isSyncing: boolean;
  onRunCrawl: (mode: 'live' | 'sample', url?: string, maxPages?: number) => Promise<void>;
  onResetCatalog: () => Promise<void>;
  onNavigateToStorefront: () => void;
}

export const CrawlerHub: React.FC<CrawlerHubProps> = ({
  summary,
  logs,
  isSyncing,
  onRunCrawl,
  onResetCatalog,
  onNavigateToStorefront,
}) => {
  const [crawlMode, setCrawlMode] = useState<'sample' | 'live'>('live');
  const [targetUrl, setTargetUrl] = useState('https://jindeal.com/shop/');
  const [maxPages, setMaxPages] = useState(50);
  const [logFilter, setLogFilter] = useState<'all' | 'updated_oos' | 'new_product_added' | 'restocked'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = logs.filter((item) => {
    if (logFilter !== 'all' && item.action !== logFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.rawTitle.toLowerCase().includes(q) ||
        item.normalizedTitle.toLowerCase().includes(q) ||
        (item.modelCode && item.modelCode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold font-display text-slate-900">
            Stock Verification & Catalog Synchronization Engine
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Automates supplier web scraping, title normalization, fuzzy matching, dynamic stock adaptation, and AI catalog intake.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onNavigateToStorefront}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            View Customer Storefront
          </button>
          <button
            onClick={onResetCatalog}
            className="px-3.5 py-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
          >
            Reset Default Catalog
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 block">Total Catalog Size</span>
          <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {summary?.totalCatalogSize || 0}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">Active products in store</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-rose-100 bg-rose-50/20 shadow-xs">
          <span className="text-xs text-rose-700 block font-medium">Out of Stock (UI Disabled)</span>
          <span className="text-2xl font-bold font-mono text-rose-600 tabular-nums">
            {summary?.outOfStockCatalogCount || 0}
          </span>
          <span className="text-[11px] text-rose-600/80 block mt-1">Purchases blocked</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-indigo-100 bg-indigo-50/20 shadow-xs">
          <span className="text-xs text-indigo-700 block font-medium">AI New Intake (+40%)</span>
          <span className="text-2xl font-bold font-mono text-indigo-600 tabular-nums">
            {summary?.newlyAddedCount || 0}
          </span>
          <span className="text-[11px] text-indigo-600/80 block mt-1">Uncataloged items ingested</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-emerald-100 bg-emerald-50/20 shadow-xs">
          <span className="text-xs text-emerald-700 block font-medium">Fuzzy Matched</span>
          <span className="text-2xl font-bold font-mono text-emerald-600 tabular-nums">
            {summary?.matchedCount || 0}
          </span>
          <span className="text-[11px] text-emerald-600/80 block mt-1">Verified with store items</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs col-span-2 md:col-span-1">
          <span className="text-xs text-slate-500 block">Last Sync Execution</span>
          <span className="text-xs font-mono font-medium text-slate-800 block mt-1.5 truncate">
            {summary?.lastSyncTime ? new Date(summary.lastSyncTime).toLocaleTimeString() : 'Ready'}
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">Autonomous crawler</span>
        </div>
      </div>

      {/* Crawl Control Console */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Run Synchronization Cycle</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select crawler mode to trigger scraping, title normalization, fuzzy matching, and automatic catalog ingestion.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => setCrawlMode('sample')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              crawlMode === 'sample'
                ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-600'
                : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <span>Fast Verified Sample Batch</span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                  Recommended for instant demo
                </span>
              </span>
              <input
                type="radio"
                checked={crawlMode === 'sample'}
                onChange={() => setCrawlMode('sample')}
                className="text-indigo-600"
              />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Instantly syncs 7 curated live products from Jindeal. Includes JKB-3668 (which triggers Out of Stock UI change) and JKB-3670 (which triggers Gemini AI title cleaning, categorization, and +40% profit markup).
            </p>
          </div>

          <div
            onClick={() => setCrawlMode('live')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              crawlMode === 'live'
                ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-1 ring-indigo-600'
                : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <span>Live Cheerio Crawler</span>
                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 px-1.5 py-0.2 rounded">
                  Real Web Scrape (All 50 Pages)
                </span>
              </span>
              <input
                type="radio"
                checked={crawlMode === 'live'}
                onChange={() => setCrawlMode('live')}
                className="text-indigo-600"
              />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sends real server-side HTTP GET requests to <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">https://jindeal.com/shop/</code>, parses HTML via Cheerio, extracts prices, stock badges, and executes live synchronization across all pages.
            </p>
          </div>
        </div>

        {/* Live crawler custom inputs */}
        {crawlMode === 'live' && (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="md:col-span-2">
              <label className="font-medium text-slate-700 block mb-1">Target Shop URL</label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://jindeal.com/shop/"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="font-medium text-slate-700 block mb-1">Pages to Crawl</label>
              <select
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                <option value={50}>All Pages (1 to 50+ Full Catalog ~2500+ items)</option>
                <option value={20}>20 Pages (~1000 items)</option>
                <option value={10}>10 Pages (~500 items)</option>
                <option value={5}>5 Pages (~250 items)</option>
                <option value={1}>1 Page Quick Test (~50 items)</option>
              </select>
            </div>
          </div>
        )}

        {/* Trigger Button */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500">
            {crawlMode === 'sample'
              ? 'Instant execution (~500ms) with full AI pipeline'
              : `Live scraping direct from jindeal.com/shop/ (${maxPages} pages)`}
          </div>

          <button
            type="button"
            disabled={isSyncing}
            onClick={() => onRunCrawl(crawlMode, targetUrl, maxPages)}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <Play className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Executing Pipeline...' : 'Run Stock Sync Now'}</span>
          </button>
        </div>
      </div>

      {/* 5-Step Synchronization Pipeline Architecture Visualization */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            StockSync Pipeline Architecture
          </h2>
          <span className="text-xs text-indigo-300 font-mono">Real-Time Logic Engine</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/80 space-y-1">
            <span className="text-[10px] text-indigo-400 font-mono block">STAGE 1</span>
            <span className="font-semibold block text-slate-100">Crawler & Scraper</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Cheerio extracts raw titles, prices (₹), OOS badges (.outofstock), and images across all 50 pages.
            </p>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/80 space-y-1">
            <span className="text-[10px] text-indigo-400 font-mono block">STAGE 2</span>
            <span className="font-semibold block text-slate-100">Normalization</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Regex strips brand keywords ("Vedini", "Jindeal") and isolates model numbers (JKB-3669).
            </p>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/80 space-y-1">
            <span className="text-[10px] text-indigo-400 font-mono block">STAGE 3</span>
            <span className="font-semibold block text-slate-100">Fuzzy Matching</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Levenshtein & Token Dice similarity scores products against website catalog.
            </p>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/80 space-y-1">
            <span className="text-[10px] text-indigo-400 font-mono block">STAGE 4</span>
            <span className="font-semibold block text-slate-100">OOS UI Adaptation</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              If matched item is OOS, sets inStock=false, converting Add to Cart & Buy Now to disabled.
            </p>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-lg border border-slate-700/80 space-y-1">
            <span className="text-[10px] text-indigo-400 font-mono block">STAGE 5</span>
            <span className="font-semibold block text-slate-100">AI Intake (+40%)</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              If product is new, Gemini categorizes, writes clean title, and adds 40% margin.
            </p>
          </div>
        </div>
      </div>

      {/* Sync Audit Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs space-y-4 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Audit Trail & Sync Log</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live inspection of every matched product, stock toggle, and AI-cataloged new item.
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search titles or models..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setLogFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  logFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                All ({logs.length})
              </button>
              <button
                onClick={() => setLogFilter('updated_oos')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  logFilter === 'updated_oos' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                OOS
              </button>
              <button
                onClick={() => setLogFilter('new_product_added')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  logFilter === 'new_product_added' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                AI Intake
              </button>
              <button
                onClick={() => setLogFilter('restocked')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  logFilter === 'restocked' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Restocked
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No audit logs recorded yet. Click "Run Stock Sync Now" to execute the synchronization pipeline.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase font-semibold text-[10px]">
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Raw Scraped Title</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3">Supplier Price</th>
                  <th className="py-2.5 px-3">Store Price (+40%)</th>
                  <th className="py-2.5 px-3">Match Type</th>
                  <th className="py-2.5 px-3">Pipeline Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {item.action === 'updated_oos' && (
                        <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 flex items-center gap-1 w-max">
                          <Ban className="w-3 h-3 text-rose-600" />
                          <span>OOS Updated</span>
                        </span>
                      )}
                      {item.action === 'new_product_added' && (
                        <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1 w-max">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          <span>AI Ingested</span>
                        </span>
                      )}
                      {item.action === 'restocked' && (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 w-max">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Restocked</span>
                        </span>
                      )}
                      {item.action === 'already_synced' && (
                        <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded w-max block">
                          Already Synced
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 max-w-xs truncate font-medium text-slate-800" title={item.rawTitle}>
                      {item.rawTitle}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-600 text-[11px]">
                      {item.modelCode || '—'}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums text-slate-600">
                      ₹{item.rawPrice}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums font-bold text-slate-900">
                      ₹{item.calculatedPrice}
                      <span className="text-[10px] font-normal text-indigo-600 ml-1">(+40%)</span>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                      {item.matchType === 'model_exact' && (
                        <span className="text-emerald-700 font-medium">Exact Model (100%)</span>
                      )}
                      {item.matchType === 'fuzzy_title' && (
                        <span className="text-blue-700 font-medium">Fuzzy ({item.confidenceScore}%)</span>
                      )}
                      {item.matchType === 'new_unmatched' && (
                        <span className="text-purple-700 font-medium">New Uncataloged</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 max-w-sm truncate text-slate-600 text-[11px]" title={item.details}>
                      {item.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
