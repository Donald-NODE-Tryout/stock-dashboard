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

// GET /api/audit/deleted - Fetch deleted records from archive with filters
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const table = searchParams.get('table'); // e.g. 'ledger', 'product_master', etc. or 'ALL'
    const search = searchParams.get('search')?.trim().toLowerCase();
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    let query = supabase
      .from('deleted_records_archive')
      .select('*')
      .order('deleted_at', { ascending: false })
      .limit(limit);

    if (table && table !== 'ALL') {
      query = query.eq('table_name', table);
    }

    const { data, error } = await query;

    if (error) {
      // If table doesn't exist yet in Supabase (pending SQL migration execution)
      if (
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        error.message?.includes('schema cache') ||
        error.message?.includes('does not exist')
      ) {
        return NextResponse.json({
          archive: [],
          tablePending: true,
          message: 'The deleted_records_archive table has not been created in Supabase yet. Please run migration 20260925_audit_archive_system.sql in your Supabase SQL editor.',
        });
      }
      console.error('Error querying deleted_records_archive:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let records = data || [];

    // Optional in-memory search across record_id, deleted_by, and deleted_data
    if (search) {
      records = records.filter((r) => {
        const idMatch = (r.record_id || '').toLowerCase().includes(search);
        const userMatch = (r.deleted_by || '').toLowerCase().includes(search);
        const dataMatch = JSON.stringify(r.deleted_data || {}).toLowerCase().includes(search);
        return idMatch || userMatch || dataMatch;
      });
    }

    return NextResponse.json({ archive: records, tablePending: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch audit archive';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/audit/deleted - Explicitly archive a deleted record (defense-in-depth)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { table_name, record_id, deleted_data, deleted_by, reason } = body;

    if (!table_name || !record_id) {
      return NextResponse.json({ error: 'table_name and record_id are required.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('deleted_records_archive')
      .insert([
        {
          table_name: String(table_name).trim(),
          record_id: String(record_id).trim(),
          deleted_data: deleted_data || {},
          deleted_at: new Date().toISOString(),
          deleted_by: deleted_by || 'SYSTEM',
          reason: reason || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.warn('Notice: explicit audit archive insert failed (likely trigger already captured it or table pending):', error.message);
      return NextResponse.json({ success: false, warning: error.message });
    }

    return NextResponse.json({ success: true, archive: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to archive record';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
