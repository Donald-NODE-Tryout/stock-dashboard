'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  SlidersHorizontal,
  Filter,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  RefreshCw,
  X,
  Package,
  Layers,
  AlertCircle,
  Eye,
  EyeOff,
  GripVertical,
  Check,
  Building2,
  Tag,
  ListOrdered
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface ProductItem {
  model_id: string;
  model_name?: string | null;
  category?: string | null;
  company?: string | null;
  status?: string | null;
}

export interface LocationItem {
  location_id: string | number;
  location_name: string;
  status?: string | null;
}

export interface StockEntry {
  model_id: string;
  location_id: string | number;
  qty: number;
}

export interface StockRow {
  modelId: string;
  modelName?: string;
  category?: string;
  company?: string;
  quantities: Record<string | number, number>;
  total: number;
}

export type SortField = 'model_id' | 'category' | 'company' | 'custom';
export type SortDirection = 'asc' | 'desc';

export interface StockViewProps {
  supabase?: SupabaseClient<any, any, any>;
  initialProducts?: ProductItem[];
  initialStockData?: StockEntry[];
  initialLocations?: LocationItem[];
  className?: string;
  onModelClick?: (modelId: string) => void;
}

// ==========================================
// COMPONENT
// ==========================================

export const StockView: React.FC<StockViewProps> = ({
  supabase,
  initialProducts,
  initialStockData,
  initialLocations,
  className = '',
  onModelClick,
}) => {
  // --- Core Data States ---
  const [products, setProducts] = useState<ProductItem[]>(initialProducts || []);
  const [locations, setLocations] = useState<LocationItem[]>(initialLocations || []);
  const [stockEntries, setStockEntries] = useState<StockEntry[]>(initialStockData || []);
  
  // --- Column & Row Ordering States ---
  const [orderedLocationIds, setOrderedLocationIds] = useState<(string | number)[]>([]);
  const [hiddenLocationIds, setHiddenLocationIds] = useState<Set<string | number>>(new Set());
  const [customModelOrder, setCustomModelOrder] = useState<string[]>([]);

  // --- Filter & Sort States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('custom');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());

  // --- UI & Modal States ---
  const [isLoading, setIsLoading] = useState<boolean>(!initialStockData && !initialLocations);
  const [error, setError] = useState<string | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

  // --- Drag and Drop State ---
  const [draggedLocationIndex, setDraggedLocationIndex] = useState<number | null>(null);
  const [dragOverLocationIndex, setDragOverLocationIndex] = useState<number | null>(null);

  const [draggedModelIndex, setDraggedModelIndex] = useState<number | null>(null);
  const [dragOverModelIndex, setDragOverModelIndex] = useState<number | null>(null);

  // --- Fetch Data from Supabase / API Route ---
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let fetchedProducts: ProductItem[] = [];
      let fetchedLocations: LocationItem[] = [];
      let fetchedStock: StockEntry[] = [];
      let fetchSuccess = false;

      // 1. Try Direct Supabase Client
      if (supabase) {
        try {
          const { data: prodData, error: prodErr } = await supabase
            .from('product_master')
            .select('model_id, model_name, category, company, status')
            .eq('status', 'ACTIVE')
            .order('model_id', { ascending: true });

          const { data: locData, error: locErr } = await supabase
            .from('locations')
            .select('location_id, location_name, status')
            .eq('status', 'ACTIVE')
            .order('location_name', { ascending: true });

          const { data: sData, error: sErr } = await supabase
            .from('dashboard_stock_view')
            .select('model_id, location_id, qty');

          if (!prodErr && !locErr && !sErr && locData) {
            fetchedProducts = (prodData || []).map((p: Record<string, any>) => ({
              model_id: String(p.model_id ?? '').trim(),
              model_name: p.model_name ? String(p.model_name).trim() : undefined,
              category: p.category && String(p.category) !== 'nan' ? String(p.category).trim() : undefined,
              company: p.company && String(p.company) !== 'nan' ? String(p.company).trim() : undefined,
              status: p.status,
            }));

            fetchedLocations = locData.map((l: Record<string, any>) => ({
              location_id: l.location_id,
              location_name: String(l.location_name || l.location_id),
              status: l.status,
            }));

            fetchedStock = (sData || []).map((s: Record<string, any>) => ({
              model_id: String(s.model_id ?? '').trim(),
              location_id: s.location_id,
              qty: Number(s.qty) || 0,
            }));

            fetchSuccess = true;
          }
        } catch (directErr) {
          console.warn('Direct Supabase fetch failed in browser, trying /api/stock fallback...', directErr);
        }
      }

      // 2. Fallback to /api/stock route
      if (!fetchSuccess) {
        const res = await fetch('/api/stock');
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Server responded with status ${res.status}`);
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        fetchedProducts = (data.products || []).map((p: Record<string, any>) => ({
          model_id: String(p.model_id ?? '').trim(),
          model_name: p.model_name ? String(p.model_name).trim() : undefined,
          category: p.category && String(p.category) !== 'nan' ? String(p.category).trim() : undefined,
          company: p.company && String(p.company) !== 'nan' ? String(p.company).trim() : undefined,
          status: p.status,
        }));

        fetchedLocations = (data.locations || []).map((l: Record<string, any>) => ({
          location_id: l.location_id,
          location_name: String(l.location_name || l.location_id),
          status: l.status,
        }));

        fetchedStock = (data.stock || []).map((s: Record<string, any>) => ({
          model_id: String(s.model_id ?? '').trim(),
          location_id: s.location_id,
          qty: Number(s.qty) || 0,
        }));
      }

      setProducts(fetchedProducts);
      setLocations(fetchedLocations);
      setStockEntries(fetchedStock);

      // Sync Location Order
      setOrderedLocationIds((prevOrder) => {
        const newLocationIds = fetchedLocations.map((l) => l.location_id);
        if (prevOrder.length === 0) return newLocationIds;

        const existingIdsSet = new Set(fetchedLocations.map((l) => String(l.location_id)));
        const retainedOrder = prevOrder.filter((id) => existingIdsSet.has(String(id)));
        const newlyAdded = newLocationIds.filter((id) => !retainedOrder.includes(id));
        return [...retainedOrder, ...newlyAdded];
      });

      // Sync Custom Model Order
      setCustomModelOrder((prevOrder) => {
        const allIds = fetchedProducts.map((p) => p.model_id);
        if (prevOrder.length === 0) return allIds;

        const validIdsSet = new Set(allIds);
        const retained = prevOrder.filter((id) => validIdsSet.has(id));
        const newlyAdded = allIds.filter((id) => !retained.includes(id));
        return [...retained, ...newlyAdded];
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch stock information.';
      console.error('Error fetching stock data:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync initial locations
  useEffect(() => {
    if (locations.length > 0 && orderedLocationIds.length === 0) {
      setOrderedLocationIds(locations.map((l) => l.location_id));
    }
  }, [locations, orderedLocationIds.length]);

  // Sync initial products & load persistent admin order from Product Master
  useEffect(() => {
    if (products.length > 0 && customModelOrder.length === 0) {
      setCustomModelOrder(products.map((p) => p.model_id));
    }
    // Load custom model arrangement configured in Product Master
    fetch('/api/products/order')
      .then((res) => res.json())
      .then((data) => {
        if (data.order && Array.isArray(data.order) && data.order.length > 0) {
          setCustomModelOrder(data.order);
          setSortField('custom');
        }
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem('app_custom_model_order') || localStorage.getItem('legacy_custom_model_order');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setCustomModelOrder(parsed);
              setSortField('custom');
            }
          }
        } catch {}
      });
  }, [products, customModelOrder.length]);

  // --- Dynamic Category & Company Lists ---
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category && p.category !== 'nan') set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const allCompanies = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.company && p.company !== 'nan') set.add(p.company);
    });
    return Array.from(set).sort();
  }, [products]);

  // --- Location Map ---
  const locationMap = useMemo(() => {
    const map = new Map<string | number, LocationItem>();
    locations.forEach((loc) => map.set(loc.location_id, loc));
    return map;
  }, [locations]);

  // Visible locations
  const visibleLocations = useMemo(() => {
    return orderedLocationIds
      .filter((id) => !hiddenLocationIds.has(id))
      .map((id) => locationMap.get(id))
      .filter((loc): loc is LocationItem => Boolean(loc));
  }, [orderedLocationIds, hiddenLocationIds, locationMap]);

  // --- Matrix Assembly ---
  const allPivotedRows = useMemo<StockRow[]>(() => {
    const stockMap = new Map<string, number>();
    const modelsInStock = new Set<string>();

    stockEntries.forEach((entry) => {
      if (!entry.model_id) return;
      const key = `${entry.model_id}::${entry.location_id}`;
      stockMap.set(key, (stockMap.get(key) || 0) + entry.qty);
      modelsInStock.add(entry.model_id);
    });

    const modelMetaMap = new Map<string, { modelName?: string; category?: string; company?: string }>();
    products.forEach((p) => {
      if (p.model_id) {
        modelMetaMap.set(p.model_id, {
          modelName: p.model_name || undefined,
          category: p.category || undefined,
          company: p.company || undefined,
        });
      }
    });

    const allModelIds = new Set<string>([
      ...products.map((p) => p.model_id).filter(Boolean),
      ...Array.from(modelsInStock),
    ]);

    const rows: StockRow[] = [];

    allModelIds.forEach((modelId) => {
      const meta = modelMetaMap.get(modelId);
      const quantities: Record<string | number, number> = {};
      let rowTotal = 0;

      locations.forEach((loc) => {
        const key = `${modelId}::${loc.location_id}`;
        const qty = stockMap.get(key) || 0;
        quantities[loc.location_id] = qty;
        rowTotal += qty;
      });

      rows.push({
        modelId,
        modelName: meta?.modelName,
        category: meta?.category,
        company: meta?.company,
        quantities,
        total: rowTotal,
      });
    });

    return rows;
  }, [products, stockEntries, locations]);

  // --- Filtering & Sorting ---
  const processedRows = useMemo(() => {
    let result = [...allPivotedRows];

    // 1. Text Search Filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (row) =>
          row.modelId.toLowerCase().includes(query) ||
          (row.modelName && row.modelName.toLowerCase().includes(query)) ||
          (row.category && row.category.toLowerCase().includes(query)) ||
          (row.company && row.company.toLowerCase().includes(query))
      );
    }

    // 2. Category Filter
    if (selectedCategories.size > 0) {
      result = result.filter((row) => row.category && selectedCategories.has(row.category));
    }

    // 3. Company Filter
    if (selectedCompanies.size > 0) {
      result = result.filter((row) => row.company && selectedCompanies.has(row.company));
    }

    // 4. Sorting
    if (sortField === 'custom') {
      const orderIndexMap = new Map<string, number>();
      customModelOrder.forEach((id, idx) => orderIndexMap.set(id, idx));

      result.sort((a, b) => {
        const indexA = orderIndexMap.has(a.modelId) ? orderIndexMap.get(a.modelId)! : 999999;
        const indexB = orderIndexMap.has(b.modelId) ? orderIndexMap.get(b.modelId)! : 999999;
        return sortDirection === 'asc' ? indexA - indexB : indexB - indexA;
      });
    } else {
      result.sort((a, b) => {
        let valA = '';
        let valB = '';

        if (sortField === 'model_id') {
          valA = a.modelId;
          valB = b.modelId;
        } else if (sortField === 'category') {
          valA = a.category || 'zzz';
          valB = b.category || 'zzz';
        } else if (sortField === 'company') {
          valA = a.company || 'zzz';
          valB = b.company || 'zzz';
        }

        const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [allPivotedRows, searchQuery, selectedCategories, selectedCompanies, sortField, sortDirection, customModelOrder]);

  // --- Totals ---
  const columnTotals = useMemo(() => {
    const totals: Record<string | number, number> = {};
    let grandTotal = 0;

    visibleLocations.forEach((loc) => {
      totals[loc.location_id] = 0;
    });

    processedRows.forEach((row) => {
      visibleLocations.forEach((loc) => {
        const qty = row.quantities[loc.location_id] || 0;
        totals[loc.location_id] += qty;
      });
      grandTotal += row.total;
    });

    return { totals, grandTotal };
  }, [processedRows, visibleLocations]);

  // --- Location Drag Handlers ---
  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedLocationIds.length) return;

    const newOrder = [...orderedLocationIds];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);
    setOrderedLocationIds(newOrder);
  };

  const handleLocationDragStart = (index: number) => {
    setDraggedLocationIndex(index);
  };

  const handleLocationDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedLocationIndex === null || draggedLocationIndex === index) return;
    setDragOverLocationIndex(index);
  };

  const handleLocationDrop = (dropIndex: number) => {
    if (draggedLocationIndex === null || draggedLocationIndex === dropIndex) {
      setDraggedLocationIndex(null);
      setDragOverLocationIndex(null);
      return;
    }

    const newOrder = [...orderedLocationIds];
    const [moved] = newOrder.splice(draggedLocationIndex, 1);
    newOrder.splice(dropIndex, 0, moved);
    setOrderedLocationIds(newOrder);

    setDraggedLocationIndex(null);
    setDragOverLocationIndex(null);
  };

  const toggleLocationVisibility = (id: string | number) => {
    setHiddenLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= orderedLocationIds.length - 1) return prev;
        next.add(id);
      }
      return next;
    });
  };

  const resetColumnOrder = () => {
    setOrderedLocationIds(locations.map((l) => l.location_id));
    setHiddenLocationIds(new Set());
  };

  // --- Model Row Drag Handlers ---
  const moveModelRow = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= customModelOrder.length) return;

    const newOrder = [...customModelOrder];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);
    setCustomModelOrder(newOrder);
    setSortField('custom');
  };

  const handleModelDragStart = (index: number) => {
    setDraggedModelIndex(index);
  };

  const handleModelDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedModelIndex === null || draggedModelIndex === index) return;
    setDragOverModelIndex(index);
  };

  const handleModelDrop = (dropIndex: number) => {
    if (draggedModelIndex === null || draggedModelIndex === dropIndex) {
      setDraggedModelIndex(null);
      setDragOverModelIndex(null);
      return;
    }

    const newOrder = [...customModelOrder];
    const [moved] = newOrder.splice(draggedModelIndex, 1);
    newOrder.splice(dropIndex, 0, moved);
    setCustomModelOrder(newOrder);
    setSortField('custom');

    setDraggedModelIndex(null);
    setDragOverModelIndex(null);
  };

  const resetModelOrder = () => {
    setCustomModelOrder(products.map((p) => p.model_id));
  };

  // --- Filters ---
  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleCompany = (comp: string) => {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(comp)) next.delete(comp);
      else next.add(comp);
      return next;
    });
  };

  const clearAllFilters = () => {
    setSelectedCategories(new Set());
    setSelectedCompanies(new Set());
    setSortField('custom');
    setSortDirection('asc');
    setSearchQuery('');
  };

  const isSortModified = sortField !== 'custom' || sortDirection !== 'asc';

  const activeFilterCount =
    (selectedCategories.size > 0 ? 1 : 0) +
    (selectedCompanies.size > 0 ? 1 : 0) +
    (isSortModified ? 1 : 0);

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className={`w-full bg-white rounded-xl border border-slate-200 shadow-md flex flex-col font-sans ${className}`}>
      
      {/* ---------------- TOP ACTION BAR (Scrolls out of view when scrolling down) ---------------- */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-amber-50/20 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Search Bar */}
        <div className="relative flex-1 max-w-xl">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Model ID, Name, Category, Company..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all text-slate-900 placeholder-slate-400 shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-700"
              title="Clear search"
              type="button"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          <div className="text-xs font-extrabold text-slate-700 bg-amber-100/70 px-3 py-2 rounded-xl border border-amber-200 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-amber-600" />
            <span>
              {processedRows.length} {processedRows.length === 1 ? 'Model' : 'Models'}
            </span>
          </div>

          {/* 1. Filter & Sort Button */}
          <button
            onClick={() => setIsFilterModalOpen(true)}
            type="button"
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all shadow-xs ${
              activeFilterCount > 0
                ? 'bg-amber-400 text-slate-950 border-amber-400 hover:bg-amber-300 shadow-sm'
                : 'bg-white text-slate-800 border-slate-300 hover:bg-amber-50 hover:border-amber-300'
            }`}
          >
            <Filter className={`w-3.5 h-3.5 ${activeFilterCount > 0 ? 'text-slate-950' : 'text-amber-500'}`} />
            <span>Filter & Sort</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 bg-slate-950 text-white rounded-full text-[10px] font-black">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Manage Columns Button */}
          <button
            onClick={() => setIsColumnModalOpen(true)}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-800 bg-white hover:bg-amber-50 border border-slate-300 hover:border-amber-300 rounded-xl transition-colors shadow-xs"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
            <span>Columns</span>
            <span className="px-1.5 py-0.2 bg-amber-200 text-slate-950 rounded-md text-[10px] font-black">
              {visibleLocations.length}
            </span>
          </button>

          {/* 4. Refresh Button */}
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="inline-flex items-center justify-center p-2 text-slate-800 hover:bg-amber-400 bg-amber-300 border border-amber-400 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
            title="Refresh Data"
            type="button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-slate-950' : ''}`} />
          </button>
        </div>
      </div>

      {/* ---------------- ACTIVE FILTERS CHIP BAR ---------------- */}
      {(selectedCategories.size > 0 || selectedCompanies.size > 0 || isSortModified) && (
        <div className="px-4 py-2 bg-amber-50/80 border-b border-amber-200 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-extrabold text-amber-900 uppercase tracking-wider text-[11px]">Active Filters:</span>
          
          {isSortModified && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-300 text-slate-900 rounded-md font-bold text-xs">
              <span>
                Sorted by: {sortField === 'model_id' ? 'MODEL NAME' : sortField.toUpperCase()} ({sortDirection.toUpperCase()})
              </span>
              <button
                onClick={() => {
                  setSortField('custom');
                  setSortDirection('asc');
                }}
                type="button"
                className="hover:opacity-75 text-amber-700 cursor-pointer"
                title="Reset to default Product Master arrangement"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {Array.from(selectedCategories).map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-400 text-slate-950 rounded-md font-bold text-xs shadow-2xs"
            >
              <span>{cat}</span>
              <button onClick={() => toggleCategory(cat)} type="button" className="hover:opacity-75">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {Array.from(selectedCompanies).map((comp) => (
            <span
              key={comp}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-950 text-white rounded-md font-bold text-xs shadow-2xs"
            >
              <span>{comp}</span>
              <button onClick={() => toggleCompany(comp)} type="button" className="hover:text-amber-300">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          <button
            onClick={clearAllFilters}
            type="button"
            className="text-xs font-bold text-amber-900 hover:text-amber-950 underline ml-2"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ---------------- ERROR BANNER ---------------- */}
      {error && (
        <div className="m-4 p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-rose-800 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={fetchData}
            type="button"
            className="text-xs font-bold text-rose-700 hover:text-rose-900 underline ml-3"
          >
            Retry
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* PIVOT TABLE WITH FIXED STICKY HEADER ROW ON SCROLL   */}
      {/* ---------------------------------------------------- */}
      <div className="relative w-full">
        {isLoading && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-sm flex flex-col items-center justify-center z-40 gap-3 min-h-[300px]">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
            <p className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Loading current inventory stock...
            </p>
          </div>
        )}

        <table className="w-full min-w-full text-left border-separate border-spacing-0">
          {/* Header row stays fixed/sticky at the top when scrolling down */}
          <thead>
            <tr className="bg-slate-100 text-slate-800 text-xs uppercase font-extrabold tracking-wider">
              
              {/* Sticky Top & Left MODEL Column Header */}
              <th
                scope="col"
                className="py-3.5 px-4 sticky top-0 left-0 z-40 bg-slate-100 border-b-2 border-slate-300 border-r border-slate-200 shadow-[2px_2px_4px_rgba(0,0,0,0.06)] min-w-[260px] sm:min-w-[300px] text-slate-950 select-none"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span>MODEL & CATEGORY</span>
                </div>
              </th>

              {/* Dynamic Location Columns (Sticky on vertical scroll) */}
              {visibleLocations.map((loc) => (
                <th
                  key={loc.location_id}
                  scope="col"
                  className="py-3.5 px-3 text-center min-w-[110px] sm:min-w-[125px] border-b-2 border-slate-300 border-r border-slate-200 last:border-r-0 truncate text-slate-950 font-extrabold sticky top-0 z-30 bg-slate-100 shadow-[0_2px_4px_rgba(0,0,0,0.06)]"
                  title={loc.location_name}
                >
                  {loc.location_name}
                </th>
              ))}

              {/* Last Column: TOTAL (Sticky top) */}
              <th
                scope="col"
                className="py-3.5 px-4 text-right min-w-[100px] bg-amber-100 font-black text-slate-950 border-b-2 border-slate-300 border-l-2 border-slate-300 sticky top-0 z-30 shadow-[0_2px_4px_rgba(0,0,0,0.06)]"
              >
                TOTAL
              </th>
            </tr>
          </thead>

          {/* Table Body (Compact single-line rows with Category side-by-side) */}
          <tbody className="divide-y divide-slate-200 text-slate-800">
            {processedRows.length > 0 ? (
              processedRows.map((row) => (
                <tr
                  key={row.modelId}
                  onClick={() => onModelClick?.(row.modelId)}
                  className={`hover:bg-amber-50/50 transition-colors group ${
                    onModelClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {/* Sticky MODEL Left Cell */}
                  <td className="py-2.5 px-4 sticky left-0 bg-white group-hover:bg-amber-50/50 z-10 border-b border-slate-200 border-r border-slate-200 shadow-[2px_0_0_0_#e2e8f0] whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[14px] font-black text-slate-950 tracking-tight shrink-0">
                        {row.modelId}
                      </span>
                      {row.company && (
                        <span className="text-[11px] font-extrabold text-slate-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded shrink-0">
                          {row.company}
                        </span>
                      )}
                      {row.category && (
                        <span
                          className="text-[11px] text-slate-500 font-medium truncate max-w-[220px]"
                          title={row.category}
                        >
                          {row.category}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Dynamic Location Cells (Red 0s) */}
                  {visibleLocations.map((loc) => {
                    const quantity = row.quantities[loc.location_id] || 0;
                    const isZero = quantity === 0;

                    return (
                      <td
                        key={loc.location_id}
                        className={`py-2.5 px-4 text-center border-b border-slate-100 border-r border-slate-100 tabular-nums text-[15px] ${
                          isZero
                            ? 'text-red-500 font-bold'
                            : 'text-slate-950 font-extrabold'
                        }`}
                      >
                        {quantity}
                      </td>
                    );
                  })}

                  {/* TOTAL Column */}
                  <td className="py-2.5 px-4 text-right font-black text-[15px] text-slate-950 bg-slate-50/40 group-hover:bg-amber-50/60 border-b border-slate-200 border-l-2 border-slate-200 tabular-nums">
                    <span className={row.total === 0 ? 'text-red-500' : 'text-slate-950'}>
                      {row.total}
                    </span>
                  </td>
                </tr>
              ))
            ) : !isLoading ? (
              <tr>
                <td
                  colSpan={visibleLocations.length + 2}
                  className="py-16 text-center text-slate-400 border-b border-slate-200"
                >
                  <div className="flex flex-col items-center justify-center gap-2.5">
                    <Package className="w-9 h-9 stroke-1 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">No matching models found</p>
                    <p className="text-xs text-slate-400">
                      Try clearing filters or changing your search criteria.
                    </p>
                    {(selectedCategories.size > 0 || selectedCompanies.size > 0 || searchQuery) && (
                      <button
                        onClick={clearAllFilters}
                        type="button"
                        className="mt-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg text-xs font-bold shadow-xs"
                      >
                        Reset All Filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>

          {/* Bottom Total Footer Row (Scrolls naturally at the end of the table) */}
          {processedRows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 font-extrabold text-slate-950 text-sm">
                <td className="py-3.5 px-4 sticky left-0 bg-slate-100 z-10 border-t-2 border-slate-300 border-r border-slate-200 shadow-[2px_0_0_0_#cbd5e1] uppercase tracking-wider text-slate-800">
                  TOTAL
                </td>
                {visibleLocations.map((loc) => {
                  const locTotal = columnTotals.totals[loc.location_id] || 0;
                  return (
                    <td
                      key={loc.location_id}
                      className="py-3.5 px-4 text-center border-t-2 border-slate-300 border-r border-slate-200 tabular-nums text-slate-950 font-black bg-slate-100"
                    >
                      {locTotal}
                    </td>
                  );
                })}
                <td className="py-3.5 px-4 text-right font-black text-slate-950 bg-amber-200 border-t-2 border-slate-300 border-l-2 border-slate-300 tabular-nums text-base">
                  {columnTotals.grandTotal}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ---------------- 1. FILTER & SORT MODAL ---------------- */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-amber-50/40">
              <div className="flex items-center gap-2.5">
                <Filter className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-extrabold text-slate-900">Filter & Sort Stock</h3>
              </div>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                type="button"
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 divide-y divide-slate-100">
              {/* SORT OPTIONS */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-amber-500" />
                    Sort Order
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
                    <button
                      onClick={() => setSortDirection('asc')}
                      type="button"
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        sortDirection === 'asc' ? 'bg-amber-400 shadow-xs text-slate-950 font-bold' : 'text-slate-600'
                      }`}
                    >
                      Ascending (A-Z)
                    </button>
                    <button
                      onClick={() => setSortDirection('desc')}
                      type="button"
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        sortDirection === 'desc' ? 'bg-amber-400 shadow-xs text-slate-950 font-bold' : 'text-slate-600'
                      }`}
                    >
                      Descending (Z-A)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'custom', label: 'Default (Product Master)' },
                    { id: 'model_id', label: 'Model Name' },
                    { id: 'category', label: 'Category' },
                    { id: 'company', label: 'Company' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setSortField(option.id as SortField)}
                      type="button"
                      className={`py-2 px-3 text-xs font-bold rounded-xl border text-center transition-all ${
                        sortField === option.id
                          ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300 hover:bg-amber-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* FILTER BY CATEGORY */}
              <div className="pt-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-500" />
                    Filter by Category ({selectedCategories.size} selected)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedCategories(new Set(allCategories))}
                      type="button"
                      className="text-xs font-bold text-amber-700 hover:text-amber-900"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => setSelectedCategories(new Set())}
                      type="button"
                      className="text-xs font-bold text-rose-600 hover:text-rose-800"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2.5 space-y-1.5 bg-slate-50/50">
                  {allCategories.length > 0 ? (
                    allCategories.map((cat) => {
                      const isChecked = selectedCategories.has(cat);
                      return (
                        <label
                          key={cat}
                          className="flex items-center gap-2.5 p-1.5 hover:bg-white rounded-lg cursor-pointer text-xs font-bold text-slate-800 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCategory(cat)}
                            className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-400 cursor-pointer"
                          />
                          <span className="truncate">{cat}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-400 p-2">No categories available</p>
                  )}
                </div>
              </div>

              {/* FILTER BY COMPANY */}
              <div className="pt-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-500" />
                    Filter by Company ({selectedCompanies.size} selected)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedCompanies(new Set(allCompanies))}
                      type="button"
                      className="text-xs font-bold text-amber-700 hover:text-amber-900"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => setSelectedCompanies(new Set())}
                      type="button"
                      className="text-xs font-bold text-rose-600 hover:text-rose-800"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2.5 space-y-1.5 bg-slate-50/50">
                  {allCompanies.length > 0 ? (
                    allCompanies.map((comp) => {
                      const isChecked = selectedCompanies.has(comp);
                      return (
                        <label
                          key={comp}
                          className="flex items-center gap-2.5 p-1.5 hover:bg-white rounded-lg cursor-pointer text-xs font-bold text-slate-800 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCompany(comp)}
                            className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-400 cursor-pointer"
                          />
                          <span className="truncate">{comp}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-400 p-2">No company entries found</p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={clearAllFilters}
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Defaults</span>
              </button>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                type="button"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>Apply Filters</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 2. MANAGE COLUMNS MODAL ---------------- */}
      {isColumnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-amber-50/40">
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Manage Location Columns</h3>
                  <p className="text-xs text-slate-500">Drag to reorder left-to-right columns or toggle visibility.</p>
                </div>
              </div>
              <button
                onClick={() => setIsColumnModalOpen(false)}
                type="button"
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-1.5 flex-1">
              {orderedLocationIds.map((locId, idx) => {
                const loc = locationMap.get(locId);
                if (!loc) return null;
                const isHidden = hiddenLocationIds.has(locId);
                const isDragging = draggedLocationIndex === idx;
                const isDragOver = dragOverLocationIndex === idx;

                return (
                  <div
                    key={locId}
                    draggable
                    onDragStart={() => handleLocationDragStart(idx)}
                    onDragOver={(e) => handleLocationDragOver(e, idx)}
                    onDrop={() => handleLocationDrop(idx)}
                    onDragEnd={() => {
                      setDraggedLocationIndex(null);
                      setDragOverLocationIndex(null);
                    }}
                    className={`py-2 px-3 flex items-center justify-between rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none ${
                      isDragging
                        ? 'opacity-40 bg-amber-100 border-amber-400 border-dashed'
                        : isDragOver
                        ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-300'
                        : 'bg-white hover:bg-amber-50/50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <GripVertical className="w-4 h-4 text-slate-400 shrink-0" />
                      <button
                        onClick={() => toggleLocationVisibility(locId)}
                        type="button"
                        className={`p-1 rounded transition-colors ${
                          isHidden ? 'text-slate-300 hover:text-slate-500' : 'text-slate-900'
                        }`}
                        title={isHidden ? 'Show Column' : 'Hide Column'}
                      >
                        {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-amber-500" />}
                      </button>
                      <span
                        className={`text-sm font-bold ${
                          isHidden ? 'text-slate-400 line-through' : 'text-slate-950'
                        }`}
                      >
                        {loc.location_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveColumn(idx, 'up')}
                        disabled={idx === 0}
                        type="button"
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-amber-100 disabled:opacity-30"
                        title="Move Left"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveColumn(idx, 'down')}
                        disabled={idx === orderedLocationIds.length - 1}
                        type="button"
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-amber-100 disabled:opacity-30"
                        title="Move Right"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={resetColumnOrder}
                type="button"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Default</span>
              </button>
              <button
                onClick={() => setIsColumnModalOpen(false)}
                type="button"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockView;
