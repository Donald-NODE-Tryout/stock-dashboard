'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  History,
  Search,
  Filter,
  RefreshCw,
  Trash2,
  Calendar,
  User,
  Package,
  Layers,
  MapPin,
  Truck,
  Users,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  FileCode,
  ShieldAlert,
  ArrowRightLeft,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditRecord {
  archive_id: number;
  table_name: string;
  record_id: string;
  deleted_data: Record<string, any>;
  deleted_at: string;
  deleted_by?: string | null;
  reason?: string | null;
}

export interface AuditArchiveViewProps {
  supabase?: SupabaseClient<any, any, any>;
}

const TABLE_CONFIGS: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; badgeClass: string }
> = {
  ledger: {
    label: 'Stock Movements',
    icon: ArrowRightLeft,
    color: 'sky',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  product_master: {
    label: 'Product Master',
    icon: Package,
    color: 'violet',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
  },
  employee_register: {
    label: 'Staff Register',
    icon: Users,
    color: 'emerald',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  locations: {
    label: 'Location Master',
    icon: MapPin,
    color: 'amber',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  dispatch_tickets: {
    label: 'Dispatch Tickets',
    icon: Truck,
    color: 'orange',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
  },
};

export const AuditArchiveView: React.FC<AuditArchiveViewProps> = ({ supabase }) => {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tablePending, setTablePending] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Filters
  const [selectedTable, setSelectedTable] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchAuditData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`/api/audit/deleted?table=${selectedTable}`);
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      if (data.tablePending) {
        setTablePending(true);
        setRecords([]);
      } else {
        setTablePending(false);
        setRecords(data.archive || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch audit log';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTable]);

  useEffect(() => {
    fetchAuditData();
  }, [fetchAuditData]);

  // Filter records in memory by search query
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return records;

    return records.filter((item) => {
      const idMatch = (item.record_id || '').toLowerCase().includes(q);
      const userMatch = (item.deleted_by || '').toLowerCase().includes(q);
      const tableMatch = (item.table_name || '').toLowerCase().includes(q);
      const jsonMatch = JSON.stringify(item.deleted_data || {}).toLowerCase().includes(q);
      return idMatch || userMatch || tableMatch || jsonMatch;
    });
  }, [records, searchQuery]);

  // Metrics summary
  const metrics = useMemo(() => {
    let ledger = 0;
    let product_master = 0;
    let employee_register = 0;
    let locations = 0;
    let dispatch_tickets = 0;

    records.forEach((r) => {
      if (r.table_name === 'ledger') ledger++;
      else if (r.table_name === 'product_master') product_master++;
      else if (r.table_name === 'employee_register') employee_register++;
      else if (r.table_name === 'locations') locations++;
      else if (r.table_name === 'dispatch_tickets') dispatch_tickets++;
    });

    return {
      total: records.length,
      ledger,
      product_master,
      employee_register,
      locations,
      dispatch_tickets,
    };
  }, [records]);

  const [showSqlDrawer, setShowSqlDrawer] = useState(false);

  const MIGRATION_SQL = `-- ENTERPRISE AUDIT ARCHIVE SYSTEM
CREATE TABLE IF NOT EXISTS public.deleted_records_archive (
  archive_id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_data JSONB NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_deleted_archive_table ON public.deleted_records_archive(table_name);
CREATE INDEX IF NOT EXISTS idx_deleted_archive_record_id ON public.deleted_records_archive(record_id);
CREATE INDEX IF NOT EXISTS idx_deleted_archive_deleted_at ON public.deleted_records_archive(deleted_at DESC);

ALTER TABLE public.deleted_records_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access to deleted_records_archive"
  ON public.deleted_records_archive FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role full access to deleted_records_archive"
  ON public.deleted_records_archive FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.archive_deleted_record()
RETURNS TRIGGER AS $$
DECLARE
  rec_id TEXT;
  performed_by TEXT;
BEGIN
  IF TG_TABLE_NAME = 'ledger' THEN
    rec_id := COALESCE(OLD.entry_id, 'UNKNOWN');
  ELSIF TG_TABLE_NAME = 'product_master' THEN
    rec_id := COALESCE(OLD.model_id, 'UNKNOWN');
  ELSIF TG_TABLE_NAME = 'employee_register' THEN
    rec_id := COALESCE(OLD.employee_id, 'UNKNOWN');
  ELSIF TG_TABLE_NAME = 'locations' THEN
    rec_id := COALESCE(OLD.location_id::text, 'UNKNOWN');
  ELSIF TG_TABLE_NAME = 'dispatch_tickets' THEN
    rec_id := COALESCE(OLD.ticket_id, 'UNKNOWN');
  ELSE
    rec_id := 'UNKNOWN';
  END IF;

  BEGIN
    performed_by := COALESCE(
      current_setting('request.jwt.claim.sub', true),
      current_setting('app.current_user', true),
      'SYSTEM'
    );
  EXCEPTION WHEN OTHERS THEN
    performed_by := 'SYSTEM';
  END;

  INSERT INTO public.deleted_records_archive (
    table_name, record_id, deleted_data, deleted_at, deleted_by
  ) VALUES (
    TG_TABLE_NAME, rec_id, to_jsonb(OLD), NOW(), performed_by
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_archive_deleted_ledger ON public.ledger;
CREATE TRIGGER trg_archive_deleted_ledger
  BEFORE DELETE ON public.ledger FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_record();

DROP TRIGGER IF EXISTS trg_archive_deleted_product ON public.product_master;
CREATE TRIGGER trg_archive_deleted_product
  BEFORE DELETE ON public.product_master FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_record();

DROP TRIGGER IF EXISTS trg_archive_deleted_employee ON public.employee_register;
CREATE TRIGGER trg_archive_deleted_employee
  BEFORE DELETE ON public.employee_register FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_record();

DROP TRIGGER IF EXISTS trg_archive_deleted_location ON public.locations;
CREATE TRIGGER trg_archive_deleted_location
  BEFORE DELETE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_record();

DROP TRIGGER IF EXISTS trg_archive_deleted_dispatch ON public.dispatch_tickets;
CREATE TRIGGER trg_archive_deleted_dispatch
  BEFORE DELETE ON public.dispatch_tickets FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_record();`;

  const copySqlMigrationNotice = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* ---------------- SQL MIGRATION ALERT IF PENDING ---------------- */}
      {tablePending && (
        <div className="p-4 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl space-y-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500/20 text-amber-500 rounded-xl shrink-0 mt-0.5">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 tracking-tight">
                  Database Triggers Migration Ready
                </h4>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  The frontend code and API routes are live, but the{' '}
                  <code className="px-1.5 py-0.5 bg-slate-200 text-slate-900 font-mono rounded text-[11px] font-bold">
                    deleted_records_archive
                  </code>{' '}
                  table and automatic database triggers need to be created in PostgreSQL. Run the script in your Supabase SQL Editor to activate automatic deletion capturing.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSqlDrawer(!showSqlDrawer)}
                className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <FileCode className="w-4 h-4 text-amber-600" />
                <span>{showSqlDrawer ? 'Hide SQL' : 'View SQL'}</span>
              </button>

              <button
                type="button"
                onClick={copySqlMigrationNotice}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                {copiedSql ? <Check className="w-4 h-4 text-emerald-950 font-black" /> : <Copy className="w-4 h-4" />}
                <span>{copiedSql ? 'SQL Copied to Clipboard!' : 'Copy SQL Script'}</span>
              </button>
            </div>
          </div>

          {/* Expandable SQL Viewer Drawer */}
          {showSqlDrawer && (
            <div className="mt-3 p-3 bg-slate-950 text-slate-100 rounded-xl border border-slate-800 text-xs font-mono space-y-2">
              <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                <span className="font-bold uppercase tracking-wider text-[10px]">
                  supabase/migrations/20260925_audit_archive_system.sql
                </span>
                <button
                  type="button"
                  onClick={copySqlMigrationNotice}
                  className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 text-[11px]"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedSql ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <pre className="overflow-x-auto p-2 text-emerald-400 text-[11px] leading-relaxed max-h-60 scrollbar-thin">
                {MIGRATION_SQL}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ---------------- TOP STAT CARDS ---------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Total Deleted</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-slate-950">{metrics.total}</span>
            <span className="text-[10px] font-bold text-slate-400">records</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-sky-600">Stock Movements</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-slate-950">{metrics.ledger}</span>
            <span className="text-[10px] font-bold text-slate-400">entries</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-violet-600">Products</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-slate-950">{metrics.product_master}</span>
            <span className="text-[10px] font-bold text-slate-400">models</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">Staff</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-slate-950">{metrics.employee_register}</span>
            <span className="text-[10px] font-bold text-slate-400">staff</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600">Locations</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-slate-950">{metrics.locations}</span>
            <span className="text-[10px] font-bold text-slate-400">branches</span>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600">Dispatch</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-black text-slate-950">{metrics.dispatch_tickets}</span>
            <span className="text-[10px] font-bold text-slate-400">tickets</span>
          </div>
        </div>
      </div>

      {/* ---------------- FILTER TOOLBAR ---------------- */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Entity Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedTable('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                selectedTable === 'ALL'
                  ? 'bg-slate-950 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Entities
            </button>
            {Object.entries(TABLE_CONFIGS).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const isSelected = selectedTable === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedTable(key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-xs font-black'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search & Refresh */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search deleted ID or user..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
              />
            </div>

            <button
              type="button"
              onClick={fetchAuditData}
              disabled={isLoading}
              title="Refresh log"
              className="p-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

        </div>
      </div>

      {/* ---------------- DELETED RECORDS LIST ---------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-700" />
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Deleted Records Archive
            </h3>
          </div>
          <div className="text-xs font-bold text-slate-500">
            Showing {filteredRecords.length} records
          </div>
        </div>

        {filteredRecords.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {filteredRecords.map((item) => {
              const cfg = TABLE_CONFIGS[item.table_name] || {
                label: item.table_name,
                icon: Trash2,
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
              };
              const Icon = cfg.icon;
              const isExpanded = expandedId === item.archive_id;
              const payload = item.deleted_data || {};

              return (
                <div key={item.archive_id} className="p-4 hover:bg-slate-50/70 transition-colors">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    
                    {/* Left: Entity Badge + Record ID */}
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${cfg.badgeClass}`}>
                        <Icon className="w-3.5 h-3.5" />
                        <span>{cfg.label}</span>
                      </span>

                      <div>
                        <div className="font-mono text-sm font-black text-slate-950">
                          {item.record_id}
                        </div>
                        {item.reason && (
                          <div className="text-[11px] text-slate-500 italic mt-0.5">
                            Reason: {item.reason}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Deletion Meta (Time & User) */}
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <div className="flex items-center gap-1 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(item.deleted_at).toLocaleString()}</span>
                      </div>

                      {item.deleted_by && (
                        <div className="flex items-center gap-1 font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{item.deleted_by}</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.archive_id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <span>{isExpanded ? 'Hide Details' : 'View Snapshot'}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                  </div>

                  {/* Summary key-values chips */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {Object.entries(payload)
                      .filter(([k]) => !['created_at', 'entry_time', 'archive_id'].includes(k))
                      .slice(0, 6)
                      .map(([k, v]) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100/80 border border-slate-200 rounded text-[11px] text-slate-700 font-medium"
                        >
                          <span className="text-slate-400 font-normal">{k}:</span>
                          <span className="font-bold text-slate-900 font-mono truncate max-w-[180px]">
                            {String(v ?? '—')}
                          </span>
                        </span>
                      ))}
                  </div>

                  {/* Expandable JSON Snapshot Drawer */}
                  {isExpanded && (
                    <div className="mt-3.5 p-3.5 bg-slate-950 text-slate-200 rounded-xl text-xs font-mono border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                        <span className="font-bold uppercase tracking-wider text-[10px]">
                          Complete Archived Row Snapshot
                        </span>
                        <span>Archive #{item.archive_id}</span>
                      </div>
                      <pre className="overflow-x-auto p-2 bg-slate-900/60 rounded text-[11px] text-emerald-400 font-mono leading-relaxed">
                        {JSON.stringify(payload, null, 2)}
                      </pre>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400">
            <div className="flex flex-col items-center justify-center gap-2">
              <History className="w-10 h-10 text-slate-300 stroke-1" />
              <p className="text-sm font-semibold text-slate-700">No deleted records in archive</p>
              <p className="text-xs text-slate-400 max-w-md">
                {tablePending
                  ? 'Once the SQL migration is applied in your Supabase project, any record deleted from the 5 core tables will appear here automatically.'
                  : 'Whenever an entry is removed from Ledger, Products, Staff, Locations, or Dispatch, a snapshot is preserved here permanently.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditArchiveView;
