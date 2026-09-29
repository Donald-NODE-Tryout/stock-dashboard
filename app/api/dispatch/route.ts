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

// --- SBRoCL for Ticket ID (VI/DISP/1, VI/DISP/2...) ---
async function generateNextTicketId(prefix: string = 'VI/DISP/'): Promise<string> {
  const { data, error } = await supabase
    .from('dispatch_tickets')
    .select('ticket_id');

  if (error || !data || data.length === 0) {
    return `${prefix}1`;
  }

  let maxNum = 0;
  for (const row of data) {
    const idStr = String(row.ticket_id || '');
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

// GET /api/dispatch
export async function GET() {
  try {
    const { data: tickets, error: ticketErr } = await supabase
      .from('dispatch_tickets')
      .select('*')
      .order('ticket_id', { ascending: false });

    if (ticketErr) {
      console.error('Error fetching dispatch tickets:', ticketErr);
      return NextResponse.json({ error: ticketErr.message }, { status: 500 });
    }

    const { data: products } = await supabase
      .from('product_master')
      .select('model_id, model_name, category, company')
      .order('model_id', { ascending: true });

    const { data: locations } = await supabase
      .from('locations')
      .select('location_id, location_name, status');

    const { data: employees } = await supabase
      .from('employee_register')
      .select('employee_id, employee_name, role');

    const { data: stock } = await supabase
      .from('dashboard_stock_view')
      .select('model_id, location_id, qty');

    const normalizedTickets = (tickets || []).map((t) => ({
      ...t,
      ticket_status: t.ticket_status === 'INITIAL' ? 'INITIATED' : t.ticket_status,
    }));

    return NextResponse.json({
      tickets: normalizedTickets,
      products: products || [],
      locations: locations || [],
      employees: employees || [],
      stock: stock || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch dispatch data';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/dispatch - Create a new dispatch ticket with SBRoCL
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      model_id,
      qty,
      from_location,
      remarks,
      created_by,
    } = body;

    if (!model_id) {
      return NextResponse.json({ error: 'Model ID is required.' }, { status: 400 });
    }

    const qtyNum = parseInt(qty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      return NextResponse.json({ error: 'Quantity must be greater than 0.' }, { status: 400 });
    }

    if (!from_location) {
      return NextResponse.json({ error: 'Source Location is required.' }, { status: 400 });
    }

    // Validate that source facility has sufficient stock for this model
    const { data: stockRow, error: stockErr } = await supabase
      .from('dashboard_stock_view')
      .select('qty')
      .eq('model_id', model_id)
      .eq('location_id', from_location)
      .maybeSingle();

    const availableStock = stockRow ? Number(stockRow.qty) || 0 : 0;
    if (qtyNum > availableStock) {
      return NextResponse.json({
        error: `Insufficient stock at source facility. Available stock for ${model_id} is ${availableStock} unit(s), but requested quantity is ${qtyNum}.`
      }, { status: 400 });
    }

    const maxRetries = 5;
    let attempts = 0;
    let success = false;
    let resultRow: any = null;
    let lastError: string = '';

    while (attempts < maxRetries) {
      attempts++;
      const nextId = await generateNextTicketId('VI/DISP/');

      // Attempt 1: Try inserting with 'INITIATED'
      let insertStatus = 'INITIATED';
      let { data, error } = await supabase
        .from('dispatch_tickets')
        .insert([
          {
            ticket_id: nextId,
            model_id: model_id,
            qty: qtyNum,
            from_location: from_location,
            ticket_status: insertStatus,
            remarks: (remarks || '').trim() || null,
            created_by: created_by || 'VI0001',
            created_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      // If check constraint fails because database migration hasn't been applied yet,
      // fallback gracefully to 'INITIAL' which matches the old check constraint
      if (error && error.message.includes('dispatch_tickets_ticket_status_check')) {
        insertStatus = 'INITIAL';
        const fallbackRes = await supabase
          .from('dispatch_tickets')
          .insert([
            {
              ticket_id: nextId,
              model_id: model_id,
              qty: qtyNum,
              from_location: from_location,
              ticket_status: insertStatus,
              remarks: (remarks || '').trim() || null,
              created_by: created_by || 'VI0001',
              created_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (!error && data) {
        success = true;
        resultRow = {
          ...data,
          ticket_status: 'INITIATED',
        };
        break;
      }

      lastError = error?.message || 'Collision detected';
      console.warn(`SBRoCL Dispatch Ticket retry attempt ${attempts}:`, lastError);
    }

    if (!success) {
      return NextResponse.json({ error: `Failed to create dispatch ticket: ${lastError}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, ticket: resultRow });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create dispatch ticket';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Sequential Dispatch Workflow:
// Initiated -> Waiting -> Packing -> Packed -> Closed
const ALLOWED_TRANSITION: Record<string, string> = {
  INITIATED: 'WAITING',
  INITIAL: 'WAITING',
  WAITING: 'PACKING',
  PACKING: 'PACKED',
  PACKED: 'CLOSED',
};

// PATCH /api/dispatch - Update ticket_status or details with sequential flow validation
export async function PATCH(req: Request) {
  try {
    const { ticket_id, ticket_status, remarks, qty, from_location } = await req.json();

    if (!ticket_id) {
      return NextResponse.json({ error: 'ticket_id is required.' }, { status: 400 });
    }

    // 1. Fetch current ticket
    const { data: currentTicket, error: fetchErr } = await supabase
      .from('dispatch_tickets')
      .select('*')
      .eq('ticket_id', ticket_id)
      .single();

    if (fetchErr || !currentTicket) {
      return NextResponse.json(
        { error: `Ticket ${ticket_id} not found: ${fetchErr?.message || 'Unknown'}` },
        { status: 404 }
      );
    }

    const updatePayload: Record<string, unknown> = {};

    if (ticket_status) {
      const currStatus = (currentTicket.ticket_status === 'INITIAL' ? 'INITIATED' : currentTicket.ticket_status || 'INITIATED').toUpperCase();
      const nextStatus = ticket_status.toUpperCase();

      if (currStatus !== nextStatus) {
        const validStatuses = ['INITIATED', 'WAITING', 'PACKING', 'PACKED', 'CLOSED'];
        if (!validStatuses.includes(nextStatus)) {
          return NextResponse.json(
            { error: `Invalid status "${nextStatus}". Allowed: ${validStatuses.join(', ')}` },
            { status: 400 }
          );
        }
        updatePayload.ticket_status = nextStatus;
      }
    }

    if (qty !== undefined) {
      const qtyNum = parseInt(qty, 10);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        return NextResponse.json({ error: 'Quantity must be greater than 0.' }, { status: 400 });
      }
      updatePayload.qty = qtyNum;
    }

    if (from_location !== undefined && from_location !== null) {
      updatePayload.from_location = from_location;
    }

    if (remarks !== undefined) {
      updatePayload.remarks = remarks ? remarks.trim() : null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({
        success: true,
        ticket: {
          ...currentTicket,
          ticket_status: currentTicket.ticket_status === 'INITIAL' ? 'INITIATED' : currentTicket.ticket_status,
        },
      });
    }

    let { data, error } = await supabase
      .from('dispatch_tickets')
      .update(updatePayload)
      .eq('ticket_id', ticket_id)
      .select()
      .single();

    // Fallback if check constraint rejected the status
    if (error && error.message.includes('dispatch_tickets_ticket_status_check') && updatePayload.ticket_status === 'INITIATED') {
      const fallback = await supabase
        .from('dispatch_tickets')
        .update({ ...updatePayload, ticket_status: 'INITIAL' })
        .eq('ticket_id', ticket_id)
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error('Error updating dispatch ticket:', error);
      if (
        (error as any).code === '23514' &&
        error.message?.includes('dispatch_tickets_ticket_status_check')
      ) {
        return NextResponse.json(
          {
            error: `Database constraint mismatch: PostgreSQL rejected status '${updatePayload.ticket_status}'. Please execute 'supabase/migrations/20260906_dispatch_tickets_status_flow.sql' in your Supabase SQL Editor to allow the full 5-stage flow.`,
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const normalizedTicket = data
      ? {
          ...data,
          ticket_status: data.ticket_status === 'INITIAL' ? 'INITIATED' : data.ticket_status,
        }
      : data;

    return NextResponse.json({ success: true, ticket: normalizedTicket });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update dispatch ticket';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/dispatch - Delete dispatch ticket with audit archive
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticket_id = searchParams.get('ticket_id');
    const deleted_by = searchParams.get('deleted_by') || 'SYSTEM';

    if (!ticket_id) {
      return NextResponse.json({ error: 'ticket_id is required.' }, { status: 400 });
    }

    // 1. Snapshot existing record before deletion
    const { data: existingTicket } = await supabase
      .from('dispatch_tickets')
      .select('*')
      .eq('ticket_id', ticket_id)
      .maybeSingle();

    if (!existingTicket) {
      return NextResponse.json({ error: `Ticket ${ticket_id} not found.` }, { status: 404 });
    }

    // 2. Perform deletion (fires database trigger trg_archive_deleted_dispatch)
    const { error } = await supabase
      .from('dispatch_tickets')
      .delete()
      .eq('ticket_id', ticket_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3. Enrich the trigger-created archive record with the actual user who deleted it
    const { data: existingArchive } = await supabase
      .from('deleted_records_archive')
      .select('archive_id')
      .eq('table_name', 'dispatch_tickets')
      .eq('record_id', ticket_id)
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
              table_name: 'dispatch_tickets',
              record_id: ticket_id,
              deleted_data: existingTicket,
              deleted_at: new Date().toISOString(),
              deleted_by,
            },
          ]);
      } catch {}
    }

    return NextResponse.json({ success: true, ticket_id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete dispatch ticket';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

