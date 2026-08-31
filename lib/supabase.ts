import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Serveripoolne (ainult avalik lugemine, RLS: select using(true)).
 *  fetch cache: 'no-store' — muidu puhverdaks Next.js loenduse/päringud igaveseks. */
export function serverClient(): SupabaseClient {
  return createClient(url, anon, {
    auth: { persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' })
    }
  });
}

/** Brauseripoolne singleton — hoiab Google-logini sessiooni. */
let browser: SupabaseClient | null = null;
export function browserClient(): SupabaseClient {
  if (!browser) {
    browser = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return browser;
}
