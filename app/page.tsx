import Link from 'next/link';
import { serverClient } from '@/lib/supabase';
import BookCard from '@/components/BookCard';
import SeriesSearch from '@/components/SeriesSearch';
import GenreSearch from '@/components/GenreSearch';
import { VERSION } from '@/lib/version';
import type { Book } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PER = 100;

type Search = {
  q?: string; sari?: string; aasta?: string;
  kirjastus?: string; zanr?: string; lk?: string;
};

export default async function Home({ searchParams }: { searchParams: Search }) {
  const sb = serverClient();
  const q = (searchParams.q ?? '').trim();
  const sari = (searchParams.sari ?? '').trim();
  const aasta = (searchParams.aasta ?? '').trim();
  const kirjastus = (searchParams.kirjastus ?? '').trim();
  const zanr = (searchParams.zanr ?? '').trim();
  const lk = Math.max(1, parseInt(searchParams.lk ?? '1', 10) || 1);

  const hasFilter = Boolean(q || sari || aasta || kirjastus || zanr);

  let books: Book[] = [];
  let total = 0;
  let error: { message: string } | null = null;

  if (hasFilter) {
    let query = sb
      .from('books')
      .select('*, series(id,name)', { count: 'exact' })
      .order('pub_year', { ascending: true })
      .order('title', { ascending: true })
      .range((lk - 1) * PER, lk * PER - 1);

    if (q) {
      const parts = [`title.ilike.%${q}%`, `authors_text.ilike.%${q}%`];
      const isbnClean = q.replace(/[^0-9Xx]/g, '');
      if (isbnClean.length >= 5) parts.push(`isbn.ilike.%${isbnClean}%`);
      query = query.or(parts.join(','));
    }
    if (sari) query = query.eq('series_id', sari);
    if (kirjastus) query = query.eq('publisher', kirjastus);
    if (zanr) query = query.eq('genre', zanr);
    if (aasta) {
      const [a, b] = aasta.split('-');
      if (a) query = query.gte('pub_year', Number(a));
      query = query.lte('pub_year', Number(b || a));
    }
    const res = await query;
    books = (res.data ?? []) as Book[];
    total = res.count ?? 0;
    error = res.error;
  } else {
    const res = await sb
      .from('books')
      .select('*, series(id,name)')
      .not('cover_front_url', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(10);
    books = (res.data ?? []) as Book[];
    error = res.error;
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [seriesRes, { count }, visitsRes] = await Promise.all([
    sari
      ? sb.from('series').select('name').eq('id', sari).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from('books').select('*', { count: 'exact', head: true }),
    sb.from('visits').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo)
  ]);
  const currentSeriesName = (seriesRes.data as { name?: string } | null)?.name ?? '';
  const visitsWeek = visitsRes.count ?? 0;

  const pages = Math.ceil(total / PER);

  // aktiivsete filtrite kirjeldus + URL järgmise lehe jaoks
  const baseParams = new URLSearchParams();
  if (q) baseParams.set('q', q);
  if (sari) baseParams.set('sari', sari);
  if (aasta) baseParams.set('aasta', aasta);
  if (kirjastus) baseParams.set('kirjastus', kirjastus);
  if (zanr) baseParams.set('zanr', zanr);
  const pageUrl = (n: number) => {
    const p = new URLSearchParams(baseParams);
    if (n > 1) p.set('lk', String(n));
    return `/?${p.toString()}`;
  };
  return (
    <>
      <h1>Eesti keeles ilmunud raamatud</h1>
      <p className="muted">
        Andmebaasis on {(count ?? 0).toLocaleString('et-EE')} raamatut — originaalid ja tõlked, kaanepiltide, tiraažide ja allikaviidetega.
      </p>
      <p className="muted small">
        Külastusi viimasel nädalal: {visitsWeek.toLocaleString('et-EE')} · versioon {VERSION}
      </p>

      <form className="toolbar" method="get">
        <input type="search" name="q" placeholder="Otsi pealkirja, autorit või ISBN-i…" defaultValue={q} />
        <SeriesSearch initialId={sari} initialLabel={currentSeriesName} />
        <GenreSearch initialValue={zanr} />
        <input name="aasta" placeholder="Aasta, nt 1970-1991" defaultValue={aasta} />
        <button className="btn" type="submit">Otsi</button>
      </form>

      {kirjastus && (
        <p className="chips">
          <span className="chip">Kirjastus: <b>{kirjastus}</b> <Link href="/">✕</Link></span>
        </p>
      )}

      {error && <p className="notice err">Viga andmebaasist lugemisel: {error.message}</p>}

      {hasFilter ? (
        <>
          <h2>Otsingutulemused</h2>
          <p className="muted small">
            {total.toLocaleString('et-EE')} vastet{pages > 1 ? ` · lehekülg ${lk}/${pages}` : ''}
          </p>
          <div className="tablewrap">
            <table className="rlist">
              <tbody>
                {books.map(b => (
                  <tr key={b.id}>
                    <td className="rl-cover">
                      {b.cover_front_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={b.cover_front_url} alt="" loading="lazy" />
                        : <span className="rl-nocover">—</span>}
                    </td>
                    <td className="rl-main">
                      <Link href={`/raamat/${b.id}`} className="rl-title">{b.title}</Link>
                      <span className="rl-auth">{(b.authors ?? []).join(', ')}</span>
                    </td>
                    <td className="rl-year">{b.pub_year ?? ''}</td>
                    <td className="rl-series">{b.series?.name ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav className="pager">
              {lk > 1 && <Link className="btn secondary" href={pageUrl(lk - 1)}>← Eelmine</Link>}
              <span className="muted small">lehekülg {lk} / {pages}</span>
              {lk < pages && <Link className="btn secondary" href={pageUrl(lk + 1)}>Järgmine →</Link>}
            </nav>
          )}

          {books.length === 0 && !error && (
            <p className="muted">Ühtegi raamatut ei leitud. Proovi teist otsingut.</p>
          )}
        </>
      ) : (
        <>
          <h2>Viimati uuendatud</h2>
          <p className="muted small">Kümme viimati täiendatud raamatut, millel on kaanepilt olemas.</p>
          <div className="grid">
            {books.map(b => <BookCard key={b.id} book={b} />)}
          </div>
        </>
      )}
    </>
  );
}
