'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MapPin,
  Search,
  PlusCircle,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Building,
  Edit2,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface LocationRecord {
  location_id: string;
  location_name: string;
  status: string;
  entry_time?: string | null;
}

interface LocationViewProps {
  supabase?: SupabaseClient;
  className?: string;
}

export const LocationView: React.FC<LocationViewProps> = ({
  supabase,
  className = '',
}) => {
  // --- Data States ---
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // --- Filter States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // --- Modal States ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Location Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationRecord | null>(null);
  const [editLocName, setEditLocName] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Add Form Field
  const [formLocationName, setFormLocationName] = useState('');
  const [previewId, setPreviewId] = useState('VI/LOC/5');

  // Stock Counts per location
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({});

  // Status Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    location: LocationRecord | null;
    nextStatus: string;
    isUpdating: boolean;
  }>({
    isOpen: false,
    location: null,
    nextStatus: 'INACTIVE',
    isUpdating: false,
  });

  // --- Fetch Locations ---
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const res = await fetch('/api/locations');
      if (!res.ok) {
        throw new Error(`Failed to fetch locations: status ${res.status}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const list: LocationRecord[] = data.locations || [];
      setLocations(list);
      setStockCounts(data.stockCounts || {});

      // Compute preview ID with standardized unpadded schema: VI/LOC/X
      let maxNum = 0;
      list.forEach((l) => {
        const match = String(l.location_id || '').match(/(\d+)$/);
        if (match) {
          const val = parseInt(match[1], 10);
          if (!isNaN(val) && val > maxNum) maxNum = val;
        }
      });
      setPreviewId(`VI/LOC/${maxNum + 1}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading locations';
      console.error('Error fetching locations:', err);
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Filtered Locations ---
  const filteredLocations = useMemo(() => {
    let result = [...locations];

    if (statusFilter !== 'ALL') {
      result = result.filter((l) => (l.status || 'ACTIVE').toUpperCase() === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.location_id.toLowerCase().includes(q) ||
          l.location_name.toLowerCase().includes(q)
      );
    }

    return result;
  }, [locations, statusFilter, searchQuery]);

  // --- Metrics ---
  const metrics = useMemo(() => {
    let active = 0;
    let inactive = 0;
    locations.forEach((l) => {
      if ((l.status || 'ACTIVE').toUpperCase() === 'ACTIVE') active++;
      else inactive++;
    });

    return {
      total: locations.length,
      active,
      inactive,
    };
  }, [locations]);

  // --- Open Edit Location Modal ---
  const handleOpenEdit = (loc: LocationRecord) => {
    setEditingLocation(loc);
    setEditLocName(loc.location_name);
    setEditStatus((loc.status || 'ACTIVE').toUpperCase() as 'ACTIVE' | 'INACTIVE');
    setEditError(null);
    setIsEditModalOpen(true);
  };

  // --- Submit Edit Location ---
  const handleEditLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocation) return;
    setEditError(null);

    const cleanName = editLocName.trim();
    if (!cleanName) {
      setEditError('Location Name is required.');
      return;
    }

    // 0-goods constraint check
    const goodsCount = stockCounts[editingLocation.location_id] || 0;
    if (editStatus === 'INACTIVE' && goodsCount > 0) {
      setEditError(
        `Cannot deactivate facility: Location currently holds ${goodsCount} units of stock. All stock must be 0 before deactivating.`
      );
      return;
    }

    try {
      setIsSubmittingEdit(true);
      const res = await fetch('/api/locations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: editingLocation.location_id,
          location_name: cleanName,
          status: editStatus,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update location');
      }

      setLocations((prev) =>
        prev.map((item) =>
          item.location_id === editingLocation.location_id
            ? { ...item, location_name: cleanName, status: editStatus }
            : item
        )
      );

      setIsEditModalOpen(false);
      setSuccessToast(`Facility ${editingLocation.location_id} updated successfully!`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating facility';
      setEditError(msg);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // --- Handle Status Toggle Click ---
  const handleInitiateStatusToggle = (loc: LocationRecord) => {
    const isCurrentlyActive = (loc.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
    const targetStatus = isCurrentlyActive ? 'INACTIVE' : 'ACTIVE';

    setConfirmModal({
      isOpen: true,
      location: loc,
      nextStatus: targetStatus,
      isUpdating: false,
    });
  };

  // --- Confirm Status Change ---
  const handleConfirmStatusChange = async () => {
    if (!confirmModal.location) return;

    try {
      setConfirmModal((prev) => ({ ...prev, isUpdating: true }));

      const res = await fetch('/api/locations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: confirmModal.location.location_id,
          status: confirmModal.nextStatus,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update location status');
      }

      setLocations((prev) =>
        prev.map((l) =>
          l.location_id === confirmModal.location?.location_id
            ? { ...l, status: confirmModal.nextStatus }
            : l
        )
      );

      setSuccessToast(
        `Facility "${confirmModal.location.location_name}" marked as ${confirmModal.nextStatus}.`
      );
      setTimeout(() => setSuccessToast(null), 3500);
      setConfirmModal({ isOpen: false, location: null, nextStatus: 'INACTIVE', isUpdating: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      alert(msg);
      setConfirmModal((prev) => ({ ...prev, isUpdating: false }));
    }
  };

  // --- Handle Add Location Form Submission ---
  const handleAddLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = formLocationName.trim().toUpperCase();
    if (!cleanName) {
      setFormError('Facility / Location Name is required.');
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_name: cleanName,
          status: 'ACTIVE',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create location.');
      }

      setFormLocationName('');
      setIsAddModalOpen(false);

      setSuccessToast(`Facility "${cleanName}" created successfully!`);
      setTimeout(() => setSuccessToast(null), 3500);

      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating location';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`space-y-5 ${className}`}>
      
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-950 text-white px-4 py-3 rounded-xl shadow-2xl border border-amber-400/40 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{successToast}</span>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* METRICS HEADER CARDS                                 */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider">Total Facilities</span>
            <MapPin className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
            {metrics.total}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">Active Facilities</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">
            {metrics.active}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-rose-700">Inactive</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight">
            {metrics.inactive}
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* CONTROLS BAR: SEARCH, STATUS, ADD BUTTON             */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        
        <div className="flex flex-1 items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search facility name or ID..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
            className="py-2.5 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={fetchData}
            type="button"
            className="p-2.5 border border-slate-300 text-slate-700 hover:text-slate-950 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            title="Refresh Locations"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-500' : ''}`} />
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            type="button"
            className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add New Location</span>
          </button>
        </div>

      </div>

      {/* ---------------------------------------------------- */}
      {/* LOCATIONS TABLE                                      */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        
        <div className="w-full max-h-[calc(100vh-280px)] min-h-[400px] overflow-auto relative">
          
          {isLoading && (
            <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex flex-col items-center justify-center z-30 gap-3 min-h-[300px]">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Loading warehouse facilities...
              </p>
            </div>
          )}

          <table className="w-full min-w-[700px] text-left border-collapse relative">
            <thead>
              <tr className="bg-slate-100 text-slate-800 text-xs uppercase font-extrabold tracking-wider">
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[150px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  LOCATION ID
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[240px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  FACILITY NAME
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[130px] text-right z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  CURRENT GOODS
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[140px] text-center z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  STATUS
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[140px] text-right z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  CREATED DATE
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[80px] text-center z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  ACTIONS
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredLocations.length > 0 ? (
                filteredLocations.map((loc) => {
                  const isActive = (loc.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
                  const goodsCount = stockCounts[loc.location_id] || 0;

                  return (
                    <tr key={loc.location_id} className="hover:bg-amber-50/40 transition-colors">
                      
                      {/* Location ID */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-900 rounded-md border border-slate-200 shadow-2xs">
                          {loc.location_id}
                        </span>
                      </td>

                      {/* Location Name */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Building className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="text-sm font-black text-slate-950">
                            {loc.location_name}
                          </span>
                        </div>
                      </td>

                      {/* Current Goods (Qty) */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`font-mono text-xs font-black px-2.5 py-0.5 rounded-md border ${
                            goodsCount > 0
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                        >
                          {goodsCount.toLocaleString()} units
                        </span>
                      </td>

                      {/* Status Toggle Switch */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleInitiateStatusToggle(loc)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border transition-all cursor-pointer ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                          }`}
                          title={
                            isActive && goodsCount > 0
                              ? `Cannot deactivate: Location currently holds ${goodsCount} units of stock.`
                              : `Click to toggle status (Confirmation required)`
                          }
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isActive ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span>{isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                        </button>
                      </td>

                      {/* Created Date */}
                      <td className="py-3 px-4 text-right whitespace-nowrap text-xs font-semibold text-slate-600">
                        {loc.entry_time ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(loc.entry_time).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Edit Action Button */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(loc)}
                          className="p-1.5 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Facility"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>

                    </tr>
                  );
                })
              ) : !isLoading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <MapPin className="w-10 h-10 text-slate-300 stroke-1" />
                      <p className="text-sm font-bold text-slate-700">No facilities match your search</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

      </div>

      {/* ==================================================== */}
      {/* ⚠️ STATUS TOGGLE CONFIRMATION MODAL                   */}
      {/* ==================================================== */}
      {confirmModal.isOpen && confirmModal.location && (() => {
        const goodsAtLoc = stockCounts[confirmModal.location.location_id] || 0;
        const isDeactivating = confirmModal.nextStatus === 'INACTIVE';
        const isBlocked = isDeactivating && goodsAtLoc > 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-3 rounded-2xl shrink-0 ${
                    isBlocked
                      ? 'bg-rose-100 text-rose-600 ring-2 ring-rose-300'
                      : isDeactivating
                      ? 'bg-rose-100 text-rose-600'
                      : 'bg-emerald-100 text-emerald-600'
                  }`}
                >
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-950">
                    {isBlocked
                      ? 'Cannot Deactivate Facility'
                      : isDeactivating
                      ? 'Deactivate Facility?'
                      : 'Activate Facility?'}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Facility: <strong className="text-slate-950">{confirmModal.location.location_name}</strong> ({confirmModal.location.location_id})
                  </p>
                </div>
              </div>

              {/* 0-Goods Inactive Constraint Warning Banner */}
              {isBlocked ? (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 text-xs text-rose-800">
                  <div className="flex items-center gap-1.5 font-black text-rose-900">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Deactivation Restricted (Stock &gt; 0)</span>
                  </div>
                  <p className="leading-relaxed">
                    This location currently holds <strong className="font-black text-rose-950 underline">{goodsAtLoc} units</strong> of inventory goods. A location can only become inactive when there are <strong>0 goods</strong> at the location.
                  </p>
                  <p className="text-[11px] text-rose-600 font-semibold">
                    Please transfer or dispatch all remaining inventory out of this facility before deactivating.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-600">
                  <p>
                    <span className="font-bold text-slate-700">Target Status:</span>{' '}
                    <span className={`font-black ${isDeactivating ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {confirmModal.nextStatus}
                    </span>
                  </p>
                  <p>
                    <span className="font-bold text-slate-700">Current Stock:</span> 0 units
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal({ isOpen: false, location: null, nextStatus: 'INACTIVE', isUpdating: false })}
                  disabled={confirmModal.isUpdating}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  {isBlocked ? 'Close' : 'Cancel'}
                </button>
                {!isBlocked && (
                  <button
                    type="button"
                    onClick={handleConfirmStatusChange}
                    disabled={confirmModal.isUpdating}
                    className={`px-4 py-2 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer ${
                      confirmModal.nextStatus === 'INACTIVE'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {confirmModal.isUpdating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <span>Confirm {confirmModal.nextStatus === 'INACTIVE' ? 'Deactivation' : 'Activation'}</span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================================================== */}
      {/* 🌟 ADD NEW LOCATION MODAL                            */}
      {/* ==================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-950 text-amber-400 rounded-xl shadow-xs">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-slate-950">Add New Facility</h3>
                  <p className="text-[11px] font-bold text-slate-800">
                    Register a new warehouse or retail location
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                type="button"
                className="text-slate-900 hover:text-slate-950 p-1.5 rounded-lg hover:bg-black/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddLocationSubmit} className="p-6 overflow-y-auto space-y-4">
              
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* ID Preview */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
                    Location ID
                  </label>
                  <span className="font-mono text-sm font-black text-slate-900">
                    {previewId}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Auto-Generated</span>
              </div>

              {/* Location Name */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Facility / Location Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formLocationName}
                  onChange={(e) => setFormLocationName(e.target.value.toUpperCase())}
                  placeholder="e.g. GODOWN 3 or RAJKOT HUB"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden uppercase"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Facility</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* ✏️ EDIT FACILITY MODAL (Just like Staff Register)     */}
      {/* ==================================================== */}
      {isEditModalOpen && editingLocation && (() => {
        const goodsAtLoc = stockCounts[editingLocation.location_id] || 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-950 text-white">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-400 text-slate-950 rounded-xl shadow-xs">
                    <Edit2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight">Edit Facility</h3>
                    <p className="text-[11px] font-mono text-slate-400">
                      {editingLocation.location_id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  type="button"
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleEditLocationSubmit} className="p-6 overflow-y-auto space-y-4">
                {editError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{editError}</span>
                  </div>
                )}

                {/* Location ID (Read-only Badge) */}
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Location ID
                  </label>
                  <div className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-black text-slate-700 select-all">
                    {editingLocation.location_id}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Unique primary key cannot be changed.</p>
                </div>

                {/* Facility Name */}
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Facility Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editLocName}
                    onChange={(e) => setEditLocName(e.target.value)}
                    required
                    placeholder="e.g. MOTA MOVA, SHOP, etc."
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                {/* Current Stock info */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">Current Stock at Facility:</span>
                  <span className="font-mono font-black text-slate-950">{goodsAtLoc} units</span>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Status <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  >
                    <option value="ACTIVE">ACTIVE (Operations Permitted)</option>
                    <option value="INACTIVE">INACTIVE (Deactivated / No Goods)</option>
                  </select>
                  {goodsAtLoc > 0 && editStatus === 'INACTIVE' && (
                    <p className="text-[11px] font-bold text-rose-600 mt-1">
                      ⚠️ Warning: Deactivation is blocked while {goodsAtLoc} units remain at this facility.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingEdit}
                    className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingEdit ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default LocationView;
