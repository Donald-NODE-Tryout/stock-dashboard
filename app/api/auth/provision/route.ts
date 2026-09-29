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

export async function POST(req: Request) {
  try {
    const { username } = await req.json();
    const cleanUsername = (username || '').trim();

    if (!cleanUsername) {
      return NextResponse.json({ error: 'Username is required.' }, { status: 400 });
    }

    // 1. Look up employee in employee_register by username or generated pattern
    let { data: employee, error: empErr } = await supabase
      .from('employee_register')
      .select('*')
      .ilike('username', cleanUsername)
      .maybeSingle();

    // If not found by username column, match by formula: first 3 letters of first name + employee_id
    if (!employee) {
      const { data: allEmployees } = await supabase
        .from('employee_register')
        .select('*');

      if (allEmployees) {
        employee = allEmployees.find((e) => {
          const firstName = (e.employee_name || '').trim().split(' ')[0] || '';
          const candidate = `${firstName.substring(0, 3)}${e.employee_id}`.toLowerCase();
          return candidate === cleanUsername.toLowerCase();
        });
      }
    }

    if (!employee) {
      return NextResponse.json({ error: 'Employee record not found.' }, { status: 404 });
    }

    if (employee.employment_status && employee.employment_status.toUpperCase() === 'INACTIVE') {
      return NextResponse.json({ error: 'This account has been deactivated.' }, { status: 403 });
    }

    // 2. Determine standard username and synthetic email
    const firstName = (employee.employee_name || '').trim().split(' ')[0] || 'EMP';
    const computedUsername = `${firstName.substring(0, 3)}${employee.employee_id}`;
    const syntheticEmail = `${computedUsername.toLowerCase()}@system.local`;

    // 3. Create or update auth user using official Supabase Admin API
    const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
      email: syntheticEmail,
      password: computedUsername, // Default password = username
      email_confirm: true,
      user_metadata: {
        username: computedUsername,
        employee_id: employee.employee_id,
        employee_name: employee.employee_name,
        role: employee.role || 'STAFF',
      },
    });

    if (createErr && !createErr.message.toLowerCase().includes('already registered')) {
      console.error('Error provisioning auth user:', createErr);
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }

    const authId = createdUser?.user?.id;

    // 4. Update employee_register with username and auth_user_id
    await supabase
      .from('employee_register')
      .update({
        username: computedUsername,
        ...(authId ? { auth_user_id: authId } : {}),
      })
      .eq('employee_id', employee.employee_id);

    return NextResponse.json({
      success: true,
      username: computedUsername,
      email: syntheticEmail,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Provisioning failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
