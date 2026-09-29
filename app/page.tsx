'use client';

import React, { useState, useEffect } from 'react';
import StockView from '@/components/StockView';
import LedgerView from '@/components/LedgerView';
import ProductView from '@/components/ProductView';
import LocationView from '@/components/LocationView';
import DispatchView from '@/components/DispatchView';
import EmployeeView from '@/components/EmployeeView';
import HomeDashboardView from '@/components/HomeDashboardView';
import AuditArchiveView from '@/components/AuditArchiveView';
import NavigationSidebar, { ActiveView } from '@/components/NavigationSidebar';
import LoginForm from '@/components/LoginForm';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import {
  ArrowUp,
  Building2,
  Loader2,
  LogOut,
  User as UserIcon,
  Layers,
  ArrowRightLeft,
  Package,
  MapPin,
  Truck,
  Users,
  Flame,
  History,
} from 'lucide-react';

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Enterprise ERP';

const VIEW_METADATA: Record<
  ActiveView,
  { title: string; badge: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }
> = {
  home: {
    title: 'HOME DASHBOARD',
    badge: 'Command Center',
    subtitle: `${appName} • Real-time operational intelligence, branch health & velocity runway.`,
    icon: Flame,
  },
  stock: {
    title: 'CURRENT STOCK',
    badge: 'Live Matrix',
    subtitle: `${appName} • Multi-location live inventory & model distribution.`,
    icon: Layers,
  },
  ledger: {
    title: 'STOCK MOVEMENTS',
    badge: 'Audit Ledger',
    subtitle: `${appName} • Stock movement ledger, transfers, and material history.`,
    icon: ArrowRightLeft,
  },
  products: {
    title: 'PRODUCT MASTER',
    badge: 'Catalogue',
    subtitle: `${appName} • Product models, categories, and initial intake registry.`,
    icon: Package,
  },
  locations: {
    title: 'LOCATION MASTER',
    badge: 'Facilities',
    subtitle: `${appName} • Warehouses, godowns, and shop facility management.`,
    icon: MapPin,
  },
  dispatch: {
    title: 'DISPATCH TICKETS',
    badge: 'Fulfillment',
    subtitle: `${appName} • Outbound dispatch order pipeline and stage tracking.`,
    icon: Truck,
  },
  employees: {
    title: 'STAFF REGISTER',
    badge: 'Access Control',
    subtitle: `${appName} • Employee directory, designation, and login credentials.`,
    icon: Users,
  },
  audit: {
    title: 'AUDIT ARCHIVE',
    badge: 'Deleted Log',
    subtitle: `${appName} • Permanent trace of deleted records across movements, products, staff, facilities, and dispatch.`,
    icon: History,
  },
};

function DashboardContent() {
  const { user, profile, isLoading, logout } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [isSidebarPinned, setIsSidebarPinned] = useState<boolean>(false);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);

  // Track window scroll position to show/hide "Scroll to Top" button
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 200) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // 1. Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-16 h-16 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shadow-2xl border-2 border-amber-300">
          <Building2 className="w-9 h-9 animate-pulse" />
        </div>
        <div className="flex items-center gap-2.5 text-xs sm:text-sm font-black text-amber-400 tracking-wider uppercase">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span>Verifying Enterprise Session...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated state -> Render Enterprise Login Screen
  if (!user) {
    return <LoginForm />;
  }

  const currentMeta = VIEW_METADATA[activeView] || VIEW_METADATA.stock;
  const MetaIcon = currentMeta.icon;

  // 3. Authenticated state -> Render Dashboard
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900">
      
      {/* ---------------------------------------------------- */}
      {/* SLIDE-OUT / PINNABLE COMPACT NAVIGATION SIDEBAR     */}
      {/* ---------------------------------------------------- */}
      <NavigationSidebar
        activeView={activeView}
        onViewChange={(view) => setActiveView(view)}
        isPinned={isSidebarPinned}
        onPinChange={(pinned) => setIsSidebarPinned(pinned)}
      />

      {/* ---------------------------------------------------- */}
      {/* MAIN CONTENT (Bounded Container max-w-7xl)           */}
      {/* ---------------------------------------------------- */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${
          isSidebarPinned ? 'lg:pl-64' : 'pl-0'
        }`}
      >
        <main className="flex-1 p-4 sm:p-7 md:p-8 pt-16 sm:pt-8 max-w-7xl w-full mx-auto space-y-5">
          
          {/* Header Bar with View Meta & Profile Pill */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4 pl-12 sm:pl-0">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-slate-950 text-amber-400 rounded-lg shadow-2xs">
                  <MetaIcon className="w-4 h-4" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">
                  {currentMeta.title}
                </h1>
                <span className="text-[11px] font-black uppercase px-2.5 py-0.5 bg-amber-400 text-slate-950 rounded-md shadow-2xs">
                  {currentMeta.badge}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-1">
                {currentMeta.subtitle}
              </p>
            </div>

            {/* Header Right: Quick Switcher & User Profile Pill */}
            <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
              
              {/* Logged-In User Profile Pill */}
              {profile && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-xl shadow-xs">
                  <div className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xs">
                    {profile.employee_name ? (
                      profile.employee_name.charAt(0).toUpperCase()
                    ) : (
                      <UserIcon className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="text-left leading-tight">
                    <p className="text-xs font-bold text-slate-900 truncate max-w-[130px]" title={profile.employee_name}>
                      {profile.employee_name}
                    </p>
                    <p className="text-[10px] font-mono font-extrabold text-amber-600">
                      {profile.employee_id}
                    </p>
                  </div>
                  <button
                    onClick={() => logout()}
                    type="button"
                    title="Sign Out"
                    className="ml-1 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* Dynamic View Mount */}
          <div className="w-full">
            {activeView === 'home' && (
              <HomeDashboardView
                supabase={supabase}
                onNavigate={(view) => setActiveView(view as ActiveView)}
              />
            )}

            {activeView === 'stock' && (
              <StockView
                supabase={supabase}
                onModelClick={(modelId) => console.log('Selected model:', modelId)}
              />
            )}

            {activeView === 'ledger' && (
              <LedgerView supabase={supabase} />
            )}

            {activeView === 'products' && (
              <ProductView supabase={supabase} />
            )}

            {activeView === 'locations' && (
              <LocationView supabase={supabase} />
            )}

            {activeView === 'dispatch' && (
              <DispatchView supabase={supabase} />
            )}

            {activeView === 'employees' && (
              <EmployeeView supabase={supabase} />
            )}

            {activeView === 'audit' && (
              <AuditArchiveView supabase={supabase} />
            )}
          </div>
        </main>
      </div>

      {/* ---------------------------------------------------- */}
      {/* FLOATING "GO TO TOP" BUTTON (Bottom-Right)           */}
      {/* ---------------------------------------------------- */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          type="button"
          className="fixed bottom-6 right-6 z-40 p-3 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-2xl shadow-xl border-2 border-slate-950 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center group cursor-pointer"
          title="Back to Top"
        >
          <ArrowUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform font-bold" />
        </button>
      )}

    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
