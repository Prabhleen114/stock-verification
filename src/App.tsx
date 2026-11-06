import { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { Storefront } from './components/Storefront.tsx';
import { CrawlerHub } from './components/CrawlerHub.tsx';
import { AiNormalizerPlayground } from './components/AiNormalizerPlayground.tsx';
import { RepoAuditReport } from './components/RepoAuditReport.tsx';
import { InventoryManager } from './components/InventoryManager.tsx';
import { ProductDetailModal } from './components/ProductDetailModal.tsx';
import { CartDrawer } from './components/CartDrawer.tsx';
import { StoreProduct, SyncAuditItem, SyncSummary, CartItem } from './types.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<
    'storefront' | 'crawler' | 'ai-normalizer' | 'repo-audit' | 'inventory'
  >('storefront');

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [logs, setLogs] = useState<SyncAuditItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'alert' } | null>(null);

  // Fetch initial catalog data and sync summary
  const loadData = async () => {
    try {
      const [prodRes, sumRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/sync/summary'),
      ]);

      const prodData = await prodRes.json();
      const sumData = await sumRes.json();

      setProducts(prodData.products || []);
      setSummary(sumData.summary || prodData.summary || null);
      setLogs(sumData.logs || []);
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showNotification = (message: string, type: 'info' | 'success' | 'alert' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Run Crawler & Synchronization
  const handleRunCrawl = async (mode: 'live' | 'sample', url?: string, maxPages?: number) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, url, maxPages }),
      });
      const data = await res.json();

      if (data.success) {
        setProducts(data.products || []);
        setSummary(data.summary || null);
        setLogs(data.auditItems || []);
        showNotification(
          `Sync Complete: ${data.scrapedCount} crawled · ${data.summary?.updatedOosCount || 0} marked OOS · ${data.summary?.newlyAddedCount || 0} AI products ingested (+40% margin)`,
          'success'
        );
      } else {
        showNotification(data.error || 'Crawl failed', 'alert');
      }
    } catch (err: any) {
      showNotification(`Error: ${err.message}`, 'alert');
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle Stock for interactive UI verification
  const handleToggleStock = async (productId: string) => {
    try {
      const res = await fetch(`/api/products/${productId}/toggle-stock`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.product) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? data.product : p))
        );
        setSummary(data.summary || null);
        showNotification(
          `Product "${data.product.title.substring(0, 30)}..." is now ${
            data.product.inStock ? 'IN STOCK' : 'OUT OF STOCK'
          }. Notice Storefront purchase buttons!`,
          data.product.inStock ? 'success' : 'alert'
        );
      }
    } catch (err) {
      console.error('Failed to toggle stock:', err);
    }
  };

  // Reset Catalog
  const handleResetCatalog = async () => {
    try {
      const res = await fetch('/api/catalog/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
        setSummary(data.summary);
        setLogs([]);
        showNotification('Store catalog reset to default initial state.', 'info');
      }
    } catch (err) {
      console.error('Reset failed:', err);
    }
  };

  // Cart Handlers
  const handleAddToCart = (product: StoreProduct, quantity = 1) => {
    if (!product.inStock) {
      showNotification('Cannot add item: this product is out of stock.', 'alert');
      return;
    }

    setCartItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });

    showNotification(`Added "${product.title.substring(0, 30)}..." to your bag`, 'success');
  };

  const handleBuyNow = (product: StoreProduct) => {
    if (!product.inStock) {
      showNotification('This product is out of stock.', 'alert');
      return;
    }
    handleAddToCart(product, 1);
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const totalCartCount = cartItems.reduce((count, item) => count + item.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Banner for Notification */}
      {notification && (
        <div
          className={`px-4 py-2 text-xs font-semibold text-center transition-all animate-fadeIn ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white'
              : notification.type === 'alert'
              ? 'bg-rose-600 text-white'
              : 'bg-slate-900 text-white'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Header conforming to Top Bar Contract */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        isSyncing={isSyncing}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {currentTab === 'storefront' && (
          <Storefront
            products={products}
            onOpenProduct={(p) => setSelectedProduct(p)}
            onQuickAddToCart={(p) => handleAddToCart(p, 1)}
            onNavigateToCrawler={() => setCurrentTab('crawler')}
            isSyncing={isSyncing}
          />
        )}

        {currentTab === 'crawler' && (
          <CrawlerHub
            summary={summary}
            logs={logs}
            isSyncing={isSyncing}
            onRunCrawl={handleRunCrawl}
            onResetCatalog={handleResetCatalog}
            onNavigateToStorefront={() => setCurrentTab('storefront')}
          />
        )}

        {currentTab === 'ai-normalizer' && <AiNormalizerPlayground />}

        {currentTab === 'repo-audit' && <RepoAuditReport />}

        {currentTab === 'inventory' && (
          <InventoryManager
            products={products}
            onToggleStock={handleToggleStock}
            onNavigateToStorefront={() => setCurrentTab('storefront')}
          />
        )}
      </main>

      {/* Product Detail Modal (PDP) */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
      />

      {/* Slide-over Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={() => setCartItems([])}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-16 text-center text-xs text-slate-500 space-y-2">
        <p className="font-medium text-slate-700">
          Ekora Goods · Autonomous Stock Verification & Catalog Intake Engine
        </p>
        <p className="max-w-xl mx-auto text-slate-400">
          Scrapes supplier inventory, normalizes product names, performs fuzzy matching, updates out-of-stock states, and ingests uncataloged items with Gemini AI and a 40% retail margin.
        </p>
      </footer>
    </div>
  );
}
