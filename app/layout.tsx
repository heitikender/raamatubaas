import type { Metadata } from 'next';
import Link from 'next/link';
import { serverClient } from '@/lib/supabase';
import { VERSION } from '@/lib/version';
import './globals.css';

export const metadata: Metadata = {
  title: 'Raamatubaas',
  description: 'Eesti keeles ilmunud raamatute superandmebaas — originaalid ja tõlked, kaanepiltide ja allikaviidetega.'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Päringute arv viimasel 7 päeval (logitakse otsingul, tabelisse visits).
  let queriesWeek = 0;
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { count } = await serverClient()
      .from('visits')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo);
    queriesWeek = count ?? 0;
  } catch { /* loendur pole kriitiline */ }

  return (
    <html lang="et">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=PT+Sans+Narrow:wght@400;700&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" />
      </head>
      <body>
        <header className="masthead">
          <div className="masthead-inner">
            <Link href="/" className="logo">RAAMATUBAAS</Link>
            <nav className="nav">
              <Link href="/">Raamatud</Link>
              <Link href="/sari">Sarjad</Link>
              <Link href="/allikad">Allikad</Link>
              <Link href="/toimeta">Toimeta</Link>
              <Link href="/konto">Konto</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="sitefoot">
          Päringuid viimasel nädalal: {queriesWeek.toLocaleString('et-EE')} · versioon {VERSION}
        </footer>
      </body>
    </html>
  );
}
