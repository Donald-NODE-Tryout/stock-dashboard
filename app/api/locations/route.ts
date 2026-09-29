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

// --- SBRoCL for Location ID (VI/LOC/1, VI/LOC/2, VI/LOC/3, VI/LOC/4...) ---
async function generateNextLocationId(prefix: string = 'VI/LOC/'): Promise<string> {
  const { data, error } = await supabase
    .from('locations')
    .select('location_id');

  if (error || !data || data.length === 0) {
    return `${prefix}1`;
  }

  let maxNum = 0;
  for (const row of data) {
    const idStr = String(row.location_id || '');
    const match = idStr.match(/(\d+)$/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (!isNaN(val) && val > maxNum) {
        maxNum = val;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${prefix}${nextNum}`;
}

// GET /api/locations
export async function GET() {
  try {
    const { data: locations, error } = await supabase
      .from('locations')
      .select('*')
      .order('location_id', { ascending: true });

    if (error) {
      console.error('Error fetching locations:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Query current stock levels per location from dashboard_stock_view
    const { data: stockData } = await supabase
      .from('dashboard_stock_view')
      .select('location_id, qty');

    const stockMap: Record<string, number> = {};
    (stockData || []).forEach((row: { location_id?: string; qty?: number }) => {
      if (row.location_id) {
        stockMap[row.location_id] = (stockMap[row.location_id] || 0) + Number(row.qty || 0);
      }
    });

    return NextResponse.json({
      locations: locations || [],
      stockCounts: stockMap,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch locations';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/locations - Create a new location with SBRoCL
export async function POST(req: Request) {
  try {
    const { location_name, status = 'ACTIVE' } = await req.json();

    const cleanName = (location_name || '').trim();
    if (!cleanName) {
      return NextResponse.json({ error: 'Location Name is required.' }, { status: 400 });
    }

    const maxRetries = 5;
    let attempts = 0;
    let success = false;
    let resultRow: unknown = null;
    let lastError: string = '';

    while (attempts < maxRetries) {
      attempts++;
      const nextId = await generateNextLocationId('VI/LOC/');

      const { data, error } = await supabase
        .from('locations')
        .insert([
          {
            location_id: nextId,
            location_name: cleanName,
            status: status || 'ACTIVE',
            entry_time: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (!error && data) {
        success = true;
        resultRow = data;
        break;
      }

      lastError = error?.message || 'Collision detected';
      console.warn(`SBRoCL Location retry attempt ${attempts}:`, lastError);
    }

    if (!success) {
      return NextResponse.json({ error: `Failed to insert location: ${lastError}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, location: resultRow });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create location';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/locations - Update location name or status with 0-goods constraint
export async function PATCH(req: Request) {
  try {
    const { location_id, location_name, status } = await req.json();

    if (!location_id) {
      return NextResponse.json({ error: 'location_id is required.' }, { status: 400 });
    }

    const updatePayload: Record<string, any> = {};

    if (location_name !== undefined) {
      const cleanName = String(location_name).trim();
      if (!cleanName) {
        return NextResponse.json({ error: 'Location Name cannot be empty.' }, { status: 400 });
      }
      updatePayload.location_name = cleanName;
    }

    // Constraint: Location can ONLY become INACTIVE when there are 0 goods at the location
    if (status !== undefined) {
      if (status === 'INACTIVE') {
        const { data: stockData, error: stockErr } = await supabase
          .from('dashboard_stock_view')
          .select('qty')
          .eq('location_id', location_id);

        if (!stockErr && stockData) {
          const totalGoods = stockData.reduce((acc, row) => acc + Number(row.qty || 0), 0);
          if (totalGoods > 0) {
            return NextResponse.json(
              {
                error: `Cannot deactivate facility: There are currently ${totalGoods} units of goods at ${location_id}. All stock must be 0 before deactivating.`,
                currentStock: totalGoods,
              },
              { status: 400 }
            );
          }
        }
      }
      updatePayload.status = status;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields provided to update.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('locations')
      .update(updatePayload)
      .eq('location_id', location_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating location:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, location: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update location';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/locations - Delete location with audit archive
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const location_id = searchParams.get('location_id');

    if (!location_id) {
      return NextResponse.json({ error: 'location_id is required.' }, { status: 400 });
    }

    // 1. Snapshot for audit retention
    const { data: existingLocation } = await supabase
      .from('locations')
      .select('*')
      .eq('location_id', location_id)
      .maybeSingle();

    if (existingLocation) {
      try {
        await supabase
          .from('deleted_records_archive')
          .insert([
            {
              table_name: 'locations',
              record_id: location_id,
              deleted_data: existingLocation,
              deleted_at: new Date().toISOString(),
              deleted_by: 'SYSTEM',
            },
          ]);
      } catch {}
    }

    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('location_id', location_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, location_id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete location';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

