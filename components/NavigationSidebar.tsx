'use client';

import React, { useState } from 'react';
import {
  Layers,
  ArrowRightLeft,
  Package,
  MapPin,
  Truck,
  Users,
  Pin,
  PinOff,
  ChevronRight,
  Menu,
  X,
  Database,
  Building,
  LogOut,
  Flame,
  History,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export type ActiveView =
  | 'home'
  | 'stock'
  | 'ledger'
  | 'products'
  | 'locations'
  | 'dispatch'
  | 'employees'
  | 'audit';

export interface NavigationSidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  isPinned: boolean;
  onPinChange: (pinned: boolean) => void;
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  activeView,
  onViewChange,
  isPinned,
  onPinChange,
}) => {
  const { profile, logout } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isOpen = isPinned || isHovered || isMobileOpen;

  const navItems = [
    {
      id: 'home' as ActiveView,
      title: 'HOME DASHBOARD',
      subtitle: 'Live command center & KPIs',
      icon: Flame,
    },
    {
      id: 'stock' as ActiveView,
      title: 'CURRENT STOCK',
      subtitle: 'Live multi-location matrix',
      icon: Layers,
    },
    {
      id: 'ledger' as ActiveView,
      title: 'STOCK MOVEMENTS',
      subtitle: 'Ledger history & transfers',
      icon: ArrowRightLeft,
    },
    {
      id: 'products' as ActiveView,
      title: 'PRODUCT MASTER',
      subtitle: 'Product catalogue & models',
      icon: Package,
    },
    {
      id: 'locations' as ActiveView,
      title: 'LOCATION MASTER',
      subtitle: 'Facilities & warehouses',
      icon: MapPin,
    },
    {
      id: 'dispatch' as ActiveView,
      title: 'DISPATCH TICKETS',
      subtitle: 'Outbound dispatch pipeline',
      icon: Truck,
    },
    {
      id: 'employees' as ActiveView,
      title: 'STAFF REGISTER',
      subtitle: 'Employee access & profiles',
      icon: Users,
    },
    {
      id: 'audit' as ActiveView,
      title: 'AUDIT ARCHIVE',
      subtitle: 'Deleted records & traceability',
      icon: History,
    },
  ];

  return (
    <>
      {/* ---------------------------------------------------- */}
      {/* LEFT EDGE HOVER SENSING TRIGGER ZONE                 */}
      {/* ---------------------------------------------------- */}
      {!isPinned && (
        <div
          onMouseEnter={() => setIsHovered(true)}
          className="fixed top-0 left-0 h-full w-4 z-40 cursor-pointer pointer-events-auto"
          title="Move mouse here to open Navigation"
        />
      )}

      {/* Header Quick Toggle Button (When sidebar is not pinned) */}
      {!isPinned && (
        <button
          onClick={() => setIsMobileOpen((prev) => !prev)}
          className="fixed top-4 left-4 z-30 p-2 bg-white/95 backdrop-blur-sm border border-slate-300 shadow-md rounded-xl text-slate-800 hover:text-slate-950 hover:bg-amber-50 hover:border-amber-400 transition-all flex items-center gap-1.5 group cursor-pointer"
          title="Toggle Navigation Menu"
        >
          <Menu className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold text-slate-900 hidden sm:inline">Menu</span>
        </button>
      )}

      {/* ---------------------------------------------------- */}
      {/* BACKDROP FOR MOBILE / UNPINNED OVERLAY               */}
      {/* ---------------------------------------------------- */}
      {isOpen && !isPinned && (
        <div
          onClick={() => {
            setIsHovered(false);
            setIsMobileOpen(false);
          }}
          className="fixed inset-0 bg-slate-950/20 backdrop-blur-2xs z-40 transition-opacity animate-in fade-in duration-150"
        />
      )}

      {/* ---------------------------------------------------- */}
      {/* SLIDE-OUT COMPACT SIDEBAR (w-64)                     */}
      {/* ---------------------------------------------------- */}
      <aside
        onMouseEnter={() => {
          if (!isPinned) setIsHovered(true);
        }}
        onMouseLeave={() => {
          if (!isPinned) setIsHovered(false);
        }}
        className={`fixed top-0 left-0 h-full w-64 bg-slate-950 text-white z-50 shadow-2xl border-r border-slate-800 flex flex-col justify-between transition-transform duration-300 ease-in-out select-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/90 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-amber-400 text-slate-950 rounded-lg shadow-sm font-black shrink-0">
              <Building className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-black tracking-tight text-white leading-tight truncate">
                {process.env.NEXT_PUBLIC_APP_NAME || 'Enterprise ERP'}
              </h2>
              <p className="text-[10px] font-bold text-amber-400 tracking-wide uppercase">
                Inventory System
              </p>
            </div>
          </div>

          {/* Pin & Close Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                const nextPinned = !isPinned;
                onPinChange(nextPinned);
                if (!nextPinned) {
                  setIsHovered(false);
                }
              }}
              type="button"
              className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                isPinned
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isPinned ? 'Unpin Sidebar (Auto-Hide on Hover Out)' : 'Pin Sidebar (Keep Always Open & Shift Layout)'}
            >
              {isPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => {
                setIsHovered(false);
                setIsMobileOpen(false);
                onPinChange(false);
              }}
              type="button"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg sm:hidden cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="p-3 space-y-1 flex-1 overflow-y-auto">
          <p className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
            System Modules
          </p>

          {navItems.map((item) => {
            const isActive = activeView === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onViewChange(item.id);
                  if (!isPinned) {
                    setIsHovered(false);
                    setIsMobileOpen(false);
                  }
                }}
                type="button"
                className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between group cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 shadow-md font-black ring-1 ring-amber-300'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white font-semibold'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                      isActive
                        ? 'bg-slate-950/15 text-slate-950'
                        : 'bg-slate-900 text-amber-400 group-hover:text-amber-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black tracking-tight truncate">{item.title}</p>
                    <p
                      className={`text-[10px] truncate ${
                        isActive ? 'text-slate-800 font-medium' : 'text-slate-400 group-hover:text-slate-300'
                      }`}
                    >
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                <ChevronRight
                  className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                    isActive ? 'text-slate-950 translate-x-0.5' : 'text-slate-600 group-hover:text-amber-400'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Employee Profile & Footer Info */}
        <div className="p-3.5 border-t border-slate-800/80 bg-slate-950/70 text-xs space-y-3">
          {profile && (
            <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xs shrink-0">
                    {profile.employee_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate" title={profile.employee_name}>
                      {profile.employee_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-[10px] text-amber-400 font-extrabold">
                        {profile.employee_id}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded uppercase">
                        {profile.role || 'STAFF'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => logout()}
                  type="button"
                  title="Sign Out"
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Database className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-bold text-[11px] text-slate-200">Supabase Connected</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              {isPinned ? '📌 Pinned open' : 'Hover left edge to open'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};

export default NavigationSidebar;
