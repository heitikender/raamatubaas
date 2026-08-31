import { serverClient } from '@/lib/supabase';
import BookCard from '@/components/BookCard';
import type { Book } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Search = { q?: string; sari?: string; aasta?: string };

export default async function Home({ searchParams }: { searchParams: Search }) {
  const sb = serverClient();
  const q = (searchParams.q ?? '').trim();
  const sari = (searchParams.sari ?? '').trim();
  const aasta = (searchParams.aasta ?? '').trim();

  let query = sb
    .from('books')
    .select('*, series(*)')
    .order('pub_year', { ascending: true })
    .order('title', { ascending: true })
    .limit(500);

  if (q) query = query.or(`title.ilike.%${q}%,authors.cs.{${q}}`);
  if (sari) query = query.eq('series_id', sari);
  if (aasta) {
    const [a, b] = aasta.split('-');
    if (a) query = query.gte('pub_year', Number(a));
    query = query.lte('pub_year', Number(b || a));
  }

  const [{ data: books, error }, { data: seriesList }, { count }] = await Promise.all([
    query,
    sb.from('series').select('*').order('name'),
    sb.from('books').select('*', { count: 'exact', head: true })
  ]);

  return (
    <>
      <h1>Eesti keeles ilmunud raamatud</h1>
      <p className="muted">
        Andmebaasis on {(count ?? 0).toLocaleString('et-EE')} raamatut — originaalid ja tõlked, kaanepiltide, tiraažide ja allikaviidetega.
      </p>

      <form className="toolbar" method="get">
        <input type="search" name="q" placeholder="Otsi pealkirja või autorit…" defaultValue={q} />
        <select name="sari" defaultValue={sari}>
          <option value="">— kõik sarjad —</option>
          {(seriesList ?? []).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input name="aasta" placeholder="Aasta või vahemik, nt 1970-1991" defaultValue={aasta} />
        <button className="btn" type="submit">Otsi</button>
      </form>

      {error && <p className="notice err">Viga andmebaasist lugemisel: {error.message}</p>}

      <div className="grid">
        {((books ?? []) as Book[]).map(b => <BookCard key={b.id} book={b} />)}
      </div>

      {(books ?? []).length === 0 && !error && (
        <p className="muted">Ühtegi raamatut ei leitud. Kui baas on alles tühi, käivita seemendusskript (vt README).</p>
      )}
    </>
  );
}
