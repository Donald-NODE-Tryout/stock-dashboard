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

// Automatic sequence handles entry_id atomically via database sequence:
// ALTER TABLE ledger ALTER COLUMN entry_id SET DEFAULT 'VI/ENT/' || nextval('ledger_id_seq');

// GET /api/products - Fetch all products and active locations
export async function GET() {
  try {
    const { data: products, error: prodErr } = await supabase
      .from('product_master')
      .select('*')
      .order('model_id', { ascending: true });

    if (prodErr) {
      console.error('Error fetching products:', prodErr);
      return NextResponse.json({ error: prodErr.message }, { status: 500 });
    }

    const { data: locations, error: locErr } = await supabase
      .from('locations')
      .select('location_id, location_name, status')
      .order('location_name', { ascending: true });

    if (locErr) {
      console.error('Error fetching locations:', locErr);
    }

    return NextResponse.json({
      products: products || [],
      locations: locations || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch products';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/products - Create a new product AND record initial ENTRY in ledger
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      model_id,
      model_name,
      category,
      company,
      to_location,
      qty,
      remarks,
      entry_by,
      status = 'ACTIVE',
    } = body;

    const cleanModelId = (model_id || '').trim();
    if (!cleanModelId) {
      return NextResponse.json({ error: 'Model ID is required.' }, { status: 400 });
    }

    const qtyNum = parseInt(qty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      return NextResponse.json({ error: 'Initial Quantity must be greater than 0.' }, { status: 400 });
    }

    if (!to_location) {
      return NextResponse.json({ error: 'Initial Intake Location is required.' }, { status: 400 });
    }

    // 1. Insert product into product_master
    const { data: newProduct, error: prodInsertErr } = await supabase
      .from('product_master')
      .insert([
        {
          model_id: cleanModelId,
          model_name: (model_name || cleanModelId).trim(),
          category: (category || '').trim() || null,
          company: (company || '').trim() || null,
          status: status || 'ACTIVE',
          entry_time: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (prodInsertErr) {
      console.error('Error inserting product into product_master:', prodInsertErr);
      return NextResponse.json({ error: prodInsertErr.message }, { status: 500 });
    }

    // 2. Insert initial intake record into ledger table (action = 'ENTRY'), omitting entry_id for sequence auto-increment
    const todayDate = new Date().toISOString().split('T')[0];
    const { data: ledgerData, error: ledgerErr } = await supabase
      .from('ledger')
      .insert([
        {
          model_id: cleanModelId,
          date: todayDate,
          action: 'ENTRY',
          from_location: null,
          to_location: to_location,
          qty: qtyNum,
          remarks: (remarks || 'Initial Product Intake').trim(),
          entry_by: entry_by || 'VI/EMP/1',
          entry_time: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (ledgerErr) {
      console.error('Failed to create ledger entry for new product:', ledgerErr.message);
      return NextResponse.json(
        {
          error: `Product registered in catalogue, but initial ledger ENTRY failed: ${ledgerErr.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      product: newProduct,
      ledgerEntry: ledgerData,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create product and ledger entry';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/products - Update product details (model_name, category, company, status)
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { model_id, model_name, category, company, status } = body;

    if (!model_id) {
      return NextResponse.json({ error: 'model_id is required.' }, { status: 400 });
    }

    const updatePayload: Record<string, any> = {};
    if (model_name !== undefined) updatePayload.model_name = String(model_name).trim();
    if (category !== undefined) updatePayload.category = (category || '').trim() || null;
    if (company !== undefined) updatePayload.company = (company || '').trim() || null;
    if (status !== undefined) updatePayload.status = status;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No fields provided to update.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('product_master')
      .update(updatePayload)
      .eq('model_id', model_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating product:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, product: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update product';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/products - Delete product from catalogue with audit archive
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const model_id = searchParams.get('model_id');

    if (!model_id) {
      return NextResponse.json({ error: 'model_id is required.' }, { status: 400 });
    }

    // 1. Snapshot for audit retention
    const { data: existingProduct } = await supabase
      .from('product_master')
      .select('*')
      .eq('model_id', model_id)
      .maybeSingle();

    if (existingProduct) {
      try {
        await supabase
          .from('deleted_records_archive')
          .insert([
            {
              table_name: 'product_master',
              record_id: model_id,
              deleted_data: existingProduct,
              deleted_at: new Date().toISOString(),
              deleted_by: 'SYSTEM',
            },
          ]);
      } catch {}
    }

    const { error } = await supabase
      .from('product_master')
      .delete()
      .eq('model_id', model_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, model_id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete product';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
