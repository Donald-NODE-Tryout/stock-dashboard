import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export const dynamic = 'force-dynamic';

// --- SBRoCL for Employee ID (VI/EMP/1, VI/EMP/2, VI/EMP/3...) ---
async function generateNextEmployeeId(prefix: string = 'VI/EMP/'): Promise<string> {
  const { data, error } = await supabase
    .from('employee_register')
    .select('employee_id');

  if (error || !data || data.length === 0) {
    return `${prefix}1`;
  }

  let maxNum = 0;
  for (const row of data) {
    const idStr = String(row.employee_id || '');
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

// GET /api/employees
export async function GET() {
  try {
    const { data: employees, error } = await supabase
      .from('employee_register')
      .select('*')
      .order('employee_id', { ascending: true });

    if (error) {
      console.error('Error fetching employees:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ employees: employees || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch employees';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/employees - Add new employee & provision Supabase Auth
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      employee_id: customEmpId,
      employee_name,
      role = 'STAFF',
      whatsapp_number,
      date_of_employment,
      employment_status = 'ACTIVE',
    } = body;

    const cleanName = (employee_name || '').trim();
    if (!cleanName) {
      return NextResponse.json({ error: 'Employee Full Name is required.' }, { status: 400 });
    }

    // Validate WhatsApp / Phone Number (must be exactly 10 numerical digits if provided)
    const cleanPhone = (whatsapp_number || '').toString().trim();
    if (cleanPhone) {
      if (!/^\d{10}$/.test(cleanPhone)) {
        return NextResponse.json(
          { error: 'WhatsApp / Phone Number must be exactly 10 numerical digits.' },
          { status: 400 }
        );
      }
    }

    // 1. Generate or use specified Employee ID
    let finalEmpId = (customEmpId || '').trim();
    if (!finalEmpId) {
      finalEmpId = await generateNextEmployeeId('VI/EMP/');
    }

    // 2. Generate Username formula: first 3 characters of first name + clean employee_id (e.g. JOHVIEMP2)
    const firstName = cleanName.split(' ')[0] || 'EMP';
    const prefix = firstName.substring(0, 3);
    const cleanId = finalEmpId.replace(/[^a-zA-Z0-9]/g, '');
    const username = `${prefix}${cleanId}`;
    const syntheticEmail = `${username.toLowerCase()}@system.local`;

    // 3. Provision Supabase Auth account
    let authUserId: string | null = null;
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: syntheticEmail,
      password: username, // Default password = username
      email_confirm: true,
      user_metadata: {
        username: username,
        employee_id: finalEmpId,
        employee_name: cleanName,
        role: role,
      },
    });

    if (authData?.user?.id) {
      authUserId = authData.user.id;
    } else if (authErr) {
      console.warn('Notice during auth account creation:', authErr.message);
    }

    // 4. Insert into employee_register
    const today = new Date().toISOString().split('T')[0];
    const { data: newEmployee, error: insertErr } = await supabase
      .from('employee_register')
      .insert([
        {
          employee_id: finalEmpId,
          employee_name: cleanName,
          role: role || 'STAFF',
          whatsapp_number: cleanPhone || null,
          date_of_employment: date_of_employment || today,
          date_of_relief: null,
          employment_status: employment_status || 'ACTIVE',
          username: username,
          auth_user_id: authUserId,
        },
      ])
      .select()
      .single();

    if (insertErr) {
      console.error('Error inserting employee:', insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      employee: newEmployee,
      username: username,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create employee';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/employees - Update employee details or employment_status
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const {
      employee_id,
      employee_name,
      role,
      whatsapp_number,
      employment_status,
      date_of_relief,
    } = body;

    if (!employee_id) {
      return NextResponse.json({ error: 'employee_id is required.' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (employee_name !== undefined) updatePayload.employee_name = employee_name.trim();
    if (role !== undefined) updatePayload.role = role;
    if (whatsapp_number !== undefined) {
      const cleanPhone = (whatsapp_number || '').toString().trim();
      if (cleanPhone) {
        if (!/^\d{10}$/.test(cleanPhone)) {
          return NextResponse.json(
            { error: 'WhatsApp / Phone Number must be exactly 10 numerical digits.' },
            { status: 400 }
          );
        }
        updatePayload.whatsapp_number = cleanPhone;
      } else {
        updatePayload.whatsapp_number = null;
      }
    }
    if (employment_status !== undefined) updatePayload.employment_status = employment_status;
    if (date_of_relief !== undefined) updatePayload.date_of_relief = date_of_relief || null;

    const { data: updatedEmployee, error } = await supabase
      .from('employee_register')
      .update(updatePayload)
      .eq('employee_id', employee_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating employee:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, employee: updatedEmployee });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update employee';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/employees - Delete employee record with audit archive
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const employee_id = searchParams.get('employee_id');
    const deleted_by = searchParams.get('deleted_by') || 'SYSTEM';

    if (!employee_id) {
      return NextResponse.json({ error: 'employee_id is required.' }, { status: 400 });
    }

    // 1. Snapshot for audit retention
    const { data: existingEmployee } = await supabase
      .from('employee_register')
      .select('*')
      .eq('employee_id', employee_id)
      .maybeSingle();

    if (!existingEmployee) {
      return NextResponse.json({ error: `Employee ${employee_id} not found.` }, { status: 404 });
    }

    // 2. Perform deletion (fires database trigger trg_archive_deleted_employee)
    const { error } = await supabase
      .from('employee_register')
      .delete()
      .eq('employee_id', employee_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3. Enrich the trigger-created archive record with the actual user who deleted it
    const { data: existingArchive } = await supabase
      .from('deleted_records_archive')
      .select('archive_id')
      .eq('table_name', 'employee_register')
      .eq('record_id', employee_id)
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
              table_name: 'employee_register',
              record_id: employee_id,
              deleted_data: existingEmployee,
              deleted_at: new Date().toISOString(),
              deleted_by,
            },
          ]);
      } catch {}
    }

    return NextResponse.json({ success: true, employee_id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete employee';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

