import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Fetch raw data in parallel for optimal speed
    const [
      stockRes,
      locationsRes,
      productsRes,
      ledgerSalesRes,
      ledgerTransfersRes,
    ] = await Promise.all([
      supabase.from('dashboard_stock_view').select('model_id, location_id, qty'),
      supabase.from('locations').select('location_id, location_name, status').order('location_id', { ascending: true }),
      supabase.from('product_master').select('model_id, model_name, category, company, status'),
      supabase.from('dashboard_ledger_display').select('model_id, qty, date, action').eq('action', 'SALE'),
      supabase.from('dashboard_ledger_display').select('model_id, qty, date, from_location, to_location, from_location_id, to_location_id').eq('action', 'TRANSFER'),
    ]);

    const stockRows = stockRes.data || [];
    const locations = locationsRes.data || [];
    const products = productsRes.data || [];
    const salesRows = ledgerSalesRes.data || [];
    const transferRows = ledgerTransfersRes.data || [];

    // --- Product metadata lookup map ---
    const productMap = new Map<string, { model_name?: string; category?: string; company?: string }>();
    products.forEach((p) => {
      productMap.set(p.model_id, {
        model_name: p.model_name || undefined,
        category: p.category && String(p.category) !== 'nan' ? String(p.category) : undefined,
        company: p.company && String(p.company) !== 'nan' ? String(p.company) : undefined,
      });
    });

    // --- Stock Aggregation (Per Model & Per Location) ---
    let totalStockOnHand = 0;
    const modelStockMap: Record<string, number> = {};
    const locationStockMap: Record<string, number> = {};

    stockRows.forEach((row) => {
      const q = Number(row.qty) || 0;
      if (q > 0) {
        totalStockOnHand += q;
        modelStockMap[row.model_id] = (modelStockMap[row.model_id] || 0) + q;
        if (row.location_id) {
          locationStockMap[row.location_id] = (locationStockMap[row.location_id] || 0) + q;
        }
      }
    });

    // Active SKU count: distinct catalog items with live stock > 0
    const activeSkuCount = Object.keys(modelStockMap).filter((m) => (modelStockMap[m] || 0) > 0).length;

    // --- Dates Calculation ---
    // Latest reference date in dataset to account for simulation/current date
    let maxDateMs = Date.now();
    salesRows.forEach((r) => {
      if (r.date) {
        const ms = new Date(r.date).getTime();
        if (!isNaN(ms) && ms > maxDateMs) maxDateMs = ms;
      }
    });

    const thirtyDaysAgoMs = maxDateMs - 30 * 24 * 60 * 60 * 1000;
    const sixtyDaysAgoMs = maxDateMs - 60 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgoMs = maxDateMs - 90 * 24 * 60 * 60 * 1000;

    // --- Sales Aggregation (30-day, 60-day, 90-day) ---
    let thirtyDaySalesVolume = 0;
    const modelSales30d: Record<string, number> = {};
    const modelSales90d: Record<string, number> = {};
    const modelLastSaleDate: Record<string, string> = {};

    salesRows.forEach((sale) => {
      const q = Math.abs(Number(sale.qty) || 0);
      const saleDateMs = sale.date ? new Date(sale.date).getTime() : 0;

      // Track last sale date
      if (sale.date && (!modelLastSaleDate[sale.model_id] || sale.date > modelLastSaleDate[sale.model_id])) {
        modelLastSaleDate[sale.model_id] = sale.date;
      }

      if (saleDateMs >= thirtyDaysAgoMs) {
        thirtyDaySalesVolume += q;
        modelSales30d[sale.model_id] = (modelSales30d[sale.model_id] || 0) + q;
      }

      if (saleDateMs >= ninetyDaysAgoMs) {
        modelSales90d[sale.model_id] = (modelSales90d[sale.model_id] || 0) + q;
      }
    });

    // --- Velocity & DOI (Days of Inventory) Analytics ---
    interface DoiItem {
      model_id: string;
      model_name?: string;
      category?: string;
      company?: string;
      stock: number;
      sales30d: number;
      dailyBurn: number;
      doi: number; // in days
      badge: 'RED' | 'AMBER' | 'GREEN' | 'INACTIVE';
    }

    const doiList: DoiItem[] = [];
    let lowStockAlertCount = 0;

    Object.keys(modelStockMap).forEach((modelId) => {
      const stock = modelStockMap[modelId] || 0;
      if (stock <= 0) return;

      const s30 = modelSales30d[modelId] || 0;
      const dailyBurn = Number((s30 / 30).toFixed(2));
      let doi = 999;
      let badge: 'RED' | 'AMBER' | 'GREEN' | 'INACTIVE' = 'GREEN';

      if (dailyBurn > 0) {
        doi = Math.round(stock / dailyBurn);
        if (doi < 7) {
          badge = 'RED';
          lowStockAlertCount++;
        } else if (doi <= 14) {
          badge = 'AMBER';
        } else {
          badge = 'GREEN';
        }
      } else {
        // Stock > 0 but 0 sales in 30 days
        badge = 'GREEN';
      }

      const meta = productMap.get(modelId);
      doiList.push({
        model_id: modelId,
        model_name: meta?.model_name,
        category: meta?.category,
        company: meta?.company,
        stock,
        sales30d: s30,
        dailyBurn,
        doi,
        badge,
      });
    });

    // Sort DOI items by runway ascending (most critical first)
    doiList.sort((a, b) => a.doi - b.doi);

    // --- ABC Sales Velocity ---
    // 1. Top Performers (30/90 days)
    const topPerformers30d = Object.entries(modelSales30d)
      .map(([model_id, salesQty]) => ({
        model_id,
        salesQty,
        stock: modelStockMap[model_id] || 0,
        ...productMap.get(model_id),
      }))
      .sort((a, b) => b.salesQty - a.salesQty)
      .slice(0, 8);

    const topPerformers90d = Object.entries(modelSales90d)
      .map(([model_id, salesQty]) => ({
        model_id,
        salesQty,
        stock: modelStockMap[model_id] || 0,
        ...productMap.get(model_id),
      }))
      .sort((a, b) => b.salesQty - a.salesQty)
      .slice(0, 8);

    // 2. Dead Stock (Stock > 0 with 0 sales in 60+ days)
    const deadStockList = Object.keys(modelStockMap)
      .filter((modelId) => {
        const stock = modelStockMap[modelId] || 0;
        if (stock <= 0) return false;
        const lastSale = modelLastSaleDate[modelId];
        if (!lastSale) return true; // Never sold
        const lastSaleMs = new Date(lastSale).getTime();
        return lastSaleMs < sixtyDaysAgoMs;
      })
      .map((modelId) => {
        const lastSale = modelLastSaleDate[modelId];
        const daysSinceLastSale = lastSale
          ? Math.round((maxDateMs - new Date(lastSale).getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        return {
          model_id: modelId,
          stock: modelStockMap[modelId],
          lastSaleDate: lastSale || 'Never Sold',
          daysInactive: daysSinceLastSale,
          ...productMap.get(modelId),
        };
      })
      .sort((a, b) => b.stock - a.stock);

    // --- Location Inventory Matrix ---
    // Central Hub: VI/LOC/1 (MOTA MOVA), Satellite Retail: SHOP, ANANDPAR, AHMEDABAD
    const locationCards = locations.map((loc) => {
      const stock = locationStockMap[loc.location_id] || 0;
      const share = totalStockOnHand > 0 ? Number(((stock / totalStockOnHand) * 100).toFixed(1)) : 0;
      const isCentralHub = loc.location_id === 'VI/LOC/1' || loc.location_name.toUpperCase().includes('MOTA MOVA');

      return {
        location_id: loc.location_id,
        location_name: loc.location_name,
        status: loc.status,
        stock,
        sharePercentage: share,
        isCentralHub,
      };
    });

    // --- Inter-Branch Transfer Velocity ---
    // Transfers originating from Central Hub (VI/LOC/1) to satellite branches in the last 30 days
    let totalTransferVolume30d = 0;
    const transferDestinationMap: Record<string, { location_name: string; qty: number; count: number }> = {};

    transferRows.forEach((t) => {
      const transferDateMs = t.date ? new Date(t.date).getTime() : 0;
      const qty = Math.abs(Number(t.qty) || 0);

      if (transferDateMs >= thirtyDaysAgoMs) {
        totalTransferVolume30d += qty;
        const destId = t.to_location_id || t.to_location || 'OTHER';
        const destName = t.to_location || destId;

        if (!transferDestinationMap[destId]) {
          transferDestinationMap[destId] = { location_name: destName, qty: 0, count: 0 };
        }
        transferDestinationMap[destId].qty += qty;
        transferDestinationMap[destId].count += 1;
      }
    });

    const transferBreakdown = Object.entries(transferDestinationMap).map(([id, data]) => ({
      destination_id: id,
      destination_name: data.location_name,
      unitsTransferred: data.qty,
      transferCount: data.count,
    }));

    return NextResponse.json({
      success: true,
      kpis: {
        totalStockOnHand,
        thirtyDaySalesVolume,
        activeSkuCount,
        lowStockAlertCount,
      },
      locationMatrix: locationCards,
      inventoryHealth: {
        doiCriticalList: doiList.filter((d) => d.badge === 'RED' || d.badge === 'AMBER').slice(0, 10),
        doiAllCount: doiList.length,
        topPerformers30d,
        topPerformers90d,
        deadStockCount: deadStockList.length,
        deadStockList: deadStockList.slice(0, 10),
        transferVelocity: {
          totalVolume30d: totalTransferVolume30d,
          transferCount30d: transferRows.filter((t) => (t.date ? new Date(t.date).getTime() >= thirtyDaysAgoMs : false)).length,
          breakdown: transferBreakdown,
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error generating dashboard analytics';
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
