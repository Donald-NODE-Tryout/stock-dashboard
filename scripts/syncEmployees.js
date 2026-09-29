const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function syncAllEmployees() {
  console.log('Fetching employees from employee_register...');
  const { data: employees, error } = await supabase
    .from('employee_register')
    .select('*');

  if (error || !employees) {
    console.error('Error fetching employees:', error);
    return;
  }

  console.log(`Found ${employees.length} employees.`);

  for (const emp of employees) {
    // 1. Determine username (first 3 letters of first name + employee_id)
    let username = emp.username;
    if (!username) {
      const firstName = (emp.employee_name || '').trim().split(' ')[0] || 'EMP';
      const prefix = firstName.substring(0, 3);
      username = `${prefix}${emp.employee_id}`;
    }

    const syntheticEmail = `${username.toLowerCase()}@system.local`;
    console.log(`\nSyncing: ${emp.employee_name} (${emp.employee_id}) -> Username: ${username} | Email: ${syntheticEmail}`);

    // 2. Create user via official Supabase Admin API
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: syntheticEmail,
      password: username, // Default password = username
      email_confirm: true,
      user_metadata: {
        username: username,
        employee_id: emp.employee_id,
        employee_name: emp.employee_name,
        role: emp.role || 'STAFF',
      },
    });

    if (createErr) {
      console.warn(`  Notice during createUser for ${syntheticEmail}:`, createErr.message);
    }

    const newAuthId = created?.user?.id;
    if (newAuthId) {
      console.log(`  Created Auth User ID: ${newAuthId}`);
      const { error: updateErr } = await supabase
        .from('employee_register')
        .update({
          username: username,
          auth_user_id: newAuthId,
        })
        .eq('employee_id', emp.employee_id);

      if (updateErr) {
        console.error(`  Error updating employee_register:`, updateErr);
      } else {
        console.log(`  Linked employee_register with auth_user_id.`);
      }
    }
  }

  console.log('\nSync completed successfully.');
}

syncAllEmployees();
