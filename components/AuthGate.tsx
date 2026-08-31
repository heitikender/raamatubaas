'use client';

import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export function useEditorSession() {
  const sb = browserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isEditor, setIsEditor] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session?.user?.email) { setIsEditor(null); return; }
    sb.from('editors').select('user_email').eq('user_email', session.user.email).maybeSingle()
      .then(({ data }) => setIsEditor(!!data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  return { sb, session, isEditor, loading };
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { sb, session, isEditor, loading } = useEditorSession();

  if (loading) return <p className="muted">Laen…</p>;

  if (!session) {
    return (
      <div className="notice">
        <p>Toimetamiseks logi sisse Google'i kontoga.</p>
        <button
          className="btn"
          onClick={() =>
            sb.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: typeof window !== 'undefined' ? window.location.href : undefined }
            })
          }
        >
          Logi sisse Google'iga
        </button>
      </div>
    );
  }

  if (isEditor === false) {
    return (
      <div className="notice err">
        <p>Konto <b>{session.user.email}</b> ei ole toimetajate nimekirjas.
          Baasi saab vaadata igaüks, muuta ainult lubatud kontod.</p>
        <button className="btn secondary" onClick={() => sb.auth.signOut()}>Logi välja</button>
      </div>
    );
  }

  return (
    <>
      <p className="muted small">
        Sisse logitud: {session.user.email}{' '}
        <button className="btn secondary" style={{ padding: '3px 10px', marginLeft: 8 }} onClick={() => sb.auth.signOut()}>
          Logi välja
        </button>
      </p>
      {children}
    </>
  );
}
