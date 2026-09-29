-- ==============================================================================
-- ENTERPRISE AUTHENTICATION SYSTEM MIGRATION
-- Bridges employee_register with Supabase Auth (auth.users) via synthetic emails
-- Formula: Username = SUBSTRING(first_name, 1, 3) || clean_employee_id (e.g. RahVIEMP2)
--          Synthetic Email = LOWER(username) || '@system.local'
-- ==============================================================================

-- 1. Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Add username and auth reference to employee_register
ALTER TABLE employee_register 
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Update all existing employees with their generated username
UPDATE employee_register
SET username = SUBSTRING(SPLIT_PART(TRIM(employee_name), ' ', 1), 1, 3) || employee_id
WHERE username IS NULL;

-- 4. Function to create auth.users entry and link back to employee_register
CREATE OR REPLACE FUNCTION sync_employee_auth_account()
RETURNS TRIGGER AS $$
DECLARE
  new_auth_id UUID;
  user_email TEXT;
  user_password TEXT;
BEGIN
  -- Generate username if not already provided
  IF NEW.username IS NULL OR NEW.username = '' THEN
    NEW.username := SUBSTRING(SPLIT_PART(TRIM(NEW.employee_name), ' ', 1), 1, 3) || NEW.employee_id;
  END IF;

  user_email := LOWER(NEW.username) || '@system.local';
  user_password := NEW.username; -- Default password = username

  -- Check if auth user already exists
  SELECT id INTO new_auth_id FROM auth.users WHERE email = user_email;

  -- Create auth user if not present
  IF new_auth_id IS NULL THEN
    new_auth_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_auth_id,
      'authenticated',
      'authenticated',
      user_email,
      crypt(user_password, gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('username', NEW.username, 'employee_id', NEW.employee_id, 'employee_name', NEW.employee_name),
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    );

    -- Insert standard identity record with provider_id
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      new_auth_id::text,
      new_auth_id,
      jsonb_build_object('sub', new_auth_id::text, 'email', user_email),
      'email',
      NOW(),
      NOW(),
      NOW()
    );
  END IF;

  NEW.auth_user_id := new_auth_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger to automatically provision logins whenever a new employee is added
DROP TRIGGER IF EXISTS trigger_sync_employee_auth ON employee_register;
CREATE TRIGGER trigger_sync_employee_auth
BEFORE INSERT ON employee_register
FOR EACH ROW
EXECUTE FUNCTION sync_employee_auth_account();

-- 6. Batch sync any existing employees into auth.users
DO $$
DECLARE
  emp RECORD;
  generated_auth_id UUID;
  synthetic_email TEXT;
BEGIN
  FOR emp IN SELECT * FROM employee_register WHERE auth_user_id IS NULL LOOP
    synthetic_email := LOWER(emp.username) || '@system.local';
    
    SELECT id INTO generated_auth_id FROM auth.users WHERE email = synthetic_email;
    
    IF generated_auth_id IS NULL THEN
      generated_auth_id := gen_random_uuid();
      
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', generated_auth_id, 'authenticated', 'authenticated',
        synthetic_email, crypt(emp.username, gen_salt('bf')),
        NOW(), '{"provider":"email","providers":["email"]}',
        jsonb_build_object('username', emp.username, 'employee_id', emp.employee_id),
        NOW(), NOW()
      );

      INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), generated_auth_id::text, generated_auth_id,
        jsonb_build_object('sub', generated_auth_id::text, 'email', synthetic_email),
        'email', NOW(), NOW(), NOW()
      );
    END IF;

    UPDATE employee_register SET auth_user_id = generated_auth_id WHERE employee_id = emp.employee_id;
  END LOOP;
END $$;
