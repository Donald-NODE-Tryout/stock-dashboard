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
    // 1. Fetch active models from product_master
    const { data: products, error: prodError } = await supabase
      .from('product_master')
      .select('model_id, model_name, category, company, status')
      .eq('status', 'ACTIVE')
      .order('model_id', { ascending: true });

    if (prodError) {
      console.error('Error fetching product_master:', prodError);
      return NextResponse.json({ error: `Failed to load products: ${prodError.message}` }, { status: 500 });
    }

    // 2. Fetch active locations
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('location_id, location_name, status')
      .eq('status', 'ACTIVE')
      .order('location_name', { ascending: true });

    if (locError) {
      console.error('Error fetching locations:', locError);
      return NextResponse.json({ error: `Failed to load locations: ${locError.message}` }, { status: 500 });
    }

    // 3. Fetch stock view entries
    const { data: stock, error: stockError } = await supabase
      .from('dashboard_stock_view')
      .select('model_id, location_id, qty');

    if (stockError) {
      console.error('Error fetching dashboard_stock_view:', stockError);
      return NextResponse.json({ error: `Failed to load stock view: ${stockError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      products: products || [],
      locations: locations || [],
      stock: stock || [],
    });
  } catch (err: any) {
    console.error('API /api/stock unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
