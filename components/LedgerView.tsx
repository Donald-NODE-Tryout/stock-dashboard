'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  X,
  Calendar,
  User,
  MapPin,
  AlertCircle,
  FileText,
  Filter,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Package,
  TrendingUp,
  RotateCcw,
  Clock,
  PlusCircle,
  Check,
  Building,
  Lock,
  ChevronDown,
  Edit2,
  Trash2,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/context/AuthContext';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface LedgerEntry {
  entry_number?: number;
  entry_id: string;
  model_id: string;
  date: string;
  action: string;
  from_location?: string | null;
  to_location?: string | null;
  from_location_id?: string | null;
  to_location_id?: string | null;
  qty: number;
  remarks?: string | null;
  entry_by?: string | null;
  employee_id?: string | null;
  entry_time?: string | null;
}

export interface LocationItem {
  location_id: string | number;
  location_name: string;
  status?: string | null;
}

export interface ProductItem {
  model_id: string;
  model_name?: string | null;
  category?: string | null;
  company?: string | null;
}

export interface EmployeeItem {
  employee_id: string;
  employee_name: string;
  role?: string | null;
  employment_status?: string | null;
}

export interface LedgerViewProps {
  supabase?: SupabaseClient<any, any, any>;
  className?: string;
}

// Automatic sequence handles entry_id atomically via database sequence:
// ALTER TABLE ledger ALTER COLUMN entry_id SET DEFAULT 'VI/ENT/' || nextval('ledger_id_seq');

// ==========================================
// COMPONENT
// ==========================================

export const LedgerView: React.FC<LedgerViewProps> = ({
  supabase,
  className = '',
}) => {
  const { profile } = useAuth();

  // --- Data States ---
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  
  // --- Filter & Pagination States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // --- UI States ---
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // --- Transaction Modal States ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmittingTxn, setIsSubmittingTxn] = useState(false);
  const [previewEntryId, setPreviewEntryId] = useState('ENT-....');
  
  // Transaction Form Fields
  const [formModelId, setFormModelId] = useState('');
  const [modelSearchInput, setModelSearchInput] = useState('');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formAction, setFormAction] = useState<'PURCHASE' | 'SALE' | 'TRANSFER' | 'ADJUSTMENT'>('PURCHASE');
  const [formFromLocation, setFormFromLocation] = useState<string>('');
  const [formToLocation, setFormToLocation] = useState<string>('');
  const [formQty, setFormQty] = useState<string>('1');
  const [formRemarks, setFormRemarks] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // --- Edit Modal States ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [editAction, setEditAction] = useState<string>('PURCHASE');
  const [editModelId, setEditModelId] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editFromLocation, setEditFromLocation] = useState<string>('');
  const [editToLocation, setEditToLocation] = useState<string>('');
  const [editQty, setEditQty] = useState<string>('1');
  const [editRemarks, setEditRemarks] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // --- Delete Modal States ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<LedgerEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // --- Fetch Data ---
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let fetchedLedger: LedgerEntry[] = [];
      let fetchedLocations: LocationItem[] = [];
      let fetchedProducts: ProductItem[] = [];
      let fetchedEmployees: EmployeeItem[] = [];
      let fetchSuccess = false;

      // 1. Try Direct Supabase Client on dashboard_ledger_display view
      if (supabase) {
        try {
          const { data: legData, error: legErr } = await supabase
            .from('dashboard_ledger_display')
            .select('*')
            .order('entry_number', { ascending: false });

          const { data: locData } = await supabase
            .from('locations')
            .select('location_id, location_name, status')
            .eq('status', 'ACTIVE');

          const { data: prodData } = await supabase
            .from('product_master')
            .select('model_id, model_name, category, company')
            .eq('status', 'ACTIVE')
            .order('model_id', { ascending: true });

          const { data: empData } = await supabase
            .from('employee_register')
            .select('employee_id, employee_name, role, employment_status');

          if (!legErr && legData) {
            fetchedLedger = legData;
            fetchedLocations = locData || [];
            fetchedProducts = prodData || [];
            fetchedEmployees = empData || [];
            fetchSuccess = true;
          }
        } catch (directErr) {
          console.warn('Direct ledger fetch failed in browser, using /api/ledger fallback...', directErr);
        }
      }

      // 2. Fallback to /api/ledger route
      if (!fetchSuccess) {
        const res = await fetch('/api/ledger');
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Server responded with status ${res.status}`);
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        fetchedLedger = data.ledger || [];
        fetchedLocations = data.locations || [];
        fetchedProducts = data.products || [];
        fetchedEmployees = data.employees || [];
      }

      setLedger(fetchedLedger);
      setLocations(fetchedLocations);
      setProducts(fetchedProducts);
      setEmployees(fetchedEmployees);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch stock movements.';
      console.error('Error fetching ledger:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Location Name Lookup Map ---
  const locationMap = useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach((loc) => map.set(String(loc.location_id), loc.location_name));
    return map;
  }, [locations]);

  // --- Product Lookup Map ---
  const productMap = useMemo(() => {
    const map = new Map<string, { category?: string; company?: string; name?: string }>();
    products.forEach((p) => {
      map.set(p.model_id, {
        category: p.category && String(p.category) !== 'nan' ? String(p.category) : undefined,
        company: p.company && String(p.company) !== 'nan' ? String(p.company) : undefined,
        name: p.model_name ? String(p.model_name) : undefined,
      });
    });
    return map;
  }, [products]);

  // --- Employee Name Lookup Map ---
  const employeeMap = useMemo(() => {
    const map = new Map<string, { name: string; role?: string }>();
    employees.forEach((emp) => {
      if (emp.employee_id) {
        map.set(emp.employee_id.trim(), {
          name: emp.employee_name,
          role: emp.role || undefined,
        });
      }
    });
    return map;
  }, [employees]);

  // --- Action Change Handler to Auto-Configure Locations Based on Rules ---
  const handleActionChange = (newAction: 'PURCHASE' | 'SALE' | 'TRANSFER' | 'ADJUSTMENT') => {
    setFormAction(newAction);
    setFormError(null);

    const firstLoc = locations.length > 0 ? String(locations[0].location_id) : '';
    const secondLoc = locations.length > 1 ? String(locations[1].location_id) : firstLoc;

    if (newAction === 'PURCHASE') {
      setFormFromLocation(''); // Locked to None/External
      if (!formToLocation) setFormToLocation(firstLoc);
    } else if (newAction === 'SALE') {
      setFormToLocation(''); // Locked to None/External
      if (!formFromLocation) setFormFromLocation(firstLoc);
    } else if (newAction === 'TRANSFER') {
      const fromLoc = formFromLocation || firstLoc;
      setFormFromLocation(fromLoc);
      // Auto-set To Location different from From Location
      if (!formToLocation || formToLocation === fromLoc) {
        setFormToLocation(fromLoc === firstLoc ? secondLoc : firstLoc);
      }
    } else if (newAction === 'ADJUSTMENT') {
      setFormFromLocation(''); // Locked to None/External
      if (!formToLocation) setFormToLocation(firstLoc);
    }

    // Only ADJUSTMENT allows negative values. If user shifts back to any other action,
    // reset negative or <= 0 quantity to 1 (the lowest qty possible for purchase, sell or transfer)
    if (newAction !== 'ADJUSTMENT') {
      const num = parseInt(formQty, 10);
      if (isNaN(num) || num <= 0) {
        setFormQty('1');
      }
    }
  };

  // --- Smart Location Change Handlers (Auto-Swaps on Collision for Transfer) ---
  const handleFromLocationChange = (newFrom: string) => {
    if (formAction === 'TRANSFER' && newFrom === formToLocation) {
      // Collision detected! Swap TO location with old FROM location
      const oldFrom = formFromLocation;
      setFormFromLocation(newFrom);
      if (oldFrom && oldFrom !== newFrom) {
        setFormToLocation(oldFrom);
      } else {
        // Fallback: pick any other available location
        const otherLoc = locations.find((l) => String(l.location_id) !== newFrom);
        setFormToLocation(otherLoc ? String(otherLoc.location_id) : '');
      }
    } else {
      setFormFromLocation(newFrom);
    }
  };

  const handleToLocationChange = (newTo: string) => {
    if (formAction === 'TRANSFER' && newTo === formFromLocation) {
      // Collision detected! Swap FROM location with old TO location
      const oldTo = formToLocation;
      setFormToLocation(newTo);
      if (oldTo && oldTo !== newTo) {
        setFormFromLocation(oldTo);
      } else {
        // Fallback: pick any other available location
        const otherLoc = locations.find((l) => String(l.location_id) !== newTo);
        setFormFromLocation(otherLoc ? String(otherLoc.location_id) : '');
      }
    } else {
      setFormToLocation(newTo);
    }
  };

  // --- Open Add Modal and Initialize Fields ---
  const handleOpenAddModal = async () => {
    setFormError(null);
    setFormModelId('');
    setModelSearchInput('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormRemarks('');
    setFormQty('1');
    setFormAction('PURCHASE');
    setFormFromLocation('');
    setFormToLocation(locations.length > 0 ? String(locations[0].location_id) : '');
    setIsAddModalOpen(true);
    const nextId = 'Auto-Generated (Sequence)';
    setPreviewEntryId(nextId);
  };

  // --- Filtered Models for Autocomplete Dropdown ---
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

  // --- Extract All Unique Models Present in the Ledger ---
  const modelsInLedger = useMemo(() => {
    const counts = new Map<string, number>();
    ledger.forEach((item) => {
      if (item.model_id) {
        counts.set(item.model_id, (counts.get(item.model_id) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([modelId, count]) => ({ modelId, count }))
      .sort((a, b) => a.modelId.localeCompare(b.modelId, undefined, { numeric: true }));
  }, [ledger]);

  // --- Extract Unique Actions in Data ---
  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    ledger.forEach((item) => {
      if (item.action) set.add(item.action.toUpperCase());
    });
    return Array.from(set).sort();
  }, [ledger]);

  // --- Filtered and Sorted Ledger Entries ---
  const filteredLedger = useMemo(() => {
    let result = [...ledger];

    // 1. Model Dropdown Filter
    if (selectedModel !== 'ALL') {
      result = result.filter((item) => item.model_id === selectedModel);
    }

    // 2. Date Range Filter ("From Date" & "To Date")
    if (fromDate) {
      result = result.filter((item) => {
        const itemDate = item.date || (item.entry_time ? item.entry_time.split('T')[0] : '');
        return itemDate >= fromDate;
      });
    }
    if (toDate) {
      result = result.filter((item) => {
        const itemDate = item.date || (item.entry_time ? item.entry_time.split('T')[0] : '');
        return itemDate <= toDate;
      });
    }

    // 3. Action Filter
    if (selectedAction !== 'ALL') {
      result = result.filter((item) => item.action?.toUpperCase() === selectedAction);
    }

    // 4. Location Filter (Matches any SALE, PURCHASE, TRANSFER, ADJUSTMENT, or ENTRY involving this location)
    if (selectedLocation !== 'ALL') {
      const selectedLocObj = locations.find(
        (l) =>
          String(l.location_id).toLowerCase() === selectedLocation.toLowerCase() ||
          l.location_name.toLowerCase() === selectedLocation.toLowerCase()
      );
      const targetId = selectedLocObj ? String(selectedLocObj.location_id).toLowerCase() : selectedLocation.toLowerCase();
      const targetName = selectedLocObj ? selectedLocObj.location_name.toLowerCase() : selectedLocation.toLowerCase();

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

    // 5. Text Search Filter
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((item) => {
        const prod = productMap.get(item.model_id);
        const emp = item.entry_by ? employeeMap.get(item.entry_by.trim()) : undefined;
        const fromName = item.from_location ? (locationMap.get(item.from_location) || item.from_location) : '';
        const toName = item.to_location ? (locationMap.get(item.to_location) || item.to_location) : '';

        return (
          item.entry_id.toLowerCase().includes(query) ||
          item.model_id.toLowerCase().includes(query) ||
          (item.remarks && item.remarks.toLowerCase().includes(query)) ||
          (item.entry_by && item.entry_by.toLowerCase().includes(query)) ||
          (emp?.name && emp.name.toLowerCase().includes(query)) ||
          (item.action && item.action.toLowerCase().includes(query)) ||
          fromName.toLowerCase().includes(query) ||
          toName.toLowerCase().includes(query) ||
          (prod?.category && prod.category.toLowerCase().includes(query))
        );
      });
    }

    // 6. Entry ID Numerical Sorting (with Timestamp & String tie-breaker)
    // Sort by entry_number descending (100% accurate numeric sequence from DB view)
    result.sort((a, b) => {
      const numA = a.entry_number !== undefined
        ? a.entry_number
        : (parseInt(String(a.entry_id || '').replace(/\D+/g, ''), 10) || 0);
      const numB = b.entry_number !== undefined
        ? b.entry_number
        : (parseInt(String(b.entry_id || '').replace(/\D+/g, ''), 10) || 0);

      if (numA !== numB) {
        return sortDirection === 'desc' ? numB - numA : numA - numB;
      }
      return sortDirection === 'desc'
        ? (b.entry_id || '').localeCompare(a.entry_id || '')
        : (a.entry_id || '').localeCompare(b.entry_id || '');
    });

    return result;
  }, [
    ledger,
    selectedModel,
    fromDate,
    toDate,
    selectedAction,
    selectedLocation,
    searchQuery,
    sortDirection,
    productMap,
    locationMap,
    employeeMap
  ]);

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(filteredLedger.length / pageSize));
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLedger.slice(start, start + pageSize);
  }, [filteredLedger, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedModel, fromDate, toDate, selectedAction, selectedLocation, sortDirection]);

  // --- Metrics Summary ---
  const metrics = useMemo(() => {
    let totalUnits = 0;
    let entryCount = 0;
    let transferCount = 0;

    filteredLedger.forEach((item) => {
      totalUnits += Number(item.qty) || 0;
      const act = (item.action || '').toUpperCase();
      if (act === 'ENTRY' || act === 'INWARD' || act === 'PURCHASE') entryCount++;
      else if (act === 'TRANSFER') transferCount++;
    });

    return {
      totalMovements: filteredLedger.length,
      totalUnits,
      entryCount,
      transferCount,
    };
  }, [filteredLedger]);

  // --- Reset All Filters ---
  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedModel('ALL');
    setFromDate('');
    setToDate('');
    setSelectedAction('ALL');
    setSelectedLocation('ALL');
    setSortDirection('desc');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    selectedModel !== 'ALL' ||
    fromDate !== '' ||
    toDate !== '' ||
    selectedAction !== 'ALL' ||
    selectedLocation !== 'ALL' ||
    sortDirection !== 'desc';

  // --- Handle New Transaction Submission ---
  const handleAddTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Validate Model
    if (!formModelId) {
      setFormError('Please select a valid Model from the dropdown list.');
      return;
    }

    // 2. Validate Quantity
    const qtyNum = parseInt(formQty, 10);
    if (isNaN(qtyNum)) {
      setFormError('Please enter a valid numeric Quantity.');
      return;
    }

    if (formAction === 'ADJUSTMENT') {
      if (qtyNum === 0) {
        setFormError('Quantity cannot be 0 for an Adjustment.');
        return;
      }
    } else {
      if (qtyNum <= 0) {
        setFormError('Quantity must be greater than 0.');
        return;
      }
    }

    // 3. Validate Locations based on Action
    if (formAction === 'PURCHASE' && !formToLocation) {
      setFormError('Please select a valid To Location for Purchase.');
      return;
    }
    if (formAction === 'SALE' && !formFromLocation) {
      setFormError('Please select a valid From Location for Sale.');
      return;
    }
    if (formAction === 'TRANSFER') {
      if (!formFromLocation || !formToLocation) {
        setFormError('Both From Location and To Location are required for a Transfer.');
        return;
      }
      if (formFromLocation === formToLocation) {
        setFormError('From Location and To Location cannot be the same for a Transfer.');
        return;
      }
    }
    if (formAction === 'ADJUSTMENT' && !formToLocation) {
      setFormError('Please select a valid Location to apply the Adjustment.');
      return;
    }

    try {
      setIsSubmittingTxn(true);

      // Nullability per blueprint:
      // PURCHASE: from_location = NULL
      // SALE: to_location = NULL
      // TRANSFER: both populated
      const cleanFrom = formAction === 'PURCHASE' ? null : (formFromLocation || null);
      const cleanTo = formAction === 'SALE' ? null : (formToLocation || null);

      const payload = {
        model_id: formModelId,
        date: formDate,
        action: formAction,
        from_location: cleanFrom,
        to_location: cleanTo,
        qty: qtyNum,
        remarks: formRemarks.trim() || null,
        entry_by: profile?.employee_id || 'VI/EMP/1',
      };

      // 1. Try direct Supabase insertion (omitting entry_id to let database sequence auto-assign)
      let inserted = false;
      if (supabase) {
        const { data, error: insertError } = await supabase
          .from('ledger')
          .insert([{ ...payload, entry_time: new Date().toISOString() }])
          .select()
          .single();

        if (!insertError && data) {
          inserted = true;
        } else if (insertError) {
          console.warn('Direct insert failed, falling back to /api/ledger:', insertError.message);
        }
      }

      // 2. Fallback to /api/ledger POST route
      if (!inserted) {
        const res = await fetch('/api/ledger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Server responded with status ${res.status}`);
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);
      }

      // Success! Close modal and refresh
      setIsAddModalOpen(false);
      setSuccessToast(`Transaction recorded successfully!`);
      setTimeout(() => setSuccessToast(null), 4000);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record transaction.';
      console.error('Error inserting transaction:', err);
      setFormError(message);
    } finally {
      setIsSubmittingTxn(false);
    }
  };

  // Helper to reliably resolve a location string or ID to a valid location_id from the active locations list
  const resolveLocationId = useCallback(
    (locVal: string | null | undefined): string => {
      if (!locVal) return '';
      const trimmed = String(locVal).trim().toLowerCase();
      // Match by exact location_id (e.g., "VI/LOC/1")
      const matchById = locations.find((l) => String(l.location_id).toLowerCase() === trimmed);
      if (matchById) return String(matchById.location_id);
      // Match by location_name (e.g., "Shop" or "Mota Mova")
      const matchByName = locations.find((l) => l.location_name.toLowerCase() === trimmed);
      if (matchByName) return String(matchByName.location_id);
      return '';
    },
    [locations]
  );

  // --- Smart Location Handlers for Edit Modal ---
  const handleEditActionChange = (newAction: 'PURCHASE' | 'SALE' | 'TRANSFER' | 'ADJUSTMENT') => {
    setEditAction(newAction);
    setEditError(null);

    const firstLoc = locations.length > 0 ? String(locations[0].location_id) : '';
    const secondLoc = locations.length > 1 ? String(locations[1].location_id) : firstLoc;

    if (newAction === 'PURCHASE') {
      setEditFromLocation(''); // Locked to None/External
      if (!editToLocation) setEditToLocation(firstLoc);
    } else if (newAction === 'SALE') {
      setEditToLocation(''); // Locked to None/External
      // Auto-populate from_location with first valid facility if empty or invalid
      if (!editFromLocation) setEditFromLocation(firstLoc);
    } else if (newAction === 'TRANSFER') {
      const fromLoc = editFromLocation || firstLoc;
      setEditFromLocation(fromLoc);
      if (!editToLocation || editToLocation === fromLoc) {
        setEditToLocation(fromLoc === firstLoc ? secondLoc : firstLoc);
      }
    } else if (newAction === 'ADJUSTMENT') {
      setEditFromLocation(''); // Locked to None/External
      if (!editToLocation) setEditToLocation(firstLoc);
    }

    if (newAction !== 'ADJUSTMENT') {
      const num = parseInt(editQty, 10);
      if (isNaN(num) || num <= 0) {
        setEditQty('1');
      }
    }
  };

  const handleEditFromLocationChange = (newFrom: string) => {
    if (editAction === 'TRANSFER' && newFrom === editToLocation) {
      const oldFrom = editFromLocation;
      setEditFromLocation(newFrom);
      if (oldFrom && oldFrom !== newFrom) {
        setEditToLocation(oldFrom);
      } else {
        const otherLoc = locations.find((l) => String(l.location_id) !== newFrom);
        setEditToLocation(otherLoc ? String(otherLoc.location_id) : '');
      }
    } else {
      setEditFromLocation(newFrom);
    }
  };

  const handleEditToLocationChange = (newTo: string) => {
    if (editAction === 'TRANSFER' && newTo === editFromLocation) {
      const oldTo = editToLocation;
      setEditToLocation(newTo);
      if (oldTo && oldTo !== newTo) {
        setEditFromLocation(oldTo);
      } else {
        const otherLoc = locations.find((l) => String(l.location_id) !== newTo);
        setEditFromLocation(otherLoc ? String(otherLoc.location_id) : '');
      }
    } else {
      setEditToLocation(newTo);
    }
  };

  // --- Handle Edit Stock Movement ---
  const handleOpenEdit = (item: LedgerEntry) => {
    setEditingEntry(item);
    const act = (item.action || 'PURCHASE').toUpperCase() as 'PURCHASE' | 'SALE' | 'TRANSFER' | 'ADJUSTMENT';
    setEditAction(act);
    setEditModelId(item.model_id || '');
    setEditDate(item.date || new Date().toISOString().split('T')[0]);

    const resolvedFrom = resolveLocationId(item.from_location_id || item.from_location);
    const resolvedTo = resolveLocationId(item.to_location_id || item.to_location);

    const firstLoc = locations.length > 0 ? String(locations[0].location_id) : '';
    const secondLoc = locations.length > 1 ? String(locations[1].location_id) : firstLoc;

    if (act === 'PURCHASE') {
      setEditFromLocation('');
      setEditToLocation(resolvedTo || firstLoc);
    } else if (act === 'SALE') {
      setEditFromLocation(resolvedFrom || firstLoc);
      setEditToLocation('');
    } else if (act === 'TRANSFER') {
      const f = resolvedFrom || firstLoc;
      setEditFromLocation(f);
      setEditToLocation(resolvedTo || (f === firstLoc ? secondLoc : firstLoc));
    } else {
      setEditFromLocation('');
      setEditToLocation(resolvedTo || firstLoc);
    }

    setEditQty(String(Math.abs(item.qty || 1)));
    setEditRemarks(item.remarks || '');
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    setEditError(null);

    if (!editModelId) {
      setEditError('Please select a valid Model.');
      return;
    }

    const qtyNum = parseInt(editQty, 10);
    if (isNaN(qtyNum)) {
      setEditError('Please enter a valid numeric Quantity.');
      return;
    }

    if (editAction === 'ADJUSTMENT') {
      if (qtyNum === 0) {
        setEditError('Quantity cannot be 0 for an Adjustment.');
        return;
      }
    } else {
      if (qtyNum <= 0) {
        setEditError('Quantity must be greater than 0.');
        return;
      }
    }

    if (editAction === 'PURCHASE' && !editToLocation) {
      setEditError('Please select a destination facility (To Facility) for Purchase.');
      return;
    }
    if (editAction === 'SALE' && !editFromLocation) {
      setEditError('Please select which facility the items are being sold from (From Facility).');
      return;
    }
    if (editAction === 'TRANSFER') {
      if (!editFromLocation || !editToLocation) {
        setEditError('Both From Facility and To Facility are required for a Transfer.');
        return;
      }
      if (editFromLocation === editToLocation) {
        setEditError('From Facility and To Facility cannot be the same for a Transfer.');
        return;
      }
    }
    if (editAction === 'ADJUSTMENT' && !editToLocation) {
      setEditError('Please select a facility (To Facility) to apply the Adjustment.');
      return;
    }

    try {
      setIsSubmittingEdit(true);

      const cleanFrom = (editAction === 'PURCHASE' || editAction === 'ADJUSTMENT') ? null : (editFromLocation || null);
      const cleanTo = editAction === 'SALE' ? null : (editToLocation || null);

      const payload = {
        entry_id: editingEntry.entry_id,
        date: editDate,
        action: editAction,
        model_id: editModelId,
        from_location: cleanFrom,
        to_location: cleanTo,
        qty: qtyNum,
        remarks: editRemarks.trim() || null,
      };

      const res = await fetch('/api/ledger', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to update transaction (status ${res.status})`);
      }

      setIsEditModalOpen(false);
      setSuccessToast(`Stock movement ${editingEntry.entry_id} updated successfully!`);
      setTimeout(() => setSuccessToast(null), 4000);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update transaction.';
      setEditError(msg);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // --- Handle Delete Stock Movement ---
  const handleOpenDelete = (item: LedgerEntry) => {
    setDeletingEntry(item);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteSubmit = async () => {
    if (!deletingEntry) return;
    try {
      setIsDeleting(true);
      const deleter = profile?.employee_name
        ? `${profile.employee_name} (${profile.employee_id || ''})`.trim()
        : (profile?.employee_id || 'USER');

      const res = await fetch(`/api/ledger?entry_id=${encodeURIComponent(deletingEntry.entry_id)}&deleted_by=${encodeURIComponent(deleter)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to delete transaction (status ${res.status})`);
      }

      setIsDeleteModalOpen(false);
      setSuccessToast(`Stock movement ${deletingEntry.entry_id} deleted and archived.`);
      setTimeout(() => setSuccessToast(null), 4000);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete transaction.';
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Action Badges ---
  const renderActionBadge = (action: string) => {
    const upper = (action || '').toUpperCase();
    if (upper === 'ENTRY' || upper === 'INWARD' || upper === 'PURCHASE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-md text-xs font-bold shadow-2xs">
          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
          <span>{action}</span>
        </span>
      );
    }
    if (upper === 'TRANSFER') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 rounded-md text-xs font-bold shadow-2xs">
          <ArrowRightLeft className="w-3.5 h-3.5 text-amber-600" />
          <span>TRANSFER</span>
        </span>
      );
    }
    if (upper === 'DISPATCH' || upper === 'OUTWARD' || upper === 'SALE') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-purple-50 text-purple-800 border border-purple-300 rounded-md text-xs font-bold shadow-2xs">
          <ArrowUpRight className="w-3.5 h-3.5 text-purple-600" />
          <span>{action}</span>
        </span>
      );
    }
    if (upper === 'ADJUSTMENT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-sky-50 text-sky-900 border border-sky-300 rounded-md text-xs font-bold shadow-2xs">
          <RefreshCw className="w-3 h-3 text-sky-600" />
          <span>ADJUSTMENT</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 rounded-md text-xs font-bold">
        <span>{action}</span>
      </span>
    );
  };

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className={`w-full bg-white rounded-xl border border-slate-200 shadow-md flex flex-col font-sans ${className}`}>
      
      {/* ---------------- SUCCESS TOAST NOTIFICATION ---------------- */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 p-4 bg-emerald-600 text-white rounded-xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 font-bold text-sm">
          <Check className="w-5 h-5 bg-white text-emerald-700 rounded-full p-0.5" />
          <span>{successToast}</span>
        </div>
      )}

      {/* ---------------- METRICS CARDS ---------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200 border-b border-slate-200 bg-amber-50/30">
        <div className="p-3.5 sm:p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-400 text-slate-950 rounded-xl shadow-xs">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Total Movements</p>
            <p className="text-xl font-black text-slate-950 mt-0.5">{metrics.totalMovements}</p>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 flex items-center gap-3">
          <div className="p-2 bg-yellow-400 text-slate-950 rounded-xl shadow-xs">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Units Logged</p>
            <p className="text-xl font-black text-slate-950 mt-0.5">{metrics.totalUnits}</p>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shadow-xs border border-emerald-200">
            <ArrowDownLeft className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Stock Intakes</p>
            <p className="text-xl font-black text-emerald-800 mt-0.5">{metrics.entryCount}</p>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shadow-xs border border-amber-200">
            <ArrowRightLeft className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Transfers</p>
            <p className="text-xl font-black text-amber-900 mt-0.5">{metrics.transferCount}</p>
          </div>
        </div>
      </div>

      {/* ---------------- ADVANCED FILTER & ACTION BAR ---------------- */}
      <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-white space-y-3">
        
        {/* Row 1: Search + Add a Transaction + Refresh + Reset */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-xl">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Entry ID, Model, Remarks, User Name..."
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

          <div className="flex items-center gap-2 self-end lg:self-auto flex-wrap">
            {/* 🌟 "Add a transaction" Button */}
            <button
              onClick={handleOpenAddModal}
              type="button"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-black text-slate-950 bg-amber-400 hover:bg-amber-300 border border-amber-400 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-slate-950" />
              <span>Add a transaction</span>
            </button>

            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition-colors shadow-xs"
                title="Reset All Filters"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-800" />
                <span>Reset Filters</span>
              </button>
            )}

            <button
              onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors shadow-xs"
              title="Toggle Entry ID Order (Newest First / Oldest First)"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-600" />
              <span>{sortDirection === 'desc' ? 'Newest First' : 'Oldest First'}</span>
            </button>

            <button
              onClick={fetchData}
              disabled={isLoading}
              className="inline-flex items-center justify-center p-2 text-slate-800 hover:bg-amber-400 bg-amber-300 border border-amber-400 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
              title="Refresh Ledger"
              type="button"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-slate-950' : ''}`} />
            </button>
          </div>
        </div>

        {/* Row 2: Model Dropdown + Date Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-0.5">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Package className="w-3 h-3 text-amber-500" />
              Model Filter
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="py-1.5 px-2.5 text-xs font-bold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 shadow-xs cursor-pointer truncate"
            >
              <option value="ALL">All Models ({modelsInLedger.length})</option>
              {modelsInLedger.map((m) => (
                <option key={m.modelId} value={m.modelId}>
                  {m.modelId} ({m.count} logs)
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-amber-500" />
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="py-1 px-2.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 shadow-xs cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-amber-500" />
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="py-1 px-2.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 shadow-xs cursor-pointer"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                Action
              </label>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="py-1.5 px-2 text-xs font-bold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-xs cursor-pointer truncate"
              >
                <option value="ALL">All Actions</option>
                {uniqueActions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                Location
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="py-1.5 px-2 text-xs font-bold bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-xs cursor-pointer truncate"
              >
                <option value="ALL">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.location_id} value={loc.location_id}>
                    {loc.location_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- ACTIVE FILTERS CHIP BAR ---------------- */}
      {hasActiveFilters && (
        <div className="px-4 py-2 bg-amber-50/80 border-b border-amber-200 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-extrabold text-amber-900 uppercase tracking-wider text-[11px]">Filtered By:</span>
          
          {selectedModel !== 'ALL' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-400 text-slate-950 rounded-md font-bold text-xs shadow-2xs">
              <span>Model: {selectedModel}</span>
              <button onClick={() => setSelectedModel('ALL')} type="button" className="hover:opacity-75">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {(fromDate || toDate) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-900 text-white rounded-md font-medium text-xs">
              <span>Date: {fromDate || 'Start'} ➔ {toDate || 'Present'}</span>
              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                type="button"
                className="hover:text-amber-300"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {selectedAction !== 'ALL' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-300 text-slate-900 rounded-md font-semibold text-xs">
              <span>Action: {selectedAction}</span>
              <button onClick={() => setSelectedAction('ALL')} type="button" className="hover:text-rose-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {selectedLocation !== 'ALL' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-300 text-slate-900 rounded-md font-semibold text-xs">
              <span>Location: {locationMap.get(selectedLocation) || selectedLocation}</span>
              <button onClick={() => setSelectedLocation('ALL')} type="button" className="hover:text-rose-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            onClick={resetAllFilters}
            type="button"
            className="text-xs font-bold text-amber-900 hover:text-amber-950 underline ml-2"
          >
            Clear all filters
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
      {/* 1. The Wrapper: Controls overflow bounds & spill     */}
      {/* ---------------------------------------------------- */}
      <div className="w-full max-h-[calc(100vh-280px)] min-h-[440px] overflow-auto border-t border-slate-200 rounded-b-xl relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-sm flex flex-col items-center justify-center z-30 gap-3 min-h-[300px]">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
            <p className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Loading stock movements...
            </p>
          </div>
        )}

        {/* 2. The Table: Must have relative positioning & border-collapse */}
        <table className="w-full min-w-[1100px] text-left border-collapse relative">
          {/* 3. The Headers: The sticky class goes directly on the <th> tags */}
          <thead>
            <tr className="bg-slate-100 text-slate-800 text-xs uppercase font-extrabold tracking-wider">
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[120px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                <button
                  type="button"
                  onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  className="flex items-center gap-1.5 hover:text-amber-700 transition-colors uppercase font-extrabold"
                  title={`Click to sort ${sortDirection === 'desc' ? 'Oldest First' : 'Newest First'}`}
                >
                  <span>ENTRY ID</span>
                  <ArrowUpDown className="w-3.5 h-3.5 text-amber-600" />
                </button>
              </th>
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[130px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">DATE</th>
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[220px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">MODEL & DETAILS</th>
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 text-center min-w-[110px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">ACTION</th>
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[130px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">FROM</th>
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[130px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">TO</th>
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 text-right min-w-[90px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">QTY</th>
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[240px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">REMARKS</th>
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 text-left min-w-[150px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">BY (EMPLOYEE)</th>
              <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 text-center min-w-[90px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">ACTIONS</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {paginatedEntries.length > 0 ? (
              paginatedEntries.map((item) => {
                const prod = productMap.get(item.model_id);
                const emp = item.entry_by ? employeeMap.get(item.entry_by.trim()) : undefined;
                const fromLocName = item.from_location ? (locationMap.get(item.from_location) || item.from_location) : null;
                const toLocName = item.to_location ? (locationMap.get(item.to_location) || item.to_location) : null;

                return (
                  <tr key={item.entry_id} className="hover:bg-amber-50/50 transition-colors">
                    
                    {/* Entry ID */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-900 rounded-md border border-slate-200 shadow-2xs">
                        {item.entry_id}
                      </span>
                    </td>

                    {/* Date & Time */}
                    <td className="py-3 px-4 whitespace-nowrap text-xs font-semibold text-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{item.date}</span>
                        {item.entry_time && (
                          <span className="text-[10px] text-slate-400 font-normal flex items-center gap-0.5">
                            <Clock className="w-3 h-3 text-slate-300" />
                            {new Date(item.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Model & Details (Side-by-side single line) */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[14px] font-extrabold text-slate-950 shrink-0">
                          {item.model_id}
                        </span>
                        {prod?.category && (
                          <span className="text-[11px] text-slate-500 font-normal truncate max-w-[200px]" title={prod.category}>
                            • {prod.category}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Action Badge */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {renderActionBadge(item.action)}
                    </td>

                    {/* From Location */}
                    <td className="py-3 px-4 text-xs font-semibold text-slate-700 whitespace-nowrap">
                      {fromLocName ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{fromLocName}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300 font-light select-none">—</span>
                      )}
                    </td>

                    {/* To Location */}
                    <td className="py-3 px-4 text-xs font-bold text-slate-950 whitespace-nowrap">
                      {toLocName ? (
                        <span className="inline-flex items-center gap-1 text-slate-950">
                          <MapPin className="w-3.5 h-3.5 text-amber-500" />
                          <span>{toLocName}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300 font-light select-none">—</span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap font-black text-slate-950 text-sm">
                      {item.qty > 0 ? `+${item.qty}` : item.qty}
                    </td>

                    {/* Remarks */}
                    <td className="py-3 px-4 text-xs font-medium text-slate-600">
                      <span className="line-clamp-1 truncate max-w-[260px]" title={item.remarks || ''}>
                        {item.remarks || <span className="text-slate-300 font-light">—</span>}
                      </span>
                    </td>

                    {/* BY (Employee Name from employee_register) */}
                    <td className="py-3 px-4 text-left whitespace-nowrap">
                      {emp?.name ? (
                        <div className="flex items-center gap-1.5" title={`Employee ID: ${item.entry_by || ''}`}>
                          <User className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-900">{emp.name}</span>
                          {item.entry_by && (
                            <span className="text-[10px] font-mono text-slate-400">
                              ({item.entry_by})
                            </span>
                          )}
                        </div>
                      ) : item.entry_by ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-mono font-medium">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{item.entry_by}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Actions: Edit & Delete */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="p-1.5 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Stock Movement"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDelete(item)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Stock Movement"
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
                <td colSpan={10} className="py-16 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2.5">
                    <Package className="w-9 h-9 stroke-1 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">No stock movements match your filters</p>
                    <p className="text-xs text-slate-400">
                      Try selecting a different Model, date range, or clicking Reset Filters.
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={resetAllFilters}
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
        </table>
      </div>

      {/* ---------------- PAGINATION FOOTER ---------------- */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-bold text-slate-700">
        <div>
          Showing {filteredLedger.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
          {Math.min(currentPage * pageSize, filteredLedger.length)} of {filteredLedger.length} movements
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            type="button"
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <span className="px-3 py-1 bg-amber-400 text-slate-950 border border-amber-400 rounded-lg font-extrabold shadow-2xs">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            type="button"
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 🌟 ADD A TRANSACTION MODAL                            */}
      {/* ==================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-950 text-amber-400 rounded-xl shadow-xs">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-slate-950">Add a Transaction</h3>
                  <p className="text-[11px] font-bold text-slate-800">Record stock movement in ledger</p>
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
            <form onSubmit={handleAddTransactionSubmit} className="p-6 overflow-y-auto space-y-4">
              
              {/* Form Error Banner */}
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. ENTRY_ID (Clean Auto-Generated Display) & AUDIT ATTRIBUTION */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
                      Entry ID
                    </label>
                    <span className="font-mono text-sm font-black text-slate-900">
                      {previewEntryId}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">Auto</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-amber-50/80 border border-amber-200 rounded-xl">
                  <div>
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 block">
                      Recorded By
                    </label>
                    <span className="text-xs font-black text-slate-950 truncate block max-w-[120px]" title={profile?.employee_name || 'Staff'}>
                      {profile?.employee_name || 'Staff User'}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-black text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded">
                    {profile?.employee_id || 'VI0001'}
                  </span>
                </div>
              </div>

              {/* 2. MODEL_NAME (Autocomplete Dropdown) */}
              <div className="relative">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center justify-between mb-1">
                  <span>Model ID / Name <span className="text-rose-500">*</span></span>
                  {formModelId && (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Selected
                    </span>
                  )}
                </label>

                <div className="relative">
                  <input
                    type="text"
                    value={modelSearchInput}
                    onChange={(e) => {
                      setModelSearchInput(e.target.value);
                      setIsModelDropdownOpen(true);
                      if (formModelId && e.target.value !== formModelId) {
                        setFormModelId('');
                      }
                    }}
                    onFocus={() => setIsModelDropdownOpen(true)}
                    placeholder="Type or search Model ID from product master..."
                    className={`w-full pl-3.5 pr-10 py-2.5 text-sm font-semibold bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                      formModelId
                        ? 'border-emerald-500 bg-emerald-50/20 text-slate-900'
                        : 'border-slate-300 text-slate-800'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setIsModelDropdownOpen((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                {/* Autocomplete Suggestions Dropdown */}
                {isModelDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 max-h-52 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-xl z-50 divide-y divide-slate-100">
                    {filteredAutocompleteModels.length > 0 ? (
                      filteredAutocompleteModels.map((prod) => (
                        <div
                          key={prod.model_id}
                          onClick={() => {
                            setFormModelId(prod.model_id);
                            setModelSearchInput(prod.model_id);
                            setIsModelDropdownOpen(false);
                          }}
                          className={`p-2.5 hover:bg-amber-50 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                            formModelId === prod.model_id ? 'bg-amber-100 font-bold' : ''
                          }`}
                        >
                          <div>
                            <span className="font-mono text-sm font-extrabold text-slate-950 block">
                              {prod.model_id}
                            </span>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                              {prod.company && (
                                <span className="font-bold text-slate-800">{prod.company}</span>
                              )}
                              {prod.category && <span>• {prod.category}</span>}
                            </div>
                          </div>
                          {formModelId === prod.model_id && (
                            <Check className="w-4 h-4 text-emerald-600 font-bold shrink-0" />
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-400">
                        No active models matched "{modelSearchInput}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. DATE & ACTION ROW */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* Date Picker */}
                <div>
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                    Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-800"
                  />
                </div>

                {/* Action Dropdown */}
                <div>
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                    Action <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formAction}
                    onChange={(e) => handleActionChange(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-800 cursor-pointer"
                  >
                    <option value="PURCHASE">PURCHASE (Inward)</option>
                    <option value="SALE">SALE (Outward)</option>
                    <option value="TRANSFER">TRANSFER (Between Locations)</option>
                    <option value="ADJUSTMENT">ADJUSTMENT (Stock Count)</option>
                  </select>
                </div>
              </div>

              {/* 4. FROM & TO LOCATION ROW WITH SMART AUTO-SWAP */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* From Location */}
                <div>
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center justify-between mb-1">
                    <span>From Location</span>
                    {(formAction === 'PURCHASE' || formAction === 'ADJUSTMENT') && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Lock className="w-3 h-3 text-slate-400" /> Locked
                      </span>
                    )}
                  </label>

                  {/* PURCHASE & ADJUSTMENT: From Location is locked to None / External Supplier */}
                  {formAction === 'PURCHASE' || formAction === 'ADJUSTMENT' ? (
                    <div className="w-full px-3 py-2 text-xs font-semibold bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed flex items-center justify-between">
                      <span>— None / External Supplier —</span>
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  ) : (
                    <select
                      value={formFromLocation}
                      onChange={(e) => handleFromLocationChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-800 cursor-pointer truncate"
                    >
                      <option value="" disabled>-- Select Source Location --</option>
                      {locations.map((loc) => (
                        <option key={loc.location_id} value={loc.location_id}>
                          {loc.location_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* To Location */}
                <div>
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center justify-between mb-1">
                    <span>To Location</span>
                    {formAction === 'SALE' && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Lock className="w-3 h-3 text-slate-400" /> Locked
                      </span>
                    )}
                  </label>

                  {/* SALE: To Location is locked to None / External Customer */}
                  {formAction === 'SALE' ? (
                    <div className="w-full px-3 py-2 text-xs font-semibold bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed flex items-center justify-between">
                      <span>— None / External Customer —</span>
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  ) : (
                    <select
                      value={formToLocation}
                      onChange={(e) => handleToLocationChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-800 cursor-pointer truncate"
                    >
                      <option value="" disabled>-- Select Destination Location --</option>
                      {locations.map((loc) => (
                        <option key={loc.location_id} value={loc.location_id}>
                          {loc.location_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* 5. QUANTITY WITH ACTION-SPECIFIC CONSTRAINTS */}
              <div>
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                  Quantity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="1"
                  min={formAction === 'ADJUSTMENT' ? undefined : '1'}
                  value={formQty}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (formAction !== 'ADJUSTMENT' && val.includes('-')) {
                      return;
                    }
                    setFormQty(val);
                  }}
                  required
                  placeholder={
                    formAction === 'ADJUSTMENT'
                      ? 'Enter adjustment (e.g. +5 or -3, cannot be 0)...'
                      : 'Enter unit quantity (min 1)...'
                  }
                  className="w-full px-3.5 py-2 text-sm font-bold bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-900"
                />
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  {formAction === 'ADJUSTMENT'
                    ? '⚡ For Adjustments: Enter positive (+5) to add units or negative (-3) to deduct units (qty ≠ 0).'
                    : '⚡ Enter positive number of units (qty > 0).'}
                </p>
              </div>

              {/* 6. REMARKS */}
              <div>
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="Add movement notes, reference numbers, or context..."
                  className="w-full px-3.5 py-2 text-xs font-medium bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-800 placeholder-slate-400 resize-none"
                />
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTxn || !formModelId}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black transition-all shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingTxn ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Saving Transaction...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save Transaction</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* ✏️ EDIT STOCK MOVEMENT MODAL                         */}
      {/* ==================================================== */}
      {isEditModalOpen && editingEntry && (
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
                  <h3 className="text-base font-black tracking-tight">Edit Stock Movement</h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    {editingEntry.entry_id} • Movement Details
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
            <form onSubmit={handleEditSubmit} className="p-6 overflow-y-auto space-y-4">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Entry ID Pill (Read-only) */}
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  Entry Identifier
                </label>
                <div className="px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-700">
                  {editingEntry.entry_id}
                </div>
              </div>

              {/* Action & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Movement Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editAction}
                    onChange={(e) => handleEditActionChange(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  >
                    <option value="PURCHASE">PURCHASE (Inward)</option>
                    <option value="SALE">SALE (Outward)</option>
                    <option value="TRANSFER">TRANSFER (Between)</option>
                    <option value="ADJUSTMENT">ADJUSTMENT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Product Model & Quantity */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Model No. <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editModelId}
                    onChange={(e) => setEditModelId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  >
                    <option value="">Select a Model...</option>
                    {products.map((p) => (
                      <option key={p.model_id} value={p.model_id}>
                        {p.model_id} {p.category ? `(${p.category})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Quantity <span className="text-rose-500">*</span>
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
              </div>

              {/* From & To Locations */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    From Facility {editAction === 'SALE' || editAction === 'TRANSFER' ? <span className="text-rose-500">*</span> : '(N/A)'}
                  </label>
                  <select
                    value={editFromLocation}
                    onChange={(e) => handleEditFromLocationChange(e.target.value)}
                    disabled={editAction === 'PURCHASE' || editAction === 'ADJUSTMENT'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">None / External</option>
                    {locations.map((loc) => (
                      <option key={loc.location_id} value={String(loc.location_id)}>
                        {loc.location_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    To Facility {editAction === 'PURCHASE' || editAction === 'TRANSFER' || editAction === 'ADJUSTMENT' ? <span className="text-rose-500">*</span> : '(N/A)'}
                  </label>
                  <select
                    value={editToLocation}
                    onChange={(e) => handleEditToLocationChange(e.target.value)}
                    disabled={editAction === 'SALE'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">None / External</option>
                    {locations.map((loc) => (
                      <option key={loc.location_id} value={String(loc.location_id)}>
                        {loc.location_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Movement Notes / Remarks
                </label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Optional movement description or bill reference..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
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
      {/* 🗑️ DELETE STOCK MOVEMENT CONFIRMATION MODAL         */}
      {/* ==================================================== */}
      {isDeleteModalOpen && deletingEntry && (
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
                  <h3 className="text-base font-black tracking-tight">Delete Stock Movement</h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    {deletingEntry.entry_id}
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
                Are you sure you want to delete this movement entry? This transaction will be archived in the deleted records archive and removed from the active stock movements table.
              </p>

              {/* Movement Summary Details Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Model:</span>
                  <span className="font-mono font-black text-slate-950">{deletingEntry.model_id}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Action & Quantity:</span>
                  <span className="font-bold text-slate-900">{deletingEntry.action} ({deletingEntry.qty > 0 ? `+${deletingEntry.qty}` : deletingEntry.qty} units)</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Date:</span>
                  <span className="font-semibold text-slate-700">{deletingEntry.date}</span>
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
                  onClick={handleDeleteSubmit}
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
                      <span>Delete Entry</span>
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

export default LedgerView;
