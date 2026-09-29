'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  PlusCircle,
  RefreshCw,
  X,
  Check,
  AlertCircle,
  Edit2,
  Clock,
  Phone,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  Calendar,
  Key,
} from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EmployeeRecord {
  employee_id: string;
  employee_name: string;
  role?: string | null;
  whatsapp_number?: string | null;
  date_of_employment?: string | null;
  date_of_relief?: string | null;
  employment_status: 'ACTIVE' | 'SUSPENDED' | 'RELIEVED' | string;
  username?: string | null;
  auth_user_id?: string | null;
}

interface EmployeeViewProps {
  supabase?: SupabaseClient;
  className?: string;
}

const STATUS_BADGES: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  ACTIVE: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    dot: 'bg-emerald-500',
  },
  SUSPENDED: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-300',
    dot: 'bg-amber-500',
  },
  RELIEVED: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-300',
    dot: 'bg-rose-500',
  },
};

export const EmployeeView: React.FC<EmployeeViewProps> = ({
  supabase,
  className = '',
}) => {
  // --- Data States ---
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // --- Filter States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // --- Add Modal States ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add Form Fields
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('STAFF');
  const [formWhatsapp, setFormWhatsapp] = useState('');
  const [formEmpDate, setFormEmpDate] = useState(new Date().toISOString().split('T')[0]);
  const [previewEmpId, setPreviewEmpId] = useState('VI/EMP/2');

  // --- Edit Modal States ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);

  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('STAFF');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'RELIEVED'>('ACTIVE');
  const [editReliefDate, setEditReliefDate] = useState('');

  // --- Fetch Employees ---
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const res = await fetch('/api/employees');
      if (!res.ok) {
        throw new Error(`Failed to fetch employees: status ${res.status}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const list: EmployeeRecord[] = data.employees || [];
      setEmployees(list);

      // Compute Next Preview Employee ID with standardized unpadded schema: VI/EMP/X
      let maxId = 0;
      list.forEach((e) => {
        const match = String(e.employee_id || '').match(/(\d+)$/);
        if (match) {
          const val = parseInt(match[1], 10);
          if (!isNaN(val) && val > maxId) maxId = val;
        }
      });
      setPreviewEmpId(`VI/EMP/${maxId + 1}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading staff register';
      console.error('Error fetching employees:', err);
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Filtered Employees ---
  const filteredEmployees = useMemo(() => {
    let result = [...employees];

    if (statusFilter !== 'ALL') {
      result = result.filter(
        (e) => (e.employment_status || 'ACTIVE').toUpperCase() === statusFilter
      );
    }

    if (roleFilter !== 'ALL') {
      result = result.filter(
        (e) => (e.role || 'STAFF').toUpperCase() === roleFilter
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.employee_id.toLowerCase().includes(q) ||
          e.employee_name.toLowerCase().includes(q) ||
          (e.username && e.username.toLowerCase().includes(q)) ||
          (e.whatsapp_number && e.whatsapp_number.includes(q))
      );
    }

    return result;
  }, [employees, statusFilter, roleFilter, searchQuery]);

  // --- Metrics ---
  const metrics = useMemo(() => {
    let active = 0;
    let suspended = 0;
    let relieved = 0;

    employees.forEach((e) => {
      const s = (e.employment_status || 'ACTIVE').toUpperCase();
      if (s === 'ACTIVE') active++;
      else if (s === 'SUSPENDED') suspended++;
      else if (s === 'RELIEVED') relieved++;
    });

    return {
      total: employees.length,
      active,
      suspended,
      relieved,
    };
  }, [employees]);

  // --- Open Edit Modal ---
  const handleOpenEdit = (emp: EmployeeRecord) => {
    setEditingEmployee(emp);
    setEditName(emp.employee_name);
    setEditRole(emp.role || 'STAFF');
    setEditWhatsapp(emp.whatsapp_number || '');
    setEditStatus((emp.employment_status || 'ACTIVE').toUpperCase() as 'ACTIVE' | 'SUSPENDED' | 'RELIEVED');
    setEditReliefDate(emp.date_of_relief || '');
    setEditError(null);
    setIsEditModalOpen(true);
  };

  // --- Submit Add Form ---
  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = formName.trim();
    if (!cleanName) {
      setFormError('Full Name is required.');
      return;
    }

    const cleanWhatsapp = formWhatsapp.trim().replace(/\D/g, '');
    if (formWhatsapp.trim()) {
      if (cleanWhatsapp.length !== 10) {
        setFormError('WhatsApp / Phone Number must be exactly 10 digits and contain only numerical values.');
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const payload = {
        employee_name: cleanName,
        role: formRole,
        whatsapp_number: cleanWhatsapp || null,
        date_of_employment: formEmpDate,
        employment_status: 'ACTIVE',
      };

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to add employee.');
      }

      const data = await res.json();
      setFormName('');
      setFormWhatsapp('');
      setIsAddModalOpen(false);

      setSuccessToast(
        `Staff member "${cleanName}" registered! Username: ${data.username || 'created'}`
      );
      setTimeout(() => setSuccessToast(null), 4000);

      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error adding employee';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Submit Edit Form ---
  const handleEditEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEditError(null);

    const cleanWhatsapp = editWhatsapp.trim().replace(/\D/g, '');
    if (editWhatsapp.trim()) {
      if (cleanWhatsapp.length !== 10) {
        setEditError('WhatsApp / Phone Number must be exactly 10 digits and contain only numerical values.');
        return;
      }
    }

    try {
      setIsEditing(true);

      const payload = {
        employee_id: editingEmployee.employee_id,
        employee_name: editName.trim(),
        role: editRole,
        whatsapp_number: cleanWhatsapp || null,
        employment_status: editStatus,
        date_of_relief: editStatus === 'RELIEVED' ? editReliefDate || new Date().toISOString().split('T')[0] : null,
      };

      const res = await fetch('/api/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update employee details.');
      }

      setIsEditModalOpen(false);
      setEditingEmployee(null);

      setSuccessToast(`Updated profile for ${editName.trim()} successfully.`);
      setTimeout(() => setSuccessToast(null), 3500);

      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating profile';
      setEditError(msg);
    } finally {
      setIsEditing(false);
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider">Total Staff</span>
            <Users className="w-4 h-4 text-amber-500" />
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
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-700">Suspended</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tight">
            {metrics.suspended}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-rose-700">Relieved</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight">
            {metrics.relieved}
          </p>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* CONTROLS BAR: SEARCH, ROLE, STATUS, ADD BUTTON       */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff name, ID, username, phone..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
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
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2.5 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="RELIEVED">RELIEVED</option>
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="py-2.5 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="MANAGER">MANAGER</option>
            <option value="STAFF">STAFF</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={fetchData}
            type="button"
            className="p-2.5 border border-slate-300 text-slate-700 hover:text-slate-950 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            title="Refresh Staff List"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-500' : ''}`} />
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            type="button"
            className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add New Employee</span>
          </button>
        </div>

      </div>

      {/* ---------------------------------------------------- */}
      {/* EMPLOYEE REGISTER TABLE                              */}
      {/* ---------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        
        <div className="w-full max-h-[calc(100vh-280px)] min-h-[440px] overflow-auto relative">
          
          {isLoading && (
            <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex flex-col items-center justify-center z-30 gap-3 min-h-[300px]">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Loading staff register...
              </p>
            </div>
          )}

          <table className="w-full min-w-[950px] text-left border-collapse relative">
            <thead>
              <tr className="bg-slate-100 text-slate-800 text-xs uppercase font-extrabold tracking-wider">
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[170px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  EMPLOYEE ID & USERNAME
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[200px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  STAFF NAME
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[120px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  ROLE
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[140px] z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  WHATSAPP
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[140px] text-center z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  STATUS
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[150px] text-right z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  JOINED
                </th>
                <th scope="col" className="sticky top-0 bg-slate-100 py-3.5 px-4 min-w-[100px] text-center z-20 shadow-[inset_0_-2px_0_#cbd5e1]">
                  ACTION
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => {
                  const sKey = (emp.employment_status || 'ACTIVE').toUpperCase();
                  const cfg = STATUS_BADGES[sKey] || STATUS_BADGES.ACTIVE;

                  return (
                    <tr key={emp.employee_id} className="hover:bg-amber-50/40 transition-colors">
                      
                      {/* ID & Username */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-black text-slate-950">
                            {emp.employee_id}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 font-semibold">
                            @{emp.username || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Name */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-950 text-amber-400 flex items-center justify-center font-black text-xs">
                            {emp.employee_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-black text-slate-950">
                            {emp.employee_name}
                          </span>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-[10px] font-black text-slate-800 uppercase tracking-wider">
                          {emp.role || 'STAFF'}
                        </span>
                      </td>

                      {/* WhatsApp */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs font-semibold text-slate-700">
                        {emp.whatsapp_number ? (
                          <div className="flex items-center gap-1.5 font-mono">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span>{emp.whatsapp_number}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-extrabold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          <span>{sKey}</span>
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td className="py-3 px-4 text-right whitespace-nowrap text-xs font-semibold text-slate-600">
                        {emp.date_of_employment ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{new Date(emp.date_of_employment).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Edit Button */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(emp)}
                          className="p-1.5 text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Staff Member"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>

                    </tr>
                  );
                })
              ) : !isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-10 h-10 text-slate-300 stroke-1" />
                      <p className="text-sm font-bold text-slate-700">No staff members found</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

      </div>

      {/* ==================================================== */}
      {/* 🌟 ADD NEW EMPLOYEE MODAL                            */}
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
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-slate-950">Add Staff Member</h3>
                  <p className="text-[11px] font-bold text-slate-800">
                    Registers employee & provisions dashboard login
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
            <form onSubmit={handleAddEmployeeSubmit} className="p-6 overflow-y-auto space-y-4">
              
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* ID & Auto Credentials Info */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-600">Assigned ID:</span>
                  <span className="font-mono font-black text-slate-950">{previewEmpId}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Username and initial password will be automatically generated (e.g. <span className="font-mono font-bold">RahVIEMP2</span>).
                </p>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Ravi Kumar"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Designation / Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                >
                  <option value="STAFF">STAFF</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              {/* WhatsApp */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  WhatsApp / Phone Number
                </label>
                <input
                  type="tel"
                  value={formWhatsapp}
                  onChange={(e) => setFormWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit number (e.g. 9876543210)"
                  maxLength={10}
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
                <p className="text-[10px] text-slate-400 mt-1">10 numerical digits only</p>
              </div>

              {/* Joining Date */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Date of Employment
                </label>
                <input
                  type="date"
                  value={formEmpDate}
                  onChange={(e) => setFormEmpDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Actions */}
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
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Register Staff</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* ✏️ EDIT EMPLOYEE MODAL                               */}
      {/* ==================================================== */}
      {isEditModalOpen && editingEmployee && (
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
                  <h3 className="text-base font-black tracking-tight">Edit Staff Member</h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    {editingEmployee.employee_id} • @{editingEmployee.username}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                type="button"
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEditEmployeeSubmit} className="p-6 overflow-y-auto space-y-4">
              
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                >
                  <option value="STAFF">STAFF</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              {/* WhatsApp */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  WhatsApp Number
                </label>
                <input
                  type="tel"
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit number (e.g. 9876543210)"
                  maxLength={10}
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                />
                <p className="text-[10px] text-slate-400 mt-1">10 numerical digits only</p>
              </div>

              {/* Employment Status: ACTIVE, SUSPENDED, RELIEVED */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Employment Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'SUSPENDED' | 'RELIEVED')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                >
                  <option value="ACTIVE">ACTIVE (Access Granted)</option>
                  <option value="SUSPENDED">SUSPENDED (Access Blocked)</option>
                  <option value="RELIEVED">RELIEVED (Offboarded)</option>
                </select>
              </div>

              {/* Relief Date if Relieved */}
              {editStatus === 'RELIEVED' && (
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Date of Relief
                  </label>
                  <input
                    type="date"
                    value={editReliefDate}
                    onChange={(e) => setEditReliefDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-400 focus:outline-hidden"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="px-5 py-2 bg-slate-950 hover:bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isEditing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Update Profile</span>
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

export default EmployeeView;
