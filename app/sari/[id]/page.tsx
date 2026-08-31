import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import type { Book } from '@/lib/types';

export const revalidate = 60;

export default async function SeriesPage({ params }: { params: { id: string } }) {
  const sb = serverClient();
  const { data: series } = await sb.from('series').select('*').eq('id', params.id).maybeSingle();
  if (!series) notFound();

  const { data: books } = await sb
    .from('books')
    .select('*')
    .eq('series_id', series.id)
    .order('series_position', { ascending: true, nullsFirst: false })
    .order('pub_year', { ascending: true });

  return (
    <>
      <h1>{series.name}</h1>
      {series.publisher && <p className="muted">{series.publisher}</p>}
      {series.description && <p>{series.description}</p>}

      <div className="tablewrap">
        <table>
          <thead><tr><th>Nr</th><th>Kaas</th><th>Aasta</th><th>Autor</th><th>Pealkiri</th></tr></thead>
          <tbody>
            {((books ?? []) as Book[]).map(b => (
              <tr key={b.id}>
                <td>{b.series_position ?? ''}</td>
                <td style={{ width: 56 }}>
                  {b.cover_front_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.cover_front_url} alt="" style={{ width: 44, border: '1px solid var(--line)' }} />
                  )}
                </td>
                <td>{b.pub_year ?? ''}</td>
                <td>{b.authors.join(', ')}</td>
                <td><Link href={`/raamat/${b.id}`}><b>{b.title}</b></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
