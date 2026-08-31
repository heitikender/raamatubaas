import Link from 'next/link';
import { serverClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Row = { id: string; name: string; publisher: string | null; book_count: number };

export default async function SeriesIndex() {
  const sb = serverClient();
  const { data: series } = await sb
    .from('series_with_counts')
    .select('id,name,publisher,book_count')
    .gt('book_count', 0)
    .order('book_count', { ascending: false })
    .limit(1000);

  const rows = (series ?? []) as Row[];

  return (
    <>
      <h1>Sarjad</h1>
      <p className="muted">
        {rows.length.toLocaleString('et-EE')} sarja, milles on baasis raamatuid — suuremad eespool.
      </p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Sari</th><th>Kirjastus</th><th>Raamatuid</th></tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id}>
                <td><Link href={`/sari/${s.id}`}><b>{s.name}</b></Link></td>
                <td>{s.publisher ?? '—'}</td>
                <td className="rl-year">{s.book_count.toLocaleString('et-EE')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
