'use client';

import { useEffect, useState, useCallback } from 'react';
import { browserClient } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export type Role = 'anon' | 'user' | 'editor' | 'superadmin';

/** Ühtne sessiooni + rolli hook. */
export function useRole() {
  const sb = browserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>('anon');
  const [loading, setLoading] = useState(true);

  const loadRole = useCallback(async (email?: string | null) => {
    if (!email) { setRole('anon'); return; }
    const { data } = await sb.from('editors').select('role').eq('user_email', email).maybeSingle();
    if (!data) setRole('user');
    else setRole((data.role as Role) === 'superadmin' ? 'superadmin' : 'editor');
  }, [sb]);

  useEffect(() => {
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadRole(data.session?.user?.email);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      await loadRole(s?.user?.email);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, loadRole]);

  const email = session?.user?.email ?? null;
  const isEditor = role === 'editor' || role === 'superadmin';
  const isSuperadmin = role === 'superadmin';

  function login() {
    sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.href : undefined }
    });
  }
  function logout() { sb.auth.signOut(); }

  return { sb, session, email, role, isEditor, isSuperadmin, loading, login, logout,
           refresh: () => loadRole(email) };
}

export function LoginButton({ label = "Logi sisse Google'iga" }: { label?: string }) {
  const { login } = useRole();
  return <button className="btn" onClick={login}>{label}</button>;
}
