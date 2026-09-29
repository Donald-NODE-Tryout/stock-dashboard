'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Truck,
  Search,
  PlusCircle,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Layers,
  MapPin,
  User,
  Package,
  Edit2,
  Trash2,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/context/AuthContext';

export interface DispatchTicket {
  ticket_id: string;
  created_at?: string | null;
  model_id: string;
  qty: number;
  from_location: string;
  ticket_status: 'INITIATED' | 'WAITING' | 'PACKING' | 'PACKED' | 'CLOSED' | string;
  remarks?: string | null;
  created_by?: string | null;
}

export interface ProductSummary {
  model_id: string;
  model_name?: string;
  category?: string | null;
  company?: string | null;
}

export interface LocationSummary {
  location_id: string;
  location_name: string;
  status: string;
}

export interface EmployeeSummary {
  employee_id: string;
  employee_name: string;
  role?: string;
}

export interface StockSummary {
  model_id: string;
  location_id: string;
  qty: number;
}

interface DispatchViewProps {
  supabase?: SupabaseClient;
  className?: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  INITIATED: {
    label: 'INITIATED',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-300',
    dot: 'bg-blue-500',
  },
  WAITING: {
    label: 'WAITING',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-300',
    dot: 'bg-amber-500',
  },
  PACKING: {
    label: 'PACKING',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-300',
    dot: 'bg-orange-500',
  },
  PACKED: {
    label: 'PACKED',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-300',
    dot: 'bg-purple-500',
  },
  CLOSED: {
    label: 'CLOSED',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    dot: 'bg-emerald-500',
  },
};

export const DispatchView: React.FC<DispatchViewProps> = ({
  supabase,
  className = '',
}) => {
  const { profile } = useAuth();

  // --- Data States ---
  const [tickets, setTickets] = useState<DispatchTicket[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [stockData, setStockData] = useState<StockSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // --- Filter & Pagination States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;

  // --- Modal States ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add Form Fields
  const [formModelId, setFormModelId] = useState('');
  const [modelSearchInput, setModelSearchInput] = useState('');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [formFromLocation, setFormFromLocation] = useState('');
  const [formQty, setFormQty] = useState('1');
  const [formRemarks, setFormRemarks] = useState('');
  const [previewTicketId, setPreviewTicketId] = useState('VI/DISP/1');
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  // --- Edit Modal States ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<DispatchTicket | null>(null);
  const [editQty, setEditQty] = useState('1');
  const [editFromLocation, setEditFromLocation] = useState('');
  const [editStatus, setEditStatus] = useState('INITIATED');
  const [editRemarks, setEditRemarks] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // --- Delete Modal States ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingTicket, setDeletingTicket] = useState<DispatchTicket | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Close model dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(event.target as Node)
      ) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // --- Fetch Data ---
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const res = await fetch('/api/dispatch');
      if (!res.ok) {
        throw new Error(`Failed to fetch dispatch tickets: status ${res.status}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const ticketList: DispatchTicket[] = data.tickets || [];
      const prodList: ProductSummary[] = data.products || [];
      const locList: LocationSummary[] = data.locations || [];
      const empList: EmployeeSummary[] = data.employees || [];
      const stockList: StockSummary[] = data.stock || [];

      setTickets(ticketList);
      setProducts(prodList);
      setLocations(locList);
      setEmployees(empList);
      setStockData(stockList);

      // Compute Next Preview Ticket ID with standardized unpadded schema: VI/DISP/X
      let maxId = 0;
      ticketList.forEach((t) => {
        const match = String(t.ticket_id || '').match(/(\d+)$/);
        if (match) {
          const val = parseInt(match[1], 10);
          if (!isNaN(val) && val > maxId) maxId = val;
        }
      });
      setPreviewTicketId(`VI/DISP/${maxId + 1}`);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading dispatch tickets';
      console.error('Error fetching dispatch data:', err);
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Synchronize formFromLocation with active locations
  useEffect(() => {
    if (!formFromLocation && locations.length > 0) {
      const activeLoc = locations.find((l) => l.status === 'ACTIVE') || locations[0];
      if (activeLoc) {
        setFormFromLocation(String(activeLoc.location_id));
      }
    }
  }, [locations, formFromLocation]);

  // --- Lookup Maps ---
  const locationMap = useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach((l) => map.set(l.location_id, l.location_name));
    return map;
  }, [locations]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e) => map.set(e.employee_id, e.employee_name));
    return map;
  }, [employees]);

  // --- Filtered Product Models for Autocomplete Dropdown ---
  const filteredAutocompleteModels = useMemo(() => {
    const query = modelSearchInput.trim().toLowerCase();
    if (!query) return products;

    return products.filter((p) => {
      return (
        p.model_id.toLowerCase().includes(query) ||
        (p.model_name && p.model_name.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.company && p.company.toLowerCase().includes(query))
      );
    });
  }, [products, modelSearchInput]);

  // Compute available stock for currently selected model & facility
  const availableStockAtSource = useMemo(() => {
    const targetModel =
      formModelId ||
      products.find(
        (p) => p.model_id.toLowerCase() === modelSearchInput.trim().toLowerCase()
      )?.model_id;

    const targetLoc =
      formFromLocation ||
      locations.find((l) => l.status === 'ACTIVE')?.location_id ||
      locations[0]?.location_id;

    if (!targetModel || !targetLoc) return null;

    const record = stockData.find(
      (s) => s.model_id === targetModel && String(s.location_id) === String(targetLoc)
    );

    return record ? Number(record.qty) || 0 : 0;
  }, [formModelId, modelSearchInput, products, formFromLocation, locations, stockData]);

  // Compute available stock for editing ticket's facility
  const editAvailableStockAtSource = useMemo(() => {
    if (!editingTicket) return null;
    const targetModel = editingTicket.model_id;
    const targetLoc = editFromLocation || editingTicket.from_location;
    if (!targetModel || !targetLoc) return null;

    const record = stockData.find(
      (s) => s.model_id === targetModel && String(s.location_id) === String(targetLoc)
    );

    return record ? Number(record.qty) || 0 : 0;
  }, [editingTicket, editFromLocation, stockData]);

  // --- Filtered Tickets ---
  const filteredTickets = useMemo(() => {
    let result = [...tickets];

    // 1. Status Filter
    if (statusFilter !== 'ALL') {
      result = result.filter((t) => (t.ticket_status || 'INITIATED').toUpperCase() === statusFilter);
    }

    // 2. Location Filter
    if (locationFilter !== 'ALL') {
      result = result.filter((t) => t.from_location === locationFilter);
    }

    // 3. Date Filters
    if (fromDate) {
      result = result.filter((t) => {
        if (!t.created_at) return false;
        return t.created_at.split('T')[0] >= fromDate;
      });
    }

    if (toDate) {
      result = result.filter((t) => {
        if (!t.created_at) return false;
        return t.created_at.split('T')[0] <= toDate;
      });
    }

    // 4. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((t) => {
        const locName = locationMap.get(t.from_location) || '';
        const empName = employeeMap.get(t.created_by || '') || '';
        return (
          t.ticket_id.toLowerCase().includes(q) ||
          t.model_id.toLowerCase().includes(q) ||
          locName.toLowerCase().includes(q) ||
          empName.toLowerCase().includes(q) ||
          (t.remarks && t.remarks.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [tickets, statusFilter, locationFilter, fromDate, toDate, searchQuery, locationMap, employeeMap]);

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const paginatedTickets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, locationFilter, fromDate, toDate]);

  // --- Metrics ---
  const metrics = useMemo(() => {
    let initiated = 0;
    let waiting = 0;
    let packing = 0;
    let packed = 0;
    let closed = 0;

    tickets.forEach((t) => {
      const s = (t.ticket_status || 'INITIATED').toUpperCase();
      if (s === 'INITIATED') initiated++;
      else if (s === 'WAITING') waiting++;
      else if (s === 'PACKING') packing++;
      else if (s === 'PACKED') packed++;
      else if (s === 'CLOSED') closed++;
    });

    return {
      total: tickets.length,
      initiated,
      waiting,
      packing,
      packed,
      closed,
      inProgress: initiated + waiting + packing + packed,
    };
  }, [tickets]);

  // --- Sequential Stage Transition Info ---
  const STAGE_FLOW_INFO: Record<
    string,
    { next: string | null; label: string; desc: string }
  > = {
    INITIATED: {
      next: 'WAITING',
      label: 'Waiting',
      desc: 'Updated by worker via WhatsApp text or by admin/branch manager',
    },
    INITIAL: {
      next: 'WAITING',
      label: 'Waiting',
      desc: 'Updated by worker via WhatsApp text or by admin/branch manager',
    },
    WAITING: {
      next: 'PACKING',
      label: 'Packing',
      desc: 'Updated by admin/branch manager after verifying goods against bill',
    },
    PACKING: {
      next: 'PACKED',
      label: 'Packed',
      desc: 'Updated by worker after packing is done via WhatsApp',
    },
    PACKED: {
      next: 'CLOSED',
      label: 'Closed',
      desc: 'Dispatched and finalized',
    },
    CLOSED: {
      next: null,
      label: 'Dispatched',
      desc: 'Goods dispatched. Lifecycle complete.',
    },
  };

  // --- Quick Status Advancement Handler ---
  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    try {
      setUpdatingTicketId(ticketId);
      const res = await fetch('/api/dispatch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          ticket_status: newStatus,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update ticket status');
      }

      setTickets((prev) =>
        prev.map((t) => (t.ticket_id === ticketId ? { ...t, ticket_status: newStatus } : t))
      );

      setSuccessToast(`Ticket ${ticketId} progressed to ${newStatus}.`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error changing status';
      alert(msg);
    } finally {
      setUpdatingTicketId(null);
    }
  };

  // --- Open Add Modal with Fresh Autocomplete State ---
  const handleOpenAddModal = () => {
    setFormError(null);
    setFormModelId('');
    setModelSearchInput('');
    const activeLocs = locations.filter((l) => l.status === 'ACTIVE');
    const defaultLoc =
      activeLocs.length > 0
        ? String(activeLocs[0].location_id)
        : locations[0]
        ? String(locations[0].location_id)
        : '';
    setFormFromLocation(defaultLoc);
    setFormQty('1');
    setFormRemarks('');
    setIsModelDropdownOpen(false);
    setIsAddModalOpen(true);
  };

  // --- Handle Add Dispatch Ticket Submission ---
  const handleAddTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let selectedModel = formModelId;
    if (!selectedModel && modelSearchInput.trim()) {
      const match = products.find(
        (p) => p.model_id.toLowerCase() === modelSearchInput.trim().toLowerCase()
      );
      if (match) {
        selectedModel = match.model_id;
        setFormModelId(match.model_id);
      }
    }

    if (!selectedModel) {
      setFormError('Please select a valid product model from the list or dropdown.');
      return;
    }

    let sourceLoc = formFromLocation;
    if (!sourceLoc) {
      const activeLoc = locations.find((l) => l.status === 'ACTIVE') || locations[0];
      if (activeLoc) {
        sourceLoc = String(activeLoc.location_id);
        setFormFromLocation(sourceLoc);
      }
    }

    if (!sourceLoc) {
      setFormError('Please select source location.');
      return;
    }

    const qtyNum = parseInt(formQty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setFormError('Quantity must be greater than 0.');
      return;
    }

    if (availableStockAtSource !== null && qtyNum > availableStockAtSource) {
      setFormError(
        `Insufficient stock at source facility. Available stock for ${selectedModel} is ${availableStockAtSource} unit(s), but requested quantity is ${qtyNum}.`
      );
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        model_id: selectedModel,
        from_location: formFromLocation,
        qty: qtyNum,
        remarks: formRemarks.trim() || null,
        created_by: profile?.employee_id || 'VI0001',
      };

      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create dispatch ticket.');
      }

      const data = await res.json();
      setFormQty('1');
      setFormRemarks('');
      setFormModelId('');
      setModelSearchInput('');
      setIsModelDropdownOpen(false);
      setIsAddModalOpen(false);

      setSuccessToast(`Dispatch Ticket ${data.ticket?.ticket_id || 'created'} registered successfully!`);
      setTimeout(() => setSuccessToast(null), 3500);

      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating dispatch ticket';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Handle Edit Dispatch Ticket ---
  const handleOpenEdit = (t: DispatchTicket) => {
    setEditingTicket(t);
    setEditQty(String(t.qty || 1));
    setEditFromLocation(t.from_location || '');
    setEditStatus((t.ticket_status === 'INITIAL' ? 'INITIATED' : t.ticket_status || 'INITIATED').toUpperCase());
    setEditRemarks(t.remarks || '');
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleEditTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    setEditError(null);

    const qtyNum = parseInt(editQty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setEditError('Quantity must be greater than 0.');
      return;
    }

    if (!editFromLocation) {
      setEditError('Please select a source facility.');
      return;
    }

    const effectiveStock =
      editFromLocation === editingTicket.from_location
        ? (editAvailableStockAtSource ?? 0) + (editingTicket.qty || 0)
        : (editAvailableStockAtSource ?? 0);

    if (editAvailableStockAtSource !== null && qtyNum > effectiveStock) {
      setEditError(
        `Insufficient stock at source facility. Available stock for ${editingTicket.model_id} is ${effectiveStock} unit(s), but requested quantity is ${qtyNum}.`
      );
      return;
    }

    try {
      setIsSubmittingEdit(true);

      const payload = {
        ticket_id: editingTicket.ticket_id,
        qty: qtyNum,
        from_location: editFromLocation,
        ticket_status: editStatus,
        remarks: editRemarks.trim() || null,
      };

      const res = await fetch('/api/dispatch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update dispatch ticket.');
      }

      setIsEditModalOpen(false);
      setSuccessToast(`Ticket ${editingTicket.ticket_id} updated successfully!`);
      setTimeout(() => setSuccessToast(null), 3500);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update dispatch ticket';
      setEditError(msg);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // --- Handle Delete Dispatch Ticket ---
  const handleOpenDelete = (t: DispatchTicket) => {
    setDeletingTicket(t);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteTicketSubmit = async () => {
    if (!deletingTicket) return;
    try {
      setIsDeleting(true);
      const deleter = profile?.employee_name
        ? `${profile.employee_name} (${profile.employee_id || ''})`.trim()
        : (profile?.employee_id || 'USER');

      const res = await fetch(`/api/dispatch?ticket_id=${encodeURIComponent(deletingTicket.ticket_id)}&deleted_by=${encodeURIComponent(deleter)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete dispatch ticket.');
      }

      setIsDeleteModalOpen(false);
      setSuccessToast(`Ticket ${deletingTicket.ticket_id} deleted and archived.`);
      setTimeout(() => setSuccessToast(null), 3500);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete dispatch ticket';
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setLocationFilter('ALL');
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    statusFilter !== 'ALL' ||
    locationFilter !== 'ALL' ||
    fromDate !== '' ||
    toDate !== '';

  return (
    <div className={`space-y-5 ${className}`}>
      
      {/* Success Toast */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-950 text-white px-4 py-3 rounded-xl shadow-2xl border border-amber-400/40 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{successToast}</span>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* METRICS HEADER CARDS                                 */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-0.5">
            Total Tickets
          </span>
          <p className="text-2xl font-black text-slate-950">{metrics.total}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 block mb-0.5">
            Initiated
          </span>
          <p className="text-2xl font-black text-blue-600">{metrics.initiated}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 block mb-0.5">
            Waiting
          </span>
          <p className="text-2xl font-black text-amber-600">{metrics.waiting}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-700 block mb-0.5">
            Packing
          </span>
          <p className="text-2xl font-black text-orange-600">{metrics.packing}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 block mb-0.5">
            Packed
          </span>
          <p className="text-2xl font-black text-purple-600">{metrics.packed}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block mb-0.5">
            Closed
          </span>
          <p className="text-2xl font-black text-emerald-600">{metrics.closed}</p>
        </div>

      </div>

      {/* ---------------------------------------------------- */}
      {/* CONTROLS BAR: SEARCH, FILTERS, ADD BUTTON             */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticket ID, model, facility, remarks..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchData}
              type="button"
              className="p-2.5 border border-slate-300 text-slate-700 hover:text-slate-950 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
              title="Refresh Dispatch List"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-500' : ''}`} />
            </button>

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                type="button"
                className="px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            <button
              onClick={handleOpenAddModal}
              type="button"
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Dispatch Ticket</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns & Date Pickers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          
          {/* Status Filter */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
              Dispatch Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
            >
              <option value="ALL">All Stages</option>
              <option value="INITIATED">INITIATED</option>
              <option value="WAITING">WAITING</option>
              <option value="PACKING">PACKING</option>
              <option value="PACKED">PACKED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>

          {/* Location Filter */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
              Source Facility
            </label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
            >
              <option value="ALL">All Facilities</option>
              {locations.map((loc) => (
                <option key={loc.location_id} value={loc.location_id}>
                  {loc.location_name}
                </option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
            />
          </div>

        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* DISPATCH TICKETS TABLE                               */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        
        <div className="w-full max-h-[calc(100vh-280px)] min-h-[440px] overflow-auto relative">
          
          {isLoading && (
            <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex flex-col items-center justify-center z-30 gap-3 min-h-[300px]">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Loading dispatch tickets...
              </p>
            </div>
          )}

          <table className="w-full min-w-[1000px] text-left border-collapse relative">
            <thead>
              <tr className="bg-slate-100 text-slate-800 text-xs uppercase font-extrabold tracking-wider">
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[140px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  TICKET ID
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[170px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  MODEL
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[90px] text-right z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  QTY
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[170px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  SOURCE FACILITY
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[170px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  DISPATCH STAGE
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[200px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  REMARKS
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[130px] text-right z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  DATE
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 text-center min-w-[90px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  ACTIONS
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-800">
              {paginatedTickets.length > 0 ? (
                paginatedTickets.map((t) => {
                  const sKey = (t.ticket_status || 'INITIATED').toUpperCase();
                  const cfg = STATUS_CONFIG[sKey] || STATUS_CONFIG.INITIATED;
                  const locName = locationMap.get(t.from_location) || t.from_location;

                  return (
                    <tr key={t.ticket_id} className="hover:bg-amber-50/40 transition-colors">
                      
                      {/* Ticket ID */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-black px-2 py-0.5 bg-slate-100 text-slate-900 rounded-md border border-slate-200 shadow-2xs">
                          {t.ticket_id}
                        </span>
                      </td>

                      {/* Model */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="font-mono text-xs font-bold text-slate-950">
                            {t.model_id}
                          </span>
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="text-sm font-black text-slate-950 tabular-nums">
                          {t.qty}
                        </span>
                      </td>

                      {/* Source Facility */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{locName}</span>
                        </div>
                      </td>

                      {/* Sequential Stage Flow Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border shadow-2xs ${cfg.bg} ${cfg.text} ${cfg.border}`}
                            title={STAGE_FLOW_INFO[sKey]?.desc || sKey}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {sKey}
                          </span>

                          {STAGE_FLOW_INFO[sKey]?.next ? (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(t.ticket_id, STAGE_FLOW_INFO[sKey].next!)}
                              disabled={updatingTicketId === t.ticket_id}
                              className="px-2.5 py-1 text-[11px] font-extrabold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-xs flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                              title={`Advance: ${sKey} → ${STAGE_FLOW_INFO[sKey].next}`}
                            >
                              {updatingTicketId === t.ticket_id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <span>→ {STAGE_FLOW_INFO[sKey].next}</span>
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 px-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Done</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Remarks */}
                      <td className="py-3 px-4 text-xs font-medium text-slate-600">
                        <span className="line-clamp-1 truncate max-w-[240px]" title={t.remarks || ''}>
                          {t.remarks || <span className="text-slate-300">—</span>}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 text-right whitespace-nowrap text-xs font-semibold text-slate-600">
                        {t.created_at ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(t.created_at).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Actions: Edit & Delete */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="p-1.5 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit Dispatch Ticket"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(t)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Dispatch Ticket"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              ) : !isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Truck className="w-10 h-10 text-slate-300 stroke-1" />
                      <p className="text-sm font-bold text-slate-700">No dispatch tickets found</p>
                      <p className="text-xs text-slate-400">Create a new ticket or clear active filters.</p>
                      {hasActiveFilters && (
                        <button
                          onClick={resetFilters}
                          type="button"
                          className="mt-2 px-3 py-1.5 bg-amber-100 text-amber-900 rounded-lg text-xs font-bold hover:bg-amber-200 transition-colors"
                        >
                          Clear All Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* ---------------------------------------------------- */}
        {/* PAGINATION FOOTER                                    */}
        {/* ---------------------------------------------------- */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-semibold">
          <p>
            Showing{' '}
            <strong className="text-slate-900 font-bold">
              {filteredTickets.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-slate-900 font-bold">
              {Math.min(currentPage * pageSize, filteredTickets.length)}
            </strong>{' '}
            of <strong className="text-slate-900 font-bold">{filteredTickets.length}</strong> tickets
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            <span className="px-2 font-bold text-slate-900">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* ==================================================== */}
      {/* 🌟 ADD NEW DISPATCH TICKET MODAL                     */}
      {/* ==================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-950 text-amber-400 rounded-xl shadow-xs">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-slate-950">Create Dispatch Ticket</h3>
                  <p className="text-[11px] font-bold text-slate-800">
                    Initiate dispatch process for outbound inventory
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
            <form onSubmit={handleAddTicketSubmit} className="p-6 overflow-y-auto space-y-4">
              
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
                    Ticket ID
                  </label>
                  <span className="font-mono text-sm font-black text-slate-900">
                    {previewTicketId}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">SBRoCL Auto-Assigned</span>
              </div>

              {/* Model Selection (Autocomplete along with Dropdown) */}
              <div className="relative" ref={modelDropdownRef}>
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center justify-between mb-1">
                  <span>
                    Product Model <span className="text-rose-500">*</span>
                  </span>
                  {formModelId ? (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Selected
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-amber-600">
                      Search or select from dropdown
                    </span>
                  )}
                </label>

                <div className="relative">
                  <input
                    type="text"
                    value={modelSearchInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setModelSearchInput(val);
                      setIsModelDropdownOpen(true);
                      const exact = products.find(
                        (p) => p.model_id.toUpperCase() === val.trim().toUpperCase()
                      );
                      if (exact) {
                        setFormModelId(exact.model_id);
                      } else {
                        setFormModelId('');
                      }
                    }}
                    onFocus={() => setIsModelDropdownOpen(true)}
                    placeholder="Type to search or select model from dropdown..."
                    className={`w-full pl-3.5 pr-10 py-2.5 text-xs font-bold bg-slate-50 border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-400 transition-all ${
                      formModelId
                        ? 'border-emerald-500 bg-emerald-50/20 text-slate-950 font-mono'
                        : 'border-slate-300 text-slate-900'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setIsModelDropdownOpen((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    title="Toggle model dropdown"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-150 ${
                        isModelDropdownOpen ? 'rotate-180 text-amber-600' : ''
                      }`}
                    />
                  </button>
                </div>

                {/* Autocomplete Dropdown List */}
                {isModelDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 max-h-52 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-2xl z-50 divide-y divide-slate-100">
                    {filteredAutocompleteModels.length > 0 ? (
                      filteredAutocompleteModels.map((prod) => {
                        const isSelected = formModelId === prod.model_id;
                        return (
                          <div
                            key={prod.model_id}
                            onClick={() => {
                              setFormModelId(prod.model_id);
                              setModelSearchInput(prod.model_id);
                              setIsModelDropdownOpen(false);
                            }}
                            className={`p-2.5 hover:bg-amber-50 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                              isSelected ? 'bg-amber-100/80 font-bold' : ''
                            }`}
                          >
                            <div>
                              <span className="font-mono text-xs font-black text-slate-950 block">
                                {prod.model_id}
                              </span>
                              {(prod.model_name || prod.category || prod.company) && (
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                                  {prod.company && (
                                    <span className="font-bold text-slate-700">{prod.company}</span>
                                  )}
                                  {prod.category && <span>• {prod.category}</span>}
                                </div>
                              )}
                            </div>
                            {isSelected && (
                              <Check className="w-4 h-4 text-emerald-600 font-bold shrink-0" />
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-400 font-medium">
                        No product models match &quot;{modelSearchInput}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Facility & Qty Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Source Facility <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formFromLocation || (locations.find((l) => l.status === 'ACTIVE')?.location_id ?? '')}
                    onChange={(e) => setFormFromLocation(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  >
                    {locations
                      .filter((l) => l.status === 'ACTIVE')
                      .map((l) => (
                        <option key={l.location_id} value={l.location_id}>
                          {l.location_name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={availableStockAtSource !== null ? Math.max(0, availableStockAtSource) : undefined}
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    placeholder="e.g. 10"
                    required
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden tabular-nums ${
                      availableStockAtSource !== null && (parseInt(formQty, 10) || 0) > availableStockAtSource
                        ? 'border-rose-400 bg-rose-50/30'
                        : 'border-slate-300'
                    }`}
                  />
                </div>
              </div>

              {/* Live Stock Availability Indicator */}
              {availableStockAtSource !== null && (
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                    availableStockAtSource <= 0
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : availableStockAtSource < (parseInt(formQty, 10) || 0)
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <Package className="w-3.5 h-3.5" />
                    <span>Available Stock at Facility:</span>
                  </div>
                  <span className="font-mono font-black text-xs">
                    {availableStockAtSource} unit{availableStockAtSource === 1 ? '' : 's'}
                  </span>
                </div>
              )}

              {/* Initial Stage Informational Display */}
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 block mb-0.5">
                    Stage
                  </span>
                  <span className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    INITIATED
                  </span>
                </div>
                <span className="text-[11px] font-medium text-blue-800 text-right max-w-[200px] leading-tight">
                  Raised by admin / branch manager
                </span>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Remarks / Destination
                </label>
                <input
                  type="text"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="e.g. Customer Dispatch to Ahmedabad Hub"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Attribution Badge */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
                <span className="font-bold">Created By:</span>
                <span className="font-mono font-black text-slate-950">
                  {profile?.employee_name || 'Current User'} ({profile?.employee_id || 'VI0001'})
                </span>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Create Ticket</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* ✏️ EDIT DISPATCH TICKET MODAL                        */}
      {/* ==================================================== */}
      {isEditModalOpen && editingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-950 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-400 text-slate-950 rounded-xl shadow-xs">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Edit Dispatch Ticket</h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    {editingTicket.ticket_id} • Model: {editingTicket.model_id}
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
            <form onSubmit={handleEditTicketSubmit} className="p-6 overflow-y-auto space-y-4">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Readonly Model & Ticket ID */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Ticket ID
                  </label>
                  <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-800">
                    {editingTicket.ticket_id}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Product Model
                  </label>
                  <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-800">
                    {editingTicket.model_id}
                  </div>
                </div>
              </div>

              {/* Source Facility */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Source Facility <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editFromLocation}
                  onChange={(e) => setEditFromLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                >
                  <option value="">Select Facility...</option>
                  {locations.map((loc) => (
                    <option key={loc.location_id} value={String(loc.location_id)}>
                      {loc.location_name} {loc.status !== 'ACTIVE' ? `(${loc.status})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stock Notice Banner */}
              {editAvailableStockAtSource !== null && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-950 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-amber-600" />
                    <span>Facility Physical Stock:</span>
                  </span>
                  <span className="font-bold text-slate-900">
                    {editAvailableStockAtSource} units{' '}
                    {editFromLocation === editingTicket.from_location && (
                      <span className="text-[11px] text-amber-700 font-normal">
                        (+{editingTicket.qty} currently on this ticket)
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Quantity */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Dispatch Quantity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Dispatch Stage / Status */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Dispatch Stage <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                >
                  <option value="INITIATED">INITIATED (Created)</option>
                  <option value="WAITING">WAITING (Order received)</option>
                  <option value="PACKING">PACKING (Packing items)</option>
                  <option value="PACKED">PACKED (Ready for pickup)</option>
                  <option value="CLOSED">CLOSED (Dispatched / Complete)</option>
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Remarks / Destination
                </label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="e.g. Customer Dispatch to Ahmedabad Hub"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
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
                      <span>Updating...</span>
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
      )}

      {/* ==================================================== */}
      {/* 🗑️ DELETE DISPATCH TICKET CONFIRMATION MODAL         */}
      {/* ==================================================== */}
      {isDeleteModalOpen && deletingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-950 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-500 text-white rounded-xl shadow-xs">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Delete Dispatch Ticket</h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    {deletingTicket.ticket_id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                type="button"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {deleteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{deleteError}</span>
                </div>
              )}

              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Are you sure you want to delete this dispatch ticket? This ticket will be archived in the deleted records archive and removed from the active dispatch system.
              </p>

              {/* Ticket Summary Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Model:</span>
                  <span className="font-mono font-black text-slate-950">{deletingTicket.model_id}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Quantity:</span>
                  <span className="font-bold text-slate-900">{deletingTicket.qty} units</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Facility:</span>
                  <span className="font-semibold text-slate-800">
                    {locationMap.get(deletingTicket.from_location) || deletingTicket.from_location}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Current Stage:</span>
                  <span className="font-black text-slate-950">{deletingTicket.ticket_status}</span>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTicketSubmit}
                  disabled={isDeleting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Ticket</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DispatchView;
