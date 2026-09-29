'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package,
  Search,
  PlusCircle,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  Building,
  Layers,
  MapPin,
  Clock,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
  ListOrdered,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Save,
  Edit2,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/context/AuthContext';

export interface ProductItem {
  model_id: string;
  model_name?: string;
  category?: string | null;
  company?: string | null;
  status: string;
  entry_time?: string | null;
}

export interface LocationOption {
  location_id: string;
  location_name: string;
  status: string;
}

export type ArrangeMode = 'custom' | 'company' | 'category';

export interface CompanyCategoryGroup {
  categoryName: string;
  models: string[];
}

export interface CompanyArrangeGroup {
  companyName: string;
  categories: CompanyCategoryGroup[];
}

export interface CategoryArrangeGroup {
  categoryName: string;
  models: string[];
}

interface ProductViewProps {
  supabase?: SupabaseClient;
  className?: string;
}

export const ProductView: React.FC<ProductViewProps> = ({
  supabase,
  className = '',
}) => {
  const { profile } = useAuth();

  // --- Data States ---
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // --- Arrange Rows / Persistent Order States ---
  const [customModelOrder, setCustomModelOrder] = useState<string[]>([]);
  const [modalModelOrder, setModalModelOrder] = useState<string[]>([]);
  const [arrangeMode, setArrangeMode] = useState<ArrangeMode>('custom');
  const [modalCompanyTree, setModalCompanyTree] = useState<CompanyArrangeGroup[]>([]);
  const [modalCategoryTree, setModalCategoryTree] = useState<CategoryArrangeGroup[]>([]);
  const [expandedCompanies, setExpandedCompanies] = useState<Record<string, boolean>>({});
  const [expandedCompanyCategories, setExpandedCompanyCategories] = useState<Record<string, boolean>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [isRowModalOpen, setIsRowModalOpen] = useState<boolean>(false);
  const [isSavingOrder, setIsSavingOrder] = useState<boolean>(false);
  const [rowSearchQuery, setRowSearchQuery] = useState<string>('');
  const [draggedModelIndex, setDraggedModelIndex] = useState<number | null>(null);
  const [dragOverModelIndex, setDragOverModelIndex] = useState<number | null>(null);

  // --- Filter & Pagination States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [selectedCompany, setSelectedCompany] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'custom' | 'db_default' | 'model_id' | 'entry_time'>('custom');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;

  // --- Modal States ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Product Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [editModelName, setEditModelName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Add Product Form Fields
  const [formModelId, setFormModelId] = useState('');
  const [formModelName, setFormModelName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formToLocation, setFormToLocation] = useState('');
  const [formQty, setFormQty] = useState('1');
  const [formRemarks, setFormRemarks] = useState('Initial Product Intake');

  // Status Toggle Confirmation Dialog State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    product: ProductItem | null;
    nextStatus: string;
    isUpdating: boolean;
  }>({
    isOpen: false,
    product: null,
    nextStatus: 'INACTIVE',
    isUpdating: false,
  });

  // --- Fetch Data ---
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const res = await fetch('/api/products');
      if (!res.ok) {
        throw new Error(`Failed to fetch products: status ${res.status}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setProducts(data.products || []);
      setLocations(data.locations || []);

      // Default initial location if available
      const activeLocs = (data.locations || []).filter((l: LocationOption) => l.status === 'ACTIVE');
      if (activeLocs.length > 0 && !formToLocation) {
        setFormToLocation(activeLocs[0].location_id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading product catalogue';
      console.error('Error fetching products:', err);
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [formToLocation]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Load Persistent Custom Model Arrangement ---
  useEffect(() => {
    fetch('/api/products/order')
      .then((res) => res.json())
      .then((data) => {
        if (data.order && Array.isArray(data.order) && data.order.length > 0) {
          setCustomModelOrder(data.order);
          if (data.mode) setArrangeMode(data.mode);
          setSortField('custom');
        } else {
          try {
            const saved = localStorage.getItem('app_custom_model_order') || localStorage.getItem('legacy_custom_model_order');
            const savedMode = (localStorage.getItem('app_custom_model_order_mode') || localStorage.getItem('legacy_custom_model_order_mode')) as ArrangeMode;
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setCustomModelOrder(parsed);
                if (savedMode) setArrangeMode(savedMode);
                setSortField('custom');
                return;
              }
            }
          } catch {}
          setSortField('db_default');
        }
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem('app_custom_model_order') || localStorage.getItem('legacy_custom_model_order');
          const savedMode = (localStorage.getItem('app_custom_model_order_mode') || localStorage.getItem('legacy_custom_model_order_mode')) as ArrangeMode;
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setCustomModelOrder(parsed);
              if (savedMode) setArrangeMode(savedMode);
              setSortField('custom');
              return;
            }
          }
        } catch {}
        setSortField('db_default');
      });
  }, []);

  // --- Fast Metadata Lookup for Model Items ---
  const productMetaMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    products.forEach((p) => map.set(p.model_id, p));
    return map;
  }, [products]);

  // --- Unique Companies & Categories for Filter Dropdowns ---
  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.company && p.company !== 'nan') set.add(p.company.trim());
    });
    return Array.from(set).sort();
  }, [products]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category.trim());
    });
    return Array.from(set).sort();
  }, [products]);

  // --- Active Locations for Add Modal ---
  const activeLocations = useMemo(() => {
    return locations.filter((l) => l.status === 'ACTIVE');
  }, [locations]);

  // --- Filtering & Sorting ---
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // 1. Status Filter
    if (statusFilter !== 'ALL') {
      result = result.filter((p) => (p.status || 'ACTIVE').toUpperCase() === statusFilter);
    }

    // 2. Company Filter
    if (selectedCompany !== 'ALL') {
      result = result.filter((p) => (p.company || '').trim() === selectedCompany);
    }

    // 3. Category Filter
    if (selectedCategory !== 'ALL') {
      result = result.filter((p) => (p.category || '').trim() === selectedCategory);
    }

    // 4. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.model_id.toLowerCase().includes(q) ||
          (p.model_name && p.model_name.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.company && p.company.toLowerCase().includes(q))
      );
    }

    // 5. Sorting
    result.sort((a, b) => {
      if (sortField === 'custom') {
        const orderMap = new Map<string, number>();
        customModelOrder.forEach((id, idx) => orderMap.set(id, idx));
        const indexA = orderMap.has(a.model_id) ? orderMap.get(a.model_id)! : 999999;
        const indexB = orderMap.has(b.model_id) ? orderMap.get(b.model_id)! : 999999;
        return sortDirection === 'asc' ? indexA - indexB : indexB - indexA;
      } else if (sortField === 'model_id') {
        return sortDirection === 'asc'
          ? a.model_id.localeCompare(b.model_id)
          : b.model_id.localeCompare(a.model_id);
      } else if (sortField === 'entry_time') {
        const timeA = new Date(a.entry_time || 0).getTime();
        const timeB = new Date(b.entry_time || 0).getTime();
        return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      } else {
        // 'db_default': natural database order from product_master
        return 0;
      }
    });

    return result;
  }, [products, statusFilter, selectedCompany, selectedCategory, searchQuery, sortField, sortDirection, customModelOrder]);

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, selectedCompany, selectedCategory, sortField, sortDirection]);

  // --- Metrics ---
  const metrics = useMemo(() => {
    let active = 0;
    let inactive = 0;
    const catSet = new Set<string>();

    products.forEach((p) => {
      if ((p.status || 'ACTIVE').toUpperCase() === 'ACTIVE') active++;
      else inactive++;
      if (p.category) catSet.add(p.category.trim());
    });

    return {
      total: products.length,
      active,
      inactive,
      categories: catSet.size,
    };
  }, [products]);

  // --- Arrange Rows Handlers ---
  const handleOpenRowModal = () => {
    const allModelIds = products.map((p) => p.model_id);
    let initialOrder: string[] = [];

    if (customModelOrder.length > 0) {
      const validSet = new Set(allModelIds);
      const retained = customModelOrder.filter((id) => validSet.has(id));
      const newlyAdded = allModelIds.filter((id) => !retained.includes(id));
      initialOrder = [...retained, ...newlyAdded];
    } else {
      initialOrder = [...allModelIds];
    }

    setModalModelOrder(initialOrder);

    const orderIndexMap = new Map<string, number>();
    initialOrder.forEach((id, idx) => orderIndexMap.set(id, idx));

    // 1. Build Company Tree: Company -> Category -> Models
    const compMap = new Map<string, Map<string, string[]>>();
    products.forEach((p) => {
      const comp = p.company && p.company !== 'nan' ? p.company.trim() : 'Unbranded / Other';
      const cat = p.category && p.category !== 'nan' ? p.category.trim() : 'Uncategorized';
      if (!compMap.has(comp)) compMap.set(comp, new Map<string, string[]>());
      const catMap = compMap.get(comp)!;
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(p.model_id);
    });

    const compKeys = Array.from(compMap.keys()).sort((a, b) => {
      if (a === 'Unbranded / Other') return 1;
      if (b === 'Unbranded / Other') return -1;
      return a.localeCompare(b);
    });

    const builtCompanyTree: CompanyArrangeGroup[] = [];
    const initialExpComp: Record<string, boolean> = {};
    const initialExpCompCat: Record<string, boolean> = {};

    compKeys.forEach((compName, cIdx) => {
      const catMap = compMap.get(compName)!;
      const catKeys = Array.from(catMap.keys()).sort();
      const categories: CompanyCategoryGroup[] = [];

      catKeys.forEach((catName, catIdx) => {
        const models = [...catMap.get(catName)!];
        models.sort((a, b) => (orderIndexMap.get(a) ?? 999) - (orderIndexMap.get(b) ?? 999));
        categories.push({ categoryName: catName, models });

        if (cIdx === 0 && catIdx === 0) {
          initialExpCompCat[`${compName}___${catName}`] = true;
        }
      });

      builtCompanyTree.push({ companyName: compName, categories });
      if (cIdx === 0) initialExpComp[compName] = true;
    });

    // 2. Build Category Tree: Category -> Models
    const catMap = new Map<string, string[]>();
    products.forEach((p) => {
      const cat = p.category && p.category !== 'nan' ? p.category.trim() : 'Uncategorized';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(p.model_id);
    });

    const catKeys = Array.from(catMap.keys()).sort();
    const builtCategoryTree: CategoryArrangeGroup[] = [];
    const initialExpCat: Record<string, boolean> = {};

    catKeys.forEach((catName, idx) => {
      const models = [...catMap.get(catName)!];
      models.sort((a, b) => (orderIndexMap.get(a) ?? 999) - (orderIndexMap.get(b) ?? 999));
      builtCategoryTree.push({ categoryName: catName, models });
      if (idx === 0) initialExpCat[catName] = true;
    });

    setModalCompanyTree(builtCompanyTree);
    setModalCategoryTree(builtCategoryTree);
    setExpandedCompanies(initialExpComp);
    setExpandedCompanyCategories(initialExpCompCat);
    setExpandedCategories(initialExpCat);

    setRowSearchQuery('');
    setDraggedModelIndex(null);
    setDragOverModelIndex(null);
    setIsRowModalOpen(true);
  };

  // --- Custom Mode Helpers ---
  const moveModelItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= modalModelOrder.length) return;
    const updated = [...modalModelOrder];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setModalModelOrder(updated);
  };

  const moveModelToTop = (index: number) => {
    moveModelItem(index, 0);
  };

  const moveModelToBottom = (index: number) => {
    moveModelItem(index, modalModelOrder.length - 1);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedModelIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverModelIndex !== index) {
      setDragOverModelIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedModelIndex === null || draggedModelIndex === targetIndex) {
      setDraggedModelIndex(null);
      setDragOverModelIndex(null);
      return;
    }

    const updated = [...modalModelOrder];
    const [moved] = updated.splice(draggedModelIndex, 1);
    updated.splice(targetIndex, 0, moved);
    setModalModelOrder(updated);
    setDraggedModelIndex(null);
    setDragOverModelIndex(null);
  };

  // --- Company Mode Movement Helpers ---
  const moveCompany = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= modalCompanyTree.length) return;
    const next = [...modalCompanyTree];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setModalCompanyTree(next);
  };

  const moveCategoryInCompany = (compIndex: number, fromIndex: number, toIndex: number) => {
    const nextTree = [...modalCompanyTree];
    const comp = { ...nextTree[compIndex], categories: [...nextTree[compIndex].categories] };
    if (toIndex < 0 || toIndex >= comp.categories.length) return;
    const [moved] = comp.categories.splice(fromIndex, 1);
    comp.categories.splice(toIndex, 0, moved);
    nextTree[compIndex] = comp;
    setModalCompanyTree(nextTree);
  };

  const moveModelInCompanyCategory = (
    compIndex: number,
    catIndex: number,
    fromIndex: number,
    toIndex: number
  ) => {
    const nextTree = [...modalCompanyTree];
    const comp = { ...nextTree[compIndex], categories: [...nextTree[compIndex].categories] };
    const cat = { ...comp.categories[catIndex], models: [...comp.categories[catIndex].models] };
    if (toIndex < 0 || toIndex >= cat.models.length) return;
    const [moved] = cat.models.splice(fromIndex, 1);
    cat.models.splice(toIndex, 0, moved);
    comp.categories[catIndex] = cat;
    nextTree[compIndex] = comp;
    setModalCompanyTree(nextTree);
  };

  // --- Category Mode Movement Helpers ---
  const moveCategory = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= modalCategoryTree.length) return;
    const next = [...modalCategoryTree];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setModalCategoryTree(next);
  };

  const moveModelInCategory = (catIndex: number, fromIndex: number, toIndex: number) => {
    const next = [...modalCategoryTree];
    const cat = { ...next[catIndex], models: [...next[catIndex].models] };
    if (toIndex < 0 || toIndex >= cat.models.length) return;
    const [moved] = cat.models.splice(fromIndex, 1);
    cat.models.splice(toIndex, 0, moved);
    next[catIndex] = cat;
    setModalCategoryTree(next);
  };

  // --- Accordion Toggle Helpers ---
  const toggleCompanyAccordion = (compName: string) => {
    setExpandedCompanies((prev) => ({ ...prev, [compName]: !prev[compName] }));
  };

  const toggleCompanyCategoryAccordion = (compName: string, catName: string) => {
    const key = `${compName}___${catName}`;
    setExpandedCompanyCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCategoryAccordion = (catName: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catName]: !prev[catName] }));
  };

  const toggleAllCompanies = (expand: boolean) => {
    const expComp: Record<string, boolean> = {};
    const expCat: Record<string, boolean> = {};
    modalCompanyTree.forEach((c) => {
      expComp[c.companyName] = expand;
      c.categories.forEach((cat) => {
        expCat[`${c.companyName}___${cat.categoryName}`] = expand;
      });
    });
    setExpandedCompanies(expComp);
    setExpandedCompanyCategories(expCat);
  };

  const toggleAllCategories = (expand: boolean) => {
    const expCat: Record<string, boolean> = {};
    modalCategoryTree.forEach((c) => {
      expCat[c.categoryName] = expand;
    });
    setExpandedCategories(expCat);
  };

  const handleSaveModelOrder = async () => {
    try {
      setIsSavingOrder(true);

      let finalOrder: string[] = [];

      if (arrangeMode === 'company') {
        modalCompanyTree.forEach((comp) => {
          comp.categories.forEach((cat) => {
            cat.models.forEach((mId) => {
              if (!finalOrder.includes(mId)) finalOrder.push(mId);
            });
          });
        });
      } else if (arrangeMode === 'category') {
        modalCategoryTree.forEach((cat) => {
          cat.models.forEach((mId) => {
            if (!finalOrder.includes(mId)) finalOrder.push(mId);
          });
        });
      } else {
        finalOrder = [...modalModelOrder];
      }

      // Append any unassigned products
      products.forEach((p) => {
        if (!finalOrder.includes(p.model_id)) finalOrder.push(p.model_id);
      });

      const res = await fetch('/api/products/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: finalOrder, mode: arrangeMode }),
      });

      if (!res.ok) {
        throw new Error('Failed to save order on server');
      }

      localStorage.setItem('app_custom_model_order', JSON.stringify(finalOrder));
      localStorage.setItem('app_custom_model_order_mode', arrangeMode);
      setCustomModelOrder(finalOrder);
      setSortField('custom');
      setIsRowModalOpen(false);

      const modeTitle =
        arrangeMode === 'company'
          ? 'Arrangement by Company'
          : arrangeMode === 'category'
          ? 'Arrangement by Category'
          : 'Custom model arrangement';

      setSuccessToast(`${modeTitle} saved permanently!`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch {
      let finalOrder: string[] = [];
      if (arrangeMode === 'company') {
        modalCompanyTree.forEach((comp) => {
          comp.categories.forEach((cat) => {
            cat.models.forEach((mId) => {
              if (!finalOrder.includes(mId)) finalOrder.push(mId);
            });
          });
        });
      } else if (arrangeMode === 'category') {
        modalCategoryTree.forEach((cat) => {
          cat.models.forEach((mId) => {
            if (!finalOrder.includes(mId)) finalOrder.push(mId);
          });
        });
      } else {
        finalOrder = [...modalModelOrder];
      }
      products.forEach((p) => {
        if (!finalOrder.includes(p.model_id)) finalOrder.push(p.model_id);
      });

      localStorage.setItem('app_custom_model_order', JSON.stringify(finalOrder));
      localStorage.setItem('app_custom_model_order_mode', arrangeMode);
      setCustomModelOrder(finalOrder);
      setSortField('custom');
      setIsRowModalOpen(false);
      setSuccessToast('Product row arrangement saved locally!');
      setTimeout(() => setSuccessToast(null), 3500);
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleResetToDbDefaultOrder = async () => {
    try {
      setIsSavingOrder(true);
      await fetch('/api/products/order', { method: 'DELETE' }).catch(() => {});
      localStorage.removeItem('app_custom_model_order');
      localStorage.removeItem('app_custom_model_order_mode');
      localStorage.removeItem('legacy_custom_model_order');
      localStorage.removeItem('legacy_custom_model_order_mode');
      setCustomModelOrder([]);
      setSortField('db_default');
      setIsRowModalOpen(false);
      setSuccessToast('Row order reset to database default (product_master)!');
      setTimeout(() => setSuccessToast(null), 3500);
    } catch {
      localStorage.removeItem('app_custom_model_order');
      localStorage.removeItem('app_custom_model_order_mode');
      localStorage.removeItem('legacy_custom_model_order');
      localStorage.removeItem('legacy_custom_model_order_mode');
      setCustomModelOrder([]);
      setSortField('db_default');
      setIsRowModalOpen(false);
    } finally {
      setIsSavingOrder(false);
    }
  };

  // --- Status Toggle Click -> Open Confirmation Modal ---
  const handleInitiateStatusToggle = (product: ProductItem) => {
    const isCurrentlyActive = (product.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
    const targetStatus = isCurrentlyActive ? 'INACTIVE' : 'ACTIVE';

    setConfirmModal({
      isOpen: true,
      product,
      nextStatus: targetStatus,
      isUpdating: false,
    });
  };

  // --- Confirm Status Change ---
  const handleConfirmStatusChange = async () => {
    if (!confirmModal.product) return;

    try {
      setConfirmModal((prev) => ({ ...prev, isUpdating: true }));

      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: confirmModal.product.model_id,
          status: confirmModal.nextStatus,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update product status');
      }

      setProducts((prev) =>
        prev.map((p) =>
          p.model_id === confirmModal.product?.model_id
            ? { ...p, status: confirmModal.nextStatus }
            : p
        )
      );

      setSuccessToast(
        `Model ${confirmModal.product.model_id} marked as ${confirmModal.nextStatus}.`
      );
      setTimeout(() => setSuccessToast(null), 3500);
      setConfirmModal({ isOpen: false, product: null, nextStatus: 'INACTIVE', isUpdating: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      alert(msg);
      setConfirmModal((prev) => ({ ...prev, isUpdating: false }));
    }
  };

  // --- Handle Add Product Form Submission ---
  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanModel = formModelId.trim().toUpperCase();
    if (!cleanModel) {
      setFormError('Model ID is required.');
      return;
    }

    const qtyNum = parseInt(formQty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setFormError('Initial Quantity must be greater than 0.');
      return;
    }

    if (!formToLocation) {
      setFormError('Please select an intake facility location.');
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        model_id: cleanModel,
        model_name: (formModelName.trim() || cleanModel),
        category: formCategory.trim() || null,
        company: formCompany.trim() || null,
        to_location: formToLocation,
        qty: qtyNum,
        remarks: formRemarks.trim() || 'Initial Product Intake',
        entry_by: profile?.employee_id || 'VI0001',
        status: 'ACTIVE',
      };

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create product and intake entry.');
      }

      // Reset form
      setFormModelId('');
      setFormModelName('');
      setFormCategory('');
      setFormCompany('');
      setFormQty('1');
      setFormRemarks('Initial Product Intake');
      setIsAddModalOpen(false);

      setSuccessToast(`Product ${cleanModel} created & ${qtyNum} units entered into ledger!`);
      setTimeout(() => setSuccessToast(null), 4000);

      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating product';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Open Edit Product Modal ---
  const handleOpenEdit = (p: ProductItem) => {
    setEditingProduct(p);
    setEditModelName(p.model_name || p.model_id);
    setEditCategory(p.category && p.category !== 'nan' ? p.category : '');
    setEditCompany(p.company && p.company !== 'nan' ? p.company : '');
    setEditStatus((p.status || 'ACTIVE').toUpperCase() as 'ACTIVE' | 'INACTIVE');
    setEditError(null);
    setIsEditModalOpen(true);
  };

  // --- Submit Edit Product ---
  const handleEditProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setEditError(null);

    try {
      setIsSubmittingEdit(true);
      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: editingProduct.model_id,
          model_name: editModelName.trim(),
          category: editCategory.trim() || null,
          company: editCompany.trim() || null,
          status: editStatus,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update product');
      }

      setProducts((prev) =>
        prev.map((item) =>
          item.model_id === editingProduct.model_id
            ? {
                ...item,
                model_name: editModelName.trim(),
                category: editCategory.trim() || null,
                company: editCompany.trim() || null,
                status: editStatus,
              }
            : item
        )
      );

      setIsEditModalOpen(false);
      setSuccessToast(`Product ${editingProduct.model_id} updated successfully!`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating product';
      setEditError(msg);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setSelectedCompany('ALL');
    setSelectedCategory('ALL');
    setSortField(customModelOrder.length > 0 ? 'custom' : 'db_default');
    setSortDirection('asc');
    setCurrentPage(1);
  };

  const isSortModified =
    (sortField !== 'custom' && sortField !== 'db_default') ||
    sortDirection !== 'asc';

  const hasActiveFilters =
    searchQuery !== '' ||
    statusFilter !== 'ALL' ||
    selectedCompany !== 'ALL' ||
    selectedCategory !== 'ALL' ||
    isSortModified;

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider">Total Models</span>
            <Package className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
            {metrics.total}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">Active</span>
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

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Categories</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {metrics.categories}
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* CONTROLS BAR: SEARCH, FILTERS, ADD PRODUCT BUTTON    */}
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
              placeholder="Search model ID, category, company..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all"
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
              title="Refresh Product List"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-500' : ''}`} />
            </button>

            <button
              onClick={handleOpenRowModal}
              type="button"
              className={`px-3.5 py-2.5 border rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                customModelOrder.length > 0
                  ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-2xs'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              title="Arrange Rows (Custom Admin Order)"
            >
              <ListOrdered className="w-4 h-4 text-amber-600" />
              <span>Arrange Rows</span>
              {customModelOrder.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
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
              onClick={() => setIsAddModalOpen(true)}
              type="button"
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add New Product</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          
          {/* Status Filter */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>

          {/* Company Filter */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
              Company
            </label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
            >
              <option value="ALL">All Companies</option>
              {companyOptions.map((comp) => (
                <option key={comp} value={comp}>
                  {comp}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden truncate"
            >
              <option value="ALL">All Categories</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Sorting */}
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
              Sort By
            </label>
            <select
              value={`${sortField}-${sortDirection}`}
              onChange={(e) => {
                const [f, d] = e.target.value.split('-');
                setSortField(f as 'custom' | 'db_default' | 'model_id' | 'entry_time');
                setSortDirection(d as 'asc' | 'desc');
              }}
              className="w-full py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
            >
              {customModelOrder.length > 0 && (
                <option value="custom-asc">Custom Order (Admin Arranged)</option>
              )}
              <option value="db_default-asc">Database Default (product_master)</option>
              <option value="model_id-asc">Model ID (A → Z)</option>
              <option value="model_id-desc">Model ID (Z → A)</option>
              <option value="entry_time-desc">Added Date (Newest)</option>
              <option value="entry_time-asc">Added Date (Oldest)</option>
            </select>
          </div>

        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* PRODUCTS TABLE                                       */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        
        {/* Bounded Scrollable Table Container with Sticky Headers */}
        <div className="w-full max-h-[calc(100vh-280px)] min-h-[440px] overflow-auto relative">
          
          {isLoading && (
            <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex flex-col items-center justify-center z-30 gap-3 min-h-[300px]">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Loading product catalogue...
              </p>
            </div>
          )}

          <table className="w-full min-w-[950px] text-left border-collapse relative">
            <thead>
              <tr className="bg-slate-100 text-slate-800 text-xs uppercase font-extrabold tracking-wider">
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[200px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  MODEL ID
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[130px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  COMPANY
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[280px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  CATEGORY
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[140px] text-center z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  STATUS
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[140px] text-right z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  ADDED DATE
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[80px] text-center z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  ACTIONS
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-800">
              {paginatedProducts.length > 0 ? (
                paginatedProducts.map((p) => {
                  const isActive = (p.status || 'ACTIVE').toUpperCase() === 'ACTIVE';

                  return (
                    <tr key={p.model_id} className="hover:bg-amber-50/40 transition-colors">
                      
                      {/* Model ID */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-black text-slate-950">
                            {p.model_id}
                          </span>
                          {p.model_name && p.model_name !== p.model_id && (
                            <span className="text-xs text-slate-500 font-medium">
                              ({p.model_name})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Company */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs font-bold text-slate-700">
                        {p.company && p.company !== 'nan' ? (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-900 border border-slate-200 rounded-md font-extrabold text-[11px]">
                            {p.company}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 text-xs font-medium text-slate-600">
                        <span className="line-clamp-1 truncate max-w-[320px]" title={p.category || ''}>
                          {p.category || <span className="text-slate-300">—</span>}
                        </span>
                      </td>

                      {/* Status Toggle Switch with Confirmation Modal trigger */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleInitiateStatusToggle(p)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border transition-all cursor-pointer ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                          }`}
                          title={`Click to change status (Confirmation required)`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isActive ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span>{isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                        </button>
                      </td>

                      {/* Added Date */}
                      <td className="py-3 px-4 text-right whitespace-nowrap text-xs font-semibold text-slate-600">
                        {p.entry_time ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(p.entry_time).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Edit Action Button */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Product"
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
                      <Package className="w-10 h-10 text-slate-300 stroke-1" />
                      <p className="text-sm font-bold text-slate-700">No products match your criteria</p>
                      <p className="text-xs text-slate-400">Try changing your search query or filters.</p>
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
              {filteredProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-slate-900 font-bold">
              {Math.min(currentPage * pageSize, filteredProducts.length)}
            </strong>{' '}
            of <strong className="text-slate-900 font-bold">{filteredProducts.length}</strong> products
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
      {/* ⚠️ STATUS TOGGLE CONFIRMATION MODAL                   */}
      {/* ==================================================== */}
      {confirmModal.isOpen && confirmModal.product && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-3 rounded-2xl shrink-0 ${
                  confirmModal.nextStatus === 'INACTIVE'
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-slate-950">
                  {confirmModal.nextStatus === 'INACTIVE'
                    ? 'Deactivate Product?'
                    : 'Activate Product?'}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Are you sure you want to change the status of{' '}
                  <strong className="font-mono text-slate-950">{confirmModal.product.model_id}</strong> to{' '}
                  <strong className={confirmModal.nextStatus === 'INACTIVE' ? 'text-rose-600' : 'text-emerald-600'}>
                    {confirmModal.nextStatus}
                  </strong>
                  ?
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-600">
              <p>
                <span className="font-bold text-slate-700">Category:</span> {confirmModal.product.category || '—'}
              </p>
              <p>
                <span className="font-bold text-slate-700">Company:</span> {confirmModal.product.company || '—'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal({ isOpen: false, product: null, nextStatus: 'INACTIVE', isUpdating: false })}
                disabled={confirmModal.isUpdating}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
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
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 🌟 ADD NEW PRODUCT & INTAKE MODAL                    */}
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
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-slate-950">Add New Product</h3>
                  <p className="text-[11px] font-bold text-slate-800">
                    Registers product & creates initial ENTRY in stock ledger
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
            <form onSubmit={handleAddProductSubmit} className="p-6 overflow-y-auto space-y-4">
              
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Model ID */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Model ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formModelId}
                  onChange={(e) => setFormModelId(e.target.value.toUpperCase())}
                  placeholder="e.g. GN-5000"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden uppercase"
                />
              </div>

              {/* Model Name & Company Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Model Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={formModelName}
                    onChange={(e) => setFormModelName(e.target.value)}
                    placeholder="Defaults to Model ID"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Company
                  </label>
                  <input
                    type="text"
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="e.g. GN-Series Petrol Generator (Open-Type)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Initial Intake Section */}
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-900">
                  <Building className="w-4 h-4 text-amber-600" />
                  <span>Initial Stock Intake (Auto-Ledger Entry)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Intake Location */}
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                      Intake Facility <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formToLocation}
                      onChange={(e) => setFormToLocation(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                    >
                      {activeLocations.map((loc) => (
                        <option key={loc.location_id} value={loc.location_id}>
                          {loc.location_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                      Initial Quantity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formQty}
                      onChange={(e) => setFormQty(e.target.value)}
                      placeholder="e.g. 50"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Intake Remarks
                  </label>
                  <input
                    type="text"
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                    placeholder="Initial Intake Remarks"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>
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
                      <span>Creating Product...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save & Record Intake</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 🌟 ARRANGE ROWS MODAL (Admin Custom / Company / Category) */}
      {/* ==================================================== */}
      {isRowModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-slate-950 text-amber-400 rounded-xl shadow-xs">
                  {arrangeMode === 'company' ? (
                    <Building className="w-5 h-5" />
                  ) : arrangeMode === 'category' ? (
                    <Layers className="w-5 h-5" />
                  ) : (
                    <ListOrdered className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-slate-950">
                    Arrange Product Rows
                  </h3>
                  <p className="text-[11px] font-bold text-slate-800">
                    {arrangeMode === 'company'
                      ? 'Arrange by Company, then Categories & Models'
                      : arrangeMode === 'category'
                      ? 'Arrange by Category, then Models'
                      : 'Direct Custom Model Sequence'}
                    {' '}• Persists for all users
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRowModalOpen(false)}
                type="button"
                className="text-slate-900 hover:text-slate-950 p-1.5 rounded-lg hover:bg-black/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switch Tabs */}
            <div className="bg-slate-100 px-6 py-2.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setArrangeMode('custom')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    arrangeMode === 'custom'
                      ? 'bg-slate-950 text-amber-400 font-black shadow-xs'
                      : 'text-slate-600 hover:text-slate-950 font-bold hover:bg-white/60'
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>Custom Arrange</span>
                </button>

                <button
                  type="button"
                  onClick={() => setArrangeMode('company')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    arrangeMode === 'company'
                      ? 'bg-slate-950 text-amber-400 font-black shadow-xs'
                      : 'text-slate-600 hover:text-slate-950 font-bold hover:bg-white/60'
                  }`}
                >
                  <Building className="w-3.5 h-3.5" />
                  <span>Arrange by Company</span>
                </button>

                <button
                  type="button"
                  onClick={() => setArrangeMode('category')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                    arrangeMode === 'category'
                      ? 'bg-slate-950 text-amber-400 font-black shadow-xs'
                      : 'text-slate-600 hover:text-slate-950 font-bold hover:bg-white/60'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Arrange by Category</span>
                </button>
              </div>

              {/* Quick Expand / Collapse for hierarchical modes */}
              {arrangeMode !== 'custom' && (
                <div className="hidden sm:flex items-center gap-1 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      if (arrangeMode === 'company') toggleAllCompanies(true);
                      else toggleAllCategories(true);
                    }}
                    className="px-2 py-1 text-slate-600 hover:text-slate-950 hover:bg-white rounded-md transition-colors cursor-pointer"
                  >
                    Expand All
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (arrangeMode === 'company') toggleAllCompanies(false);
                      else toggleAllCategories(false);
                    }}
                    className="px-2 py-1 text-slate-600 hover:text-slate-950 hover:bg-white rounded-md transition-colors cursor-pointer"
                  >
                    Collapse All
                  </button>
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-3.5 flex-1">
              {/* Instructions banner */}
              <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-700 font-semibold">
                  {arrangeMode === 'company'
                    ? 'Arrange the sequence of Companies, then expand to arrange Categories and Models inside each company.'
                    : arrangeMode === 'category'
                    ? 'Arrange the sequence of Categories, then expand to arrange Models inside each category.'
                    : 'Reorder individual models directly. Drag items by grip or use the arrow buttons to position models.'}
                </span>
                <span className="font-bold text-slate-900 shrink-0 font-mono text-[11px] px-2 py-0.5 bg-white border border-amber-200 rounded-md">
                  {arrangeMode === 'company'
                    ? `${modalCompanyTree.length} companies`
                    : arrangeMode === 'category'
                    ? `${modalCategoryTree.length} categories`
                    : `${modalModelOrder.length} models`}
                </span>
              </div>

              {/* Search Inside Modal */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={rowSearchQuery}
                  onChange={(e) => setRowSearchQuery(e.target.value)}
                  placeholder={
                    arrangeMode === 'company'
                      ? 'Filter companies, categories, or models...'
                      : arrangeMode === 'category'
                      ? 'Filter categories or models...'
                      : 'Filter models in arrangement list...'
                  }
                  className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                />
                {rowSearchQuery && (
                  <button
                    onClick={() => setRowSearchQuery('')}
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* ==================================================== */}
              {/* MODE 1: CUSTOM ARRANGE (FLAT MODEL LIST)            */}
              {/* ==================================================== */}
              {arrangeMode === 'custom' && (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-[380px] overflow-y-auto bg-white shadow-inner">
                  {modalModelOrder
                    .map((modelId, actualIndex) => ({ modelId, actualIndex }))
                    .filter(({ modelId }) => {
                      if (!rowSearchQuery.trim()) return true;
                      const q = rowSearchQuery.toLowerCase().trim();
                      const meta = productMetaMap.get(modelId);
                      return (
                        modelId.toLowerCase().includes(q) ||
                        (meta?.model_name && meta.model_name.toLowerCase().includes(q)) ||
                        (meta?.category && meta.category.toLowerCase().includes(q)) ||
                        (meta?.company && meta.company.toLowerCase().includes(q))
                      );
                    })
                    .map(({ modelId, actualIndex }) => {
                      const meta = productMetaMap.get(modelId);
                      const isDragging = draggedModelIndex === actualIndex;
                      const isDragOver = dragOverModelIndex === actualIndex;

                      return (
                        <div
                          key={modelId}
                          draggable
                          onDragStart={(e) => handleDragStart(e, actualIndex)}
                          onDragOver={(e) => handleDragOver(e, actualIndex)}
                          onDrop={(e) => handleDrop(e, actualIndex)}
                          className={`flex items-center justify-between px-3.5 py-2.5 transition-all select-none ${
                            isDragging
                              ? 'opacity-30 bg-amber-100 border-2 border-dashed border-amber-400'
                              : isDragOver
                              ? 'bg-amber-50/80 border-t-2 border-amber-500'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 p-1"
                              title="Drag to reorder"
                            >
                              <GripVertical className="w-4 h-4" />
                            </button>

                            <span className="font-mono text-[11px] font-black text-slate-400 w-7 shrink-0 text-right">
                              #{actualIndex + 1}
                            </span>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-black text-slate-900 block truncate">
                                  {modelId}
                                </span>
                                {meta?.company && meta.company !== 'nan' && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded text-slate-600">
                                    {meta.company}
                                  </span>
                                )}
                              </div>
                              {(meta?.model_name || meta?.category) && (
                                <span className="text-[11px] text-slate-500 truncate block">
                                  {meta.model_name || meta.category}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Movement Buttons */}
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            <button
                              type="button"
                              onClick={() => moveModelToTop(actualIndex)}
                              disabled={actualIndex === 0}
                              className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded disabled:opacity-20 disabled:pointer-events-none transition-colors"
                              title="Move to Top"
                            >
                              <ChevronsUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveModelItem(actualIndex, actualIndex - 1)}
                              disabled={actualIndex === 0}
                              className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded disabled:opacity-20 disabled:pointer-events-none transition-colors"
                              title="Move Up"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveModelItem(actualIndex, actualIndex + 1)}
                              disabled={actualIndex === modalModelOrder.length - 1}
                              className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded disabled:opacity-20 disabled:pointer-events-none transition-colors"
                              title="Move Down"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveModelToBottom(actualIndex)}
                              disabled={actualIndex === modalModelOrder.length - 1}
                              className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded disabled:opacity-20 disabled:pointer-events-none transition-colors"
                              title="Move to Bottom"
                            >
                              <ChevronsDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* ==================================================== */}
              {/* MODE 2: ARRANGE BY COMPANY                           */}
              {/* ==================================================== */}
              {arrangeMode === 'company' && (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {modalCompanyTree
                    .map((comp, compIdx) => ({ comp, compIdx }))
                    .filter(({ comp }) => {
                      if (!rowSearchQuery.trim()) return true;
                      const q = rowSearchQuery.toLowerCase().trim();
                      if (comp.companyName.toLowerCase().includes(q)) return true;
                      return comp.categories.some(
                        (cat) =>
                          cat.categoryName.toLowerCase().includes(q) ||
                          cat.models.some((m) => {
                            const meta = productMetaMap.get(m);
                            return (
                              m.toLowerCase().includes(q) ||
                              (meta?.model_name && meta.model_name.toLowerCase().includes(q))
                            );
                          })
                      );
                    })
                    .map(({ comp, compIdx }) => {
                      const isCompExpanded =
                        !!expandedCompanies[comp.companyName] || !!rowSearchQuery.trim();
                      const totalCompModels = comp.categories.reduce(
                        (acc, c) => acc + c.models.length,
                        0
                      );

                      return (
                        <div
                          key={comp.companyName}
                          className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-xs"
                        >
                          {/* Company Row Header */}
                          <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100/90 border-b border-slate-200">
                            <div
                              onClick={() => toggleCompanyAccordion(comp.companyName)}
                              className="flex items-center gap-2.5 cursor-pointer select-none min-w-0 flex-1"
                            >
                              <span className="font-mono text-[11px] font-black text-slate-500 w-6">
                                #{compIdx + 1}
                              </span>
                              <Building className="w-4 h-4 text-amber-600 shrink-0" />
                              <span className="text-xs font-black text-slate-900 truncate">
                                {comp.companyName}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md shrink-0">
                                {comp.categories.length} categories • {totalCompModels} models
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              {/* Reorder Company Buttons */}
                              <button
                                type="button"
                                onClick={() => moveCompany(compIdx, 0)}
                                disabled={compIdx === 0}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded disabled:opacity-20 transition-colors"
                                title="Move Company to Top"
                              >
                                <ChevronsUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCompany(compIdx, compIdx - 1)}
                                disabled={compIdx === 0}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded disabled:opacity-20 transition-colors"
                                title="Move Company Up"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCompany(compIdx, compIdx + 1)}
                                disabled={compIdx === modalCompanyTree.length - 1}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded disabled:opacity-20 transition-colors"
                                title="Move Company Down"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCompany(compIdx, modalCompanyTree.length - 1)}
                                disabled={compIdx === modalCompanyTree.length - 1}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded disabled:opacity-20 transition-colors"
                                title="Move Company to Bottom"
                              >
                                <ChevronsDown className="w-3.5 h-3.5" />
                              </button>

                              {/* Expand Toggle */}
                              <button
                                type="button"
                                onClick={() => toggleCompanyAccordion(comp.companyName)}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded ml-1"
                              >
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform duration-150 ${
                                    isCompExpanded ? 'rotate-180 text-amber-600' : ''
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {/* Nested Categories in this Company */}
                          {isCompExpanded && (
                            <div className="p-3 bg-slate-50/50 space-y-2.5">
                              {comp.categories.map((cat, catIdx) => {
                                const catKey = `${comp.companyName}___${cat.categoryName}`;
                                const isCatExpanded =
                                  !!expandedCompanyCategories[catKey] || !!rowSearchQuery.trim();

                                return (
                                  <div
                                    key={cat.categoryName}
                                    className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs"
                                  >
                                    {/* Category Header */}
                                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                                      <div
                                        onClick={() =>
                                          toggleCompanyCategoryAccordion(
                                            comp.companyName,
                                            cat.categoryName
                                          )
                                        }
                                        className="flex items-center gap-2 cursor-pointer select-none min-w-0 flex-1"
                                      >
                                        <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                        <span className="text-xs font-extrabold text-slate-800 truncate">
                                          {cat.categoryName}
                                        </span>
                                        <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded">
                                          {cat.models.length} models
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0 ml-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            moveCategoryInCompany(compIdx, catIdx, catIdx - 1)
                                          }
                                          disabled={catIdx === 0}
                                          className="p-1 text-slate-400 hover:text-slate-900 rounded disabled:opacity-20"
                                          title="Move Category Up in Company"
                                        >
                                          <ChevronUp className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            moveCategoryInCompany(compIdx, catIdx, catIdx + 1)
                                          }
                                          disabled={catIdx === comp.categories.length - 1}
                                          className="p-1 text-slate-400 hover:text-slate-900 rounded disabled:opacity-20"
                                          title="Move Category Down in Company"
                                        >
                                          <ChevronDown className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleCompanyCategoryAccordion(
                                              comp.companyName,
                                              cat.categoryName
                                            )
                                          }
                                          className="p-1 text-slate-400 hover:text-slate-900 rounded"
                                        >
                                          <ChevronDown
                                            className={`w-3.5 h-3.5 transition-transform duration-150 ${
                                              isCatExpanded ? 'rotate-180 text-amber-600' : ''
                                            }`}
                                          />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Models inside this Category & Company */}
                                    {isCatExpanded && (
                                      <div className="divide-y divide-slate-100 bg-white">
                                        {cat.models.map((modelId, modelIdx) => {
                                          const meta = productMetaMap.get(modelId);

                                          return (
                                            <div
                                              key={modelId}
                                              className="flex items-center justify-between px-3.5 py-1.5 hover:bg-amber-50/40 text-xs"
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-mono text-[10px] text-slate-400 w-5">
                                                  #{modelIdx + 1}
                                                </span>
                                                <span className="font-mono font-bold text-slate-900 truncate">
                                                  {modelId}
                                                </span>
                                                {meta?.model_name && (
                                                  <span className="text-[11px] text-slate-500 truncate">
                                                    • {meta.model_name}
                                                  </span>
                                                )}
                                              </div>

                                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    moveModelInCompanyCategory(
                                                      compIdx,
                                                      catIdx,
                                                      modelIdx,
                                                      modelIdx - 1
                                                    )
                                                  }
                                                  disabled={modelIdx === 0}
                                                  className="p-1 text-slate-400 hover:text-slate-900 rounded disabled:opacity-20"
                                                  title="Move Model Up"
                                                >
                                                  <ChevronUp className="w-3 h-3" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    moveModelInCompanyCategory(
                                                      compIdx,
                                                      catIdx,
                                                      modelIdx,
                                                      modelIdx + 1
                                                    )
                                                  }
                                                  disabled={modelIdx === cat.models.length - 1}
                                                  className="p-1 text-slate-400 hover:text-slate-900 rounded disabled:opacity-20"
                                                  title="Move Model Down"
                                                >
                                                  <ChevronDown className="w-3 h-3" />
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {/* ==================================================== */}
              {/* MODE 3: ARRANGE BY CATEGORY                          */}
              {/* ==================================================== */}
              {arrangeMode === 'category' && (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {modalCategoryTree
                    .map((cat, catIdx) => ({ cat, catIdx }))
                    .filter(({ cat }) => {
                      if (!rowSearchQuery.trim()) return true;
                      const q = rowSearchQuery.toLowerCase().trim();
                      if (cat.categoryName.toLowerCase().includes(q)) return true;
                      return cat.models.some((m) => {
                        const meta = productMetaMap.get(m);
                        return (
                          m.toLowerCase().includes(q) ||
                          (meta?.model_name && meta.model_name.toLowerCase().includes(q)) ||
                          (meta?.company && meta.company.toLowerCase().includes(q))
                        );
                      });
                    })
                    .map(({ cat, catIdx }) => {
                      const isExpanded =
                        !!expandedCategories[cat.categoryName] || !!rowSearchQuery.trim();

                      return (
                        <div
                          key={cat.categoryName}
                          className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-xs"
                        >
                          {/* Category Header */}
                          <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-100/90 border-b border-slate-200">
                            <div
                              onClick={() => toggleCategoryAccordion(cat.categoryName)}
                              className="flex items-center gap-2.5 cursor-pointer select-none min-w-0 flex-1"
                            >
                              <span className="font-mono text-[11px] font-black text-slate-500 w-6">
                                #{catIdx + 1}
                              </span>
                              <Layers className="w-4 h-4 text-amber-600 shrink-0" />
                              <span className="text-xs font-black text-slate-900 truncate">
                                {cat.categoryName}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md shrink-0">
                                {cat.models.length} models
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              {/* Reorder Category Buttons */}
                              <button
                                type="button"
                                onClick={() => moveCategory(catIdx, 0)}
                                disabled={catIdx === 0}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded disabled:opacity-20 transition-colors"
                                title="Move Category to Top"
                              >
                                <ChevronsUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCategory(catIdx, catIdx - 1)}
                                disabled={catIdx === 0}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded disabled:opacity-20 transition-colors"
                                title="Move Category Up"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCategory(catIdx, catIdx + 1)}
                                disabled={catIdx === modalCategoryTree.length - 1}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded disabled:opacity-20 transition-colors"
                                title="Move Category Down"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCategory(catIdx, modalCategoryTree.length - 1)}
                                disabled={catIdx === modalCategoryTree.length - 1}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded disabled:opacity-20 transition-colors"
                                title="Move Category to Bottom"
                              >
                                <ChevronsDown className="w-3.5 h-3.5" />
                              </button>

                              {/* Expand Toggle */}
                              <button
                                type="button"
                                onClick={() => toggleCategoryAccordion(cat.categoryName)}
                                className="p-1 text-slate-500 hover:text-slate-950 hover:bg-white rounded ml-1"
                              >
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform duration-150 ${
                                    isExpanded ? 'rotate-180 text-amber-600' : ''
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {/* Models in this Category */}
                          {isExpanded && (
                            <div className="divide-y divide-slate-100 bg-white p-1">
                              {cat.models.map((modelId, modelIdx) => {
                                const meta = productMetaMap.get(modelId);

                                return (
                                  <div
                                    key={modelId}
                                    className="flex items-center justify-between px-3 py-1.5 hover:bg-amber-50/40 text-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-mono text-[10px] text-slate-400 w-5">
                                        #{modelIdx + 1}
                                      </span>
                                      <span className="font-mono font-bold text-slate-900 truncate">
                                        {modelId}
                                      </span>
                                      {meta?.company && meta.company !== 'nan' && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded text-slate-600 shrink-0">
                                          {meta.company}
                                        </span>
                                      )}
                                      {meta?.model_name && (
                                        <span className="text-[11px] text-slate-500 truncate">
                                          • {meta.model_name}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          moveModelInCategory(catIdx, modelIdx, modelIdx - 1)
                                        }
                                        disabled={modelIdx === 0}
                                        className="p-1 text-slate-400 hover:text-slate-900 rounded disabled:opacity-20"
                                        title="Move Model Up"
                                      >
                                        <ChevronUp className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          moveModelInCategory(catIdx, modelIdx, modelIdx + 1)
                                        }
                                        disabled={modelIdx === cat.models.length - 1}
                                        className="p-1 text-slate-400 hover:text-slate-900 rounded disabled:opacity-20"
                                        title="Move Model Down"
                                      >
                                        <ChevronDown className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-100 bg-slate-50/70">
              <button
                type="button"
                onClick={handleResetToDbDefaultOrder}
                disabled={isSavingOrder}
                className="w-full sm:w-auto px-3.5 py-2 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Reset order to natural database default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Database Default</span>
              </button>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsRowModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveModelOrder}
                  disabled={isSavingOrder}
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSavingOrder ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Order...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>
                        {arrangeMode === 'company'
                          ? 'Save Company Order'
                          : arrangeMode === 'category'
                          ? 'Save Category Order'
                          : 'Save Custom Order'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* ✏️ EDIT PRODUCT MODAL (Just like Staff Register)     */}
      {/* ==================================================== */}
      {isEditModalOpen && editingProduct && (
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
                  <h3 className="text-base font-black tracking-tight">Edit Product Model</h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    {editingProduct.model_id}
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
            <form onSubmit={handleEditProductSubmit} className="p-6 overflow-y-auto space-y-4">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Model ID (Read-only Badge) */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Model ID
                </label>
                <div className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-black text-slate-700 select-all">
                  {editingProduct.model_id}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Unique primary key cannot be changed.</p>
              </div>

              {/* Model Display Name */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Model Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editModelName}
                  onChange={(e) => setEditModelName(e.target.value)}
                  required
                  placeholder="e.g. GH-3500 Red"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Company */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Company / Brand
                </label>
                <input
                  type="text"
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  placeholder="e.g. Acme, Sogo, etc."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="e.g. Sewing Machine, Motor, etc."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
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
                  <option value="ACTIVE">ACTIVE (In Stock / Catalogue)</option>
                  <option value="INACTIVE">INACTIVE (Discontinued / Hidden)</option>
                </select>
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
      )}

    </div>
  );
};

export default ProductView;
