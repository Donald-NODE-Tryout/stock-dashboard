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

// GET /api/ledger - Read from pre-computed view dashboard_ledger_display
export async function GET() {
  try {
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('location_id, location_name, status')
      .order('location_id', { ascending: true });

    if (locError) {
      console.error('Error fetching locations in ledger API:', locError);
    }

    const { data: products, error: prodError } = await supabase
      .from('product_master')
      .select('model_id, model_name, category, company')
      .order('model_id', { ascending: true });

    if (prodError) {
      console.error('Error fetching products in ledger API:', prodError);
    }

    const { data: employees, error: empError } = await supabase
      .from('employee_register')
      .select('employee_id, employee_name, role, employment_status');

    if (empError) {
      console.error('Error fetching employees in ledger API:', empError);
    }

    // READ OPERATIONS: Query dashboard_ledger_display sorted numerically by entry_number DESC
    const { data: ledger, error: ledgerError } = await supabase
      .from('dashboard_ledger_display')
      .select('*')
      .order('entry_number', { ascending: false });

    if (ledgerError) {
      console.error('Error fetching dashboard_ledger_display:', ledgerError);
      return NextResponse.json({ error: `Failed to load ledger view: ${ledgerError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ledger: ledger || [],
      locations: locations || [],
      products: products || [],
      employees: employees || [],
    });
  } catch (err: any) {
    console.error('API /api/ledger GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/ledger - Insert into base ledger table, omitting entry_id so database sequence assigns it atomically
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { model_id, date, action, from_location, to_location, qty, remarks, entry_by = 'VI/EMP/1' } = body;

    if (!model_id) {
      return NextResponse.json({ error: 'Model is required.' }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ error: 'Action is required.' }, { status: 400 });
    }

    const upperAction = String(action).toUpperCase().trim();
    const parsedQty = Number(qty);

    if (isNaN(parsedQty)) {
      return NextResponse.json({ error: 'Quantity must be a valid number.' }, { status: 400 });
    }

    if (upperAction === 'ADJUSTMENT') {
      if (parsedQty === 0) {
        return NextResponse.json({ error: 'Quantity cannot be 0 for an Adjustment.' }, { status: 400 });
      }
    } else {
      if (parsedQty <= 0) {
        return NextResponse.json({ error: 'Quantity must be greater than 0.' }, { status: 400 });
      }
    }

    // Nullability specification per blueprint:
    // - PURCHASE/ENTRY sets from_location = NULL
    // - SALE sets to_location = NULL
    // - TRANSFER sets both
    const cleanFrom = (upperAction === 'PURCHASE' || upperAction === 'ENTRY') ? null : (from_location || null);
    const cleanTo = (upperAction === 'SALE') ? null : (to_location || null);

    // Omit entry_id on INSERT so the PostgreSQL sequence assigns it atomically
    const newRow = {
      model_id: String(model_id).trim(),
      date: date || new Date().toISOString().split('T')[0],
      action: upperAction,
      from_location: cleanFrom,
      to_location: cleanTo,
      qty: parsedQty,
      remarks: remarks ? String(remarks).trim() : null,
      entry_by: entry_by || 'VI/EMP/1',
      entry_time: new Date().toISOString(),
    };

    let { data, error } = await supabase
      .from('ledger')
      .insert([newRow])
      .select()
      .single();

    // Self-healing: If PostgreSQL sequence has fallen behind existing rows (23505 duplicate key),
    // calculate the next numeric suffix and insert cleanly with explicit entry_id
    if (error && error.code === '23505') {
      console.warn('Sequence collision detected on ledger (23505). Self-healing with max(entry_number) + 1...');
      const { data: topRow } = await supabase
        .from('ledger')
        .select('entry_number')
        .order('entry_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextNum = (topRow?.entry_number || 1160) + 1;
      const explicitId = `VI/ENT/${nextNum}`;

      const retryRes = await supabase
        .from('ledger')
        .insert([{ ...newRow, entry_id: explicitId }])
        .select()
        .single();

      data = retryRes.data;
      error = retryRes.error;
    }

    if (error) {
      console.error('Error inserting into ledger:', error);
      return NextResponse.json({ error: `Failed to insert transaction: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, entry: data });
  } catch (err: any) {
    console.error('API /api/ledger POST error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create transaction.' }, { status: 500 });
  }
}

// PATCH /api/ledger - Update record in base ledger by entry_id
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { entry_id, ...updates } = body;

    if (!entry_id) {
      return NextResponse.json({ error: 'entry_id is required.' }, { status: 400 });
    }

    // Enforce nullability rules based on action to avoid foreign key violations:
    // - PURCHASE/ENTRY/ADJUSTMENT: from_location must be null
    // - SALE: to_location must be null
    if (updates.action) {
      const act = String(updates.action).toUpperCase().trim();
      updates.action = act;
      if (act === 'PURCHASE' || act === 'ENTRY' || act === 'ADJUSTMENT') {
        updates.from_location = null;
      }
      if (act === 'SALE') {
        updates.to_location = null;
      }
    }

    const { data, error } = await supabase
      .from('ledger')
      .update(updates)
      .eq('entry_id', entry_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, entry: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update ledger' }, { status: 500 });
  }
}

// DELETE /api/ledger - Delete record in base ledger by entry_id
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const entry_id = searchParams.get('entry_id');
    const deleted_by = searchParams.get('deleted_by') || 'SYSTEM';

    if (!entry_id) {
      return NextResponse.json({ error: 'entry_id is required.' }, { status: 400 });
    }

    // 1. Snapshot the existing record before deletion
    const { data: existingRecord } = await supabase
      .from('ledger')
      .select('*')
      .eq('entry_id', entry_id)
      .maybeSingle();

    if (!existingRecord) {
      return NextResponse.json({ error: `Record ${entry_id} not found.` }, { status: 404 });
    }

    // 2. Perform deletion (fires database trigger trg_archive_deleted_ledger)
    const { error } = await supabase
      .from('ledger')
      .delete()
      .eq('entry_id', entry_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3. Enrich the trigger-created archive record with the actual user who deleted it
    const { data: existingArchive } = await supabase
      .from('deleted_records_archive')
      .select('archive_id')
      .eq('table_name', 'ledger')
      .eq('record_id', entry_id)
      .order('deleted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingArchive) {
      await supabase
        .from('deleted_records_archive')
        .update({ deleted_by })
        .eq('archive_id', existingArchive.archive_id);
    } else {
      // Fallback: If database trigger was not active, insert audit record
      try {
        await supabase
          .from('deleted_records_archive')
          .insert([
            {
              table_name: 'ledger',
              record_id: entry_id,
              deleted_data: existingRecord,
              deleted_at: new Date().toISOString(),
              deleted_by,
            },
          ]);
      } catch {}
    }

    return NextResponse.json({ success: true, entry_id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete ledger record' }, { status: 500 });
  }
}
