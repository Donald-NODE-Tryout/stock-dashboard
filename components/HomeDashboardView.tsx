'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes,
  TrendingUp,
  AlertTriangle,
  PackageCheck,
  Building2,
  ArrowRightLeft,
  Search,
  Filter,
  RefreshCw,
  Clock,
  ChevronRight,
  Flame,
  Skull,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Activity,
  CheckCircle2,
  X,
  MapPin,
  Tag,
  Truck
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/context/AuthContext';

// ==========================================
// INTERFACES & TYPES
// ==========================================

export interface AnalyticsKpis {
  totalStockOnHand: number;
  thirtyDaySalesVolume: number;
  activeSkuCount: number;
  lowStockAlertCount: number;
}

export interface LocationMatrixCard {
  location_id: string;
  location_name: string;
  status: string;
  stock: number;
  sharePercentage: number;
  isCentralHub: boolean;
}

export interface DoiItem {
  model_id: string;
  model_name?: string;
  category?: string;
  company?: string;
  stock: number;
  sales30d: number;
  dailyBurn: number;
  doi: number;
  badge: 'RED' | 'AMBER' | 'GREEN' | 'INACTIVE';
}

export interface TopPerformer {
  model_id: string;
  salesQty: number;
  stock: number;
  model_name?: string;
  category?: string;
  company?: string;
}

export interface DeadStockItem {
  model_id: string;
  stock: number;
  lastSaleDate: string;
  daysInactive: number;
  model_name?: string;
  category?: string;
  company?: string;
}

export interface TransferVelocityData {
  totalVolume30d: number;
  transferCount30d: number;
  breakdown: Array<{
    destination_id: string;
    destination_name: string;
    unitsTransferred: number;
    transferCount: number;
  }>;
}

export interface LiveLedgerEntry {
  entry_number: number;
  entry_id: string;
  date: string;
  action: string;
  model_id: string;
  qty: number;
  from_location: string | null;
  to_location: string | null;
  from_location_id: string | null;
  to_location_id: string | null;
  remarks: string | null;
  entry_by: string | null;
  employee_id: string | null;
  entry_time: string | null;
}

export interface HomeDashboardViewProps {
  supabase?: SupabaseClient;
  className?: string;
  onNavigate?: (view: string, filter?: Record<string, any>) => void;
}

// ==========================================
// COMPONENT
// ==========================================

export const HomeDashboardView: React.FC<HomeDashboardViewProps> = ({
  supabase,
  className = '',
  onNavigate,
}) => {
  const { profile } = useAuth();

  // --- Analytics States ---
  const [kpis, setKpis] = useState<AnalyticsKpis>({
    totalStockOnHand: 0,
    thirtyDaySalesVolume: 0,
    activeSkuCount: 0,
    lowStockAlertCount: 0,
  });
  const [locationMatrix, setLocationMatrix] = useState<LocationMatrixCard[]>([]);
  const [doiCriticalList, setDoiCriticalList] = useState<DoiItem[]>([]);
  const [topPerformers30d, setTopPerformers30d] = useState<TopPerformer[]>([]);
  const [topPerformers90d, setTopPerformers90d] = useState<TopPerformer[]>([]);
  const [deadStockList, setDeadStockList] = useState<DeadStockItem[]>([]);
  const [deadStockTotalCount, setDeadStockTotalCount] = useState<number>(0);
  const [transferVelocity, setTransferVelocity] = useState<TransferVelocityData>({
    totalVolume30d: 0,
    transferCount30d: 0,
    breakdown: [],
  });

  // --- Live Feed States ---
  const [liveLedger, setLiveLedger] = useState<LiveLedgerEntry[]>([]);
  const [feedSearch, setFeedSearch] = useState<string>('');
  const [feedActionFilter, setFeedActionFilter] = useState<string>('ALL');
  const [feedLocationFilter, setFeedLocationFilter] = useState<string>('ALL');
  const [feedDateFrom, setFeedDateFrom] = useState<string>('');
  const [feedDateTo, setFeedDateTo] = useState<string>('');
  const [activeVelocityTab, setActiveVelocityTab] = useState<'30d' | '90d'>('30d');

  // --- Loading States ---
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Fetch All Data ---
  const fetchDashboardData = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) setIsRefreshing(true);
      else setIsLoading(true);
      setErrorMessage(null);

      // 1. Fetch Analytics Aggregates
      const analyticsRes = await fetch('/api/dashboard/analytics');
      if (!analyticsRes.ok) {
        throw new Error(`Analytics API returned status ${analyticsRes.status}`);
      }
      const analyticsData = await analyticsRes.json();
      if (analyticsData.error) throw new Error(analyticsData.error);

      if (analyticsData.kpis) setKpis(analyticsData.kpis);
      if (analyticsData.locationMatrix) setLocationMatrix(analyticsData.locationMatrix);
      if (analyticsData.inventoryHealth) {
        setDoiCriticalList(analyticsData.inventoryHealth.doiCriticalList || []);
        setTopPerformers30d(analyticsData.inventoryHealth.topPerformers30d || []);
        setTopPerformers90d(analyticsData.inventoryHealth.topPerformers90d || []);
        setDeadStockList(analyticsData.inventoryHealth.deadStockList || []);
        setDeadStockTotalCount(analyticsData.inventoryHealth.deadStockCount || 0);
        if (analyticsData.inventoryHealth.transferVelocity) {
          setTransferVelocity(analyticsData.inventoryHealth.transferVelocity);
        }
      }

      // 2. Fetch Live Feed from dashboard_ledger_display
      let feedEntries: LiveLedgerEntry[] = [];
      if (supabase) {
        try {
          const { data: dView, error: dErr } = await supabase
            .from('dashboard_ledger_display')
            .select('*')
            .order('entry_number', { ascending: false })
            .limit(100);

          if (!dErr && dView) {
            feedEntries = dView as LiveLedgerEntry[];
          }
        } catch (clientErr) {
          console.warn('Direct view query failed, using /api/ledger fallback:', clientErr);
        }
      }

      if (feedEntries.length === 0) {
        const ledgerRes = await fetch('/api/ledger');
        if (ledgerRes.ok) {
          const lData = await ledgerRes.json();
          feedEntries = (lData.ledger || []).slice(0, 100);
        }
      }

      setLiveLedger(feedEntries);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching dashboard data';
      console.error('Failed to load dashboard:', err);
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // --- Filtered Live Feed ---
  const filteredFeed = useMemo(() => {
    let result = [...liveLedger];

    // Action filter
    if (feedActionFilter !== 'ALL') {
      result = result.filter((item) => item.action?.toUpperCase() === feedActionFilter);
    }

    // Location filter
    if (feedLocationFilter !== 'ALL') {
      const selectedLocObj = locationMatrix.find(
        (l) =>
          l.location_id.toLowerCase() === feedLocationFilter.toLowerCase() ||
          l.location_name.toLowerCase() === feedLocationFilter.toLowerCase()
      );
      const targetId = selectedLocObj ? selectedLocObj.location_id.toLowerCase() : feedLocationFilter.toLowerCase();
      const targetName = selectedLocObj ? selectedLocObj.location_name.toLowerCase() : feedLocationFilter.toLowerCase();

      result = result.filter((item) => {
        const fromLoc = (item.from_location || '').toLowerCase().trim();
        const toLoc = (item.to_location || '').toLowerCase().trim();
        const fromId = (item.from_location_id || '').toLowerCase().trim();
        const toId = (item.to_location_id || '').toLowerCase().trim();

        return (
          fromId === targetId ||
          toId === targetId ||
          fromLoc === targetName ||
          toLoc === targetName ||
          fromLoc === targetId ||
          toLoc === targetId
        );
      });
    }

    // Date range
    if (feedDateFrom) {
      result = result.filter((item) => (item.date || '') >= feedDateFrom);
    }
    if (feedDateTo) {
      result = result.filter((item) => (item.date || '') <= feedDateTo);
    }

    // Text search (model_id, remarks, entry_id)
    if (feedSearch.trim()) {
      const q = feedSearch.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.model_id.toLowerCase().includes(q) ||
          item.entry_id.toLowerCase().includes(q) ||
          (item.remarks && item.remarks.toLowerCase().includes(q)) ||
          (item.from_location && item.from_location.toLowerCase().includes(q)) ||
          (item.to_location && item.to_location.toLowerCase().includes(q)) ||
          (item.entry_by && item.entry_by.toLowerCase().includes(q))
      );
    }

    return result;
  }, [liveLedger, feedActionFilter, feedLocationFilter, feedDateFrom, feedDateTo, feedSearch]);

  // Action badge helper
  const renderActionPill = (action: string) => {
    const act = (action || '').toUpperCase();
    switch (act) {
      case 'SALE':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 border border-rose-500/20">
            SALE
          </span>
        );
      case 'PURCHASE':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            PURCHASE
          </span>
        );
      case 'TRANSFER':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 border border-blue-500/20">
            TRANSFER
          </span>
        );
      case 'ENTRY':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 border border-purple-500/20">
            ENTRY
          </span>
        );
      case 'ADJUSTMENT':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20">
            ADJUSTMENT
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700">
            {act}
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse p-4">
        {/* Skeleton Top KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200/60 rounded-2xl border border-slate-200" />
          ))}
        </div>
        {/* Skeleton Location Matrix */}
        <div className="h-44 bg-slate-200/60 rounded-2xl border border-slate-200" />
        {/* Skeleton Health & Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-96 bg-slate-200/60 rounded-2xl border border-slate-200" />
          <div className="lg:col-span-2 h-96 bg-slate-200/60 rounded-2xl border border-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>

      {/* ---------------------------------------------------- */}
      {/* ⚡ HEADER BAR & REFRESH                              */}
      {/* ---------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 text-white p-5 rounded-2xl shadow-xl border border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-400/20 border border-amber-300">
            <Flame className="w-6 h-6 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-white">
                INVENTORY COMMAND CENTER
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                LIVE ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {process.env.NEXT_PUBLIC_APP_NAME || 'Enterprise ERP'} • Real-time branch inventory, velocity burn rates & audit stream
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchDashboardData(true)}
            disabled={isRefreshing}
            className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition-all border border-slate-700 flex items-center gap-2 cursor-pointer shadow-xs"
            title="Refresh live data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Sync Live Data'}</span>
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('ledger')}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-amber-400/20 cursor-pointer"
            >
              <span>Record Movement</span>
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ==================================================== */}
      {/* 🚀 SECTION A: TOP KPI STAT STRIP                     */}
      {/* ==================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Total Stock on Hand */}
        <div className="relative overflow-hidden bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Total Stock on Hand
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
              <Boxes className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black text-slate-950 tracking-tight">
              {kpis.totalStockOnHand.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-500">units</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-600 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 inline" />
            <span>Sum of live inventory across all 4 nodes</span>
          </div>
        </div>

        {/* KPI 2: 30-Day Sales Volume */}
        <div className="relative overflow-hidden bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              30-Day Sales Volume
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black text-slate-950 tracking-tight">
              {kpis.thirtyDaySalesVolume.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-500">units sold</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-600 font-bold flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 inline text-emerald-600" />
            <span>Avg ~{Math.round(kpis.thirtyDaySalesVolume / 30)} units daily velocity</span>
          </div>
        </div>

        {/* KPI 3: Active SKU Count */}
        <div className="relative overflow-hidden bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Active In-Stock SKUs
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold">
              <PackageCheck className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black text-slate-950 tracking-tight">
              {kpis.activeSkuCount}
            </span>
            <span className="text-xs font-bold text-slate-500">catalog models</span>
          </div>
          <div className="mt-2 text-[11px] text-blue-600 font-semibold flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 inline text-blue-600" />
            <span>Products with positive live balance</span>
          </div>
        </div>

        {/* KPI 4: Low Stock Runway Alerts */}
        <div className="relative overflow-hidden bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Runway Alerts (DOI &lt; 7d)
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-900 flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`font-mono text-3xl font-black tracking-tight ${kpis.lowStockAlertCount > 0 ? 'text-rose-600' : 'text-slate-950'}`}>
              {kpis.lowStockAlertCount}
            </span>
            <span className="text-xs font-bold text-slate-500">critical SKUs</span>
          </div>
          <div className="mt-2 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
            <span>Requires replenishment from Central Hub</span>
          </div>
        </div>

      </div>

      {/* ==================================================== */}
      {/* 🏢 SECTION B: LOCATION INVENTORY MATRIX             */}
      {/* ==================================================== */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-600" />
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-950">
                Location Inventory Matrix
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700">
                Formula: Σ Inflow - Σ Outflow
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Central Distribution Hub vs Satellite Retail outlets across Gujarat
            </p>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
            >
              <span>Explore Stock Matrix</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          {locationMatrix.map((loc) => {
            const isCentral = loc.isCentralHub;

            return (
              <div
                key={loc.location_id}
                className={`p-4 rounded-xl border transition-all ${
                  isCentral
                    ? 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-300 shadow-xs'
                    : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[11px] font-black text-slate-500">
                    {loc.location_id}
                  </span>
                  {isCentral ? (
                    <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-black text-[10px] rounded-md uppercase tracking-wider shadow-2xs">
                      Central Hub
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 font-bold text-[10px] rounded uppercase">
                      Satellite
                    </span>
                  )}
                </div>

                <div className="text-sm font-black text-slate-950 tracking-tight truncate">
                  {loc.location_name}
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-2xl font-black text-slate-900">
                      {loc.stock.toLocaleString()}
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">units</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-600">
                    {loc.sharePercentage}% of total
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isCentral ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                    style={{ width: `${Math.max(3, loc.sharePercentage)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================== */}
      {/* 📊 SECTION C: VELOCITY & INVENTORY HEALTH ANALYTICS  */}
      {/* ==================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* C1: Days of Inventory (DOI) Forecast Runway */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-950">
                  Days of Inventory (DOI) Runway
                </h3>
              </div>
              <span className="text-[10px] font-extrabold text-slate-500 uppercase">
                Stock / Burn Rate
              </span>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
              Predicted days of runway before stock-out based on 30-day sales velocity.
            </p>

            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {doiCriticalList.length > 0 ? (
                doiCriticalList.map((item) => (
                  <div
                    key={item.model_id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-mono text-xs font-black text-slate-900 truncate">
                        {item.model_id}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {item.stock} in stock • {item.dailyBurn} burn/day
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-black tracking-tight ${
                          item.badge === 'RED'
                            ? 'bg-rose-100 text-rose-700 border border-rose-200'
                            : 'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {item.doi}d runway
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-xl">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                  All active items operating above 15+ days safe runway
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              &lt; 7d (Critical)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              7-14d (Warning)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              &gt; 15d (Healthy)
            </span>
          </div>
        </div>

        {/* C2: ABC Sales Velocity: Top Movers vs Dead Stock */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-950">
                  ABC Sales Velocity
                </h3>
              </div>

              {/* 30d / 90d Tab */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-black">
                <button
                  type="button"
                  onClick={() => setActiveVelocityTab('30d')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    activeVelocityTab === '30d' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  30 Days
                </button>
                <button
                  type="button"
                  onClick={() => setActiveVelocityTab('90d')}
                  className={`px-2 py-0.5 rounded cursor-pointer ${
                    activeVelocityTab === '90d' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  90 Days
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {(activeVelocityTab === '30d' ? topPerformers30d : topPerformers90d).map((p, idx) => (
                <div
                  key={p.model_id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                    <span className="w-5 font-mono text-xs font-black text-slate-400 text-center">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs font-black text-slate-900 truncate">
                        {p.model_id}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {p.company || 'In-House'} • {p.stock} in stock
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-xs font-black text-emerald-600 block">
                      +{p.salesQty} sold
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-600">
            <span>Fast-moving inventory driving 80% turnover</span>
          </div>
        </div>

        {/* C3: Dead Stock & Transfer Velocity */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Skull className="w-4 h-4 text-rose-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-950">
                  Dead Stock Radar
                </h3>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-700">
                {deadStockTotalCount} SKUs (&gt;60d idle)
              </span>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
              Items occupying warehouse floor space with 0 customer sales over the past 60+ days.
            </p>

            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
              {deadStockList.slice(0, 5).map((item) => (
                <div
                  key={item.model_id}
                  className="flex items-center justify-between p-2 rounded-lg bg-rose-50/40 border border-rose-100 text-xs"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="font-mono text-xs font-black text-slate-900 truncate">
                      {item.model_id}
                    </div>
                    <div className="text-[10px] text-rose-700">
                      {item.daysInactive >= 999 ? 'Never sold' : `${item.daysInactive} days without sale`}
                    </div>
                  </div>
                  <div className="font-mono text-xs font-bold text-slate-700">
                    {item.stock} idle
                  </div>
                </div>
              ))}
            </div>

            {/* Inter-Branch Transfer Velocity Widget */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Central Hub Replenishment (30d)</span>
                </div>
                <span className="font-mono text-xs font-black text-blue-600">
                  {transferVelocity.totalVolume30d} units
                </span>
              </div>

              <div className="space-y-1 text-[11px] text-slate-600">
                {transferVelocity.breakdown.map((b) => (
                  <div key={b.destination_id} className="flex items-center justify-between py-0.5">
                    <span className="font-medium text-slate-700 truncate">
                      MOTA MOVA → {b.destination_name}
                    </span>
                    <span className="font-mono font-bold text-slate-900 shrink-0">
                      {b.unitsTransferred} units ({b.transferCount} trips)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 text-[10px] text-slate-400 font-medium text-right">
            Auto-calculated from historical ledger
          </div>
        </div>

      </div>

      {/* ==================================================== */}
      {/* 📜 SECTION D: LIVE INTERACTIVE LEDGER FEED          */}
      {/* ==================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Feed Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-600 animate-pulse" />
              <h2 className="text-base font-black text-slate-950 tracking-tight">
                LIVE INTERACTIVE AUDIT STREAM
              </h2>
              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-black text-[10px] rounded-md font-mono">
                {filteredFeed.length} records
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Bound directly to <code className="font-mono text-[11px] font-bold text-slate-700">dashboard_ledger_display</code> view sorted by integer sequence
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={feedSearch}
                onChange={(e) => setFeedSearch(e.target.value)}
                placeholder="Search model, remarks, ID..."
                className="w-full pl-9 pr-7 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              />
              {feedSearch && (
                <button
                  type="button"
                  onClick={() => setFeedSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Action Filter */}
            <select
              value={feedActionFilter}
              onChange={(e) => setFeedActionFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            >
              <option value="ALL">All Actions</option>
              <option value="SALE">SALE</option>
              <option value="PURCHASE">PURCHASE</option>
              <option value="TRANSFER">TRANSFER</option>
              <option value="ENTRY">ENTRY</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
            </select>

            {/* Location Filter */}
            <select
              value={feedLocationFilter}
              onChange={(e) => setFeedLocationFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            >
              <option value="ALL">All Locations</option>
              {locationMatrix.map((loc) => (
                <option key={loc.location_id} value={loc.location_name}>
                  {loc.location_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feed Table */}
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-600 sticky top-0 z-10 shadow-xs">
                <th className="py-3 px-4">SEQ #</th>
                <th className="py-3 px-4">DATE</th>
                <th className="py-3 px-4">ACTION</th>
                <th className="py-3 px-4">MODEL ID</th>
                <th className="py-3 px-4 text-right">QTY</th>
                <th className="py-3 px-4">FROM</th>
                <th className="py-3 px-4">TO</th>
                <th className="py-3 px-4">OPERATOR</th>
                <th className="py-3 px-4">REMARKS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
              {filteredFeed.length > 0 ? (
                filteredFeed.map((row) => (
                  <tr key={row.entry_id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {row.entry_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-slate-600 font-semibold">
                      {row.date}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {renderActionPill(row.action)}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono font-bold text-slate-900">
                      {row.model_id}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-right font-mono font-black text-slate-900">
                      {row.action === 'SALE' ? `-${row.qty}` : `+${row.qty}`}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-slate-600 font-medium">
                      {row.from_location || <span className="text-slate-300 font-light">—</span>}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-bold text-slate-900">
                      {row.to_location || <span className="text-slate-300 font-light">—</span>}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-slate-700">
                      {row.entry_by || row.employee_id || 'System'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 max-w-[200px] truncate" title={row.remarks || ''}>
                      {row.remarks || <span className="text-slate-300 font-light">—</span>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                    No transactions match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default HomeDashboardView;
