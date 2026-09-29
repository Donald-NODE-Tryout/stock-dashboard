'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export interface EmployeeProfile {
  employee_id: string;
  employee_name: string;
  role: string;
  employment_status: string;
  username?: string;
  auth_user_id?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: EmployeeProfile | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Helper to fetch employee profile linked to auth_user_id or username
  const fetchEmployeeProfile = useCallback(async (authUser: User): Promise<EmployeeProfile | null> => {
    if (!supabase) return null;

    try {
      // 1. Try resolving by auth_user_id
      const { data: byAuthId, error: authIdErr } = await supabase
        .from('employee_register')
        .select('employee_id, employee_name, role, employment_status, username, auth_user_id')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (byAuthId && !authIdErr) {
        return byAuthId as EmployeeProfile;
      }

      // 2. Fallback: Parse username from synthetic email (e.g. donvi0001@system.local -> donvi0001)
      const email = authUser.email || '';
      const syntheticUsername = email.replace(/@system\.local$/i, '').trim();

      if (syntheticUsername) {
        const { data: byUsername, error: userErr } = await supabase
          .from('employee_register')
          .select('employee_id, employee_name, role, employment_status, username, auth_user_id')
          .ilike('username', syntheticUsername)
          .maybeSingle();

        if (byUsername && !userErr) {
          // Self-heal link if auth_user_id wasn't set yet
          if (!byUsername.auth_user_id) {
            await supabase
              .from('employee_register')
              .update({ auth_user_id: authUser.id })
              .eq('employee_id', byUsername.employee_id);
          }
          return byUsername as EmployeeProfile;
        }
      }

      // 3. Fallback: check raw_user_meta_data from auth.users
      const meta = authUser.user_metadata;
      if (meta?.employee_id) {
        const { data: byEmpId } = await supabase
          .from('employee_register')
          .select('employee_id, employee_name, role, employment_status, username, auth_user_id')
          .eq('employee_id', meta.employee_id)
          .maybeSingle();

        if (byEmpId) {
          return byEmpId as EmployeeProfile;
        }
      }

      return null;
    } catch (err) {
      console.error('Error fetching employee profile:', err);
      return null;
    }
  }, []);

  // Initial session hydration
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      if (!supabase) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Error retrieving session:', sessionError);
        }

        if (initialSession?.user) {
          const empProfile = await fetchEmployeeProfile(initialSession.user);

          // Active Status Guard: Revoke session if marked INACTIVE
          if (empProfile?.employment_status && empProfile.employment_status.toUpperCase() === 'INACTIVE') {
            console.warn('Deactivated employee session detected. Revoking access...');
            await supabase.auth.signOut();
            if (isMounted) {
              setUser(null);
              setSession(null);
              setProfile(null);
              setIsLoading(false);
            }
            return;
          }

          if (isMounted) {
            setSession(initialSession);
            setUser(initialSession.user);
            setProfile(empProfile);
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    // Listen for auth state changes
    const { data: authListener } = supabase?.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_OUT' || !currentSession) {
        setUser(null);
        setSession(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      if (currentSession?.user) {
        setSession(currentSession);
        setUser(currentSession.user);

        const empProfile = await fetchEmployeeProfile(currentSession.user);

        // Active Status Guard
        if (empProfile?.employment_status && empProfile.employment_status.toUpperCase() === 'INACTIVE') {
          console.warn('Inactive account login attempted. Logging out...');
          if (supabase) {
            await supabase.auth.signOut();
          }
          setUser(null);
          setSession(null);
          setProfile(null);
        } else {
          setProfile(empProfile);
        }
      }

      setIsLoading(false);
    }) || { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [fetchEmployeeProfile]);

  // Login handler
  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (!supabase) {
      return { success: false, error: 'Database connection is currently unavailable.' };
    }

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      return { success: false, error: 'Please enter your enterprise username.' };
    }

    if (!password) {
      return { success: false, error: 'Please enter your password.' };
    }

    // Step 2: Synthetic Identity Translation: LOWER(username) + "@system.local"
    const syntheticEmail = `${cleanUsername.toLowerCase()}@system.local`;

    try {
      setIsLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: password,
      });

      let signInData = data;
      let signInError = error;

      // Automatic JIT (Just-In-Time) provisioning for newly added or future employees
      if (signInError) {
        try {
          const provRes = await fetch('/api/auth/provision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: cleanUsername }),
          });

          if (provRes.ok) {
            // Retry sign-in immediately with the freshly provisioned credentials
            const retry = await supabase.auth.signInWithPassword({
              email: syntheticEmail,
              password: password,
            });
            signInData = retry.data;
            signInError = retry.error;
          }
        } catch {
          // Fall through to error reporting
        }
      }

      if (signInError) {
        let userMessage = signInError.message;
        if (signInError.message.toLowerCase().includes('invalid login credentials')) {
          userMessage = 'Invalid username or password. Default initial password is the same as your username.';
        }
        return { success: false, error: userMessage };
      }

      if (!signInData?.user || !signInData?.session) {
        return { success: false, error: 'Authentication failed. Please try again.' };
      }

      // Step 5: Profile Resolution
      const empProfile = await fetchEmployeeProfile(signInData.user);

      // Step 5: Active Status Guard
      if (empProfile?.employment_status && empProfile.employment_status.toUpperCase() === 'INACTIVE') {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'This account has been deactivated. Please contact your system administrator.',
        };
      }

      setUser(data.user);
      setSession(data.session);
      setProfile(empProfile);

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected login error occurred.';
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  // Logout handler
  const logout = async () => {
    try {
      setIsLoading(true);
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Error during sign out:', err);
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      setIsLoading(false);
    }
  };

  // Refresh profile handler
  const refreshProfile = async () => {
    if (user) {
      const refreshed = await fetchEmployeeProfile(user);
      setProfile(refreshed);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      session: null,
      profile: null,
      isLoading: false,
      login: async () => ({ success: false, error: 'AuthProvider not initialized' }),
      logout: async () => {},
      refreshProfile: async () => {},
    };
  }
  return context;
}
