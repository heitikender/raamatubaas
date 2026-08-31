import Link from 'next/link';
import { serverClient } from '@/lib/supabase';

export const revalidate = 60;

export default async function SeriesIndex() {
  const sb = serverClient();
  const { data: series } = await sb.from('series').select('*').order('name');
  const { data: counts } = await sb.from('books').select('series_id');

  const countMap = new Map<string, number>();
  (counts ?? []).forEach(r => {
    if (r.series_id) countMap.set(r.series_id, (countMap.get(r.series_id) ?? 0) + 1);
  });

  return (
    <>
      <h1>Sarjad</h1>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Sari</th><th>Kirjastus</th><th>Raamatuid baasis</th></tr></thead>
          <tbody>
            {(series ?? []).map(s => (
              <tr key={s.id}>
                <td><Link href={`/sari/${s.id}`}><b>{s.name}</b></Link></td>
                <td>{s.publisher ?? '—'}</td>
                <td>{countMap.get(s.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
