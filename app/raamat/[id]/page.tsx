import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverClient } from '@/lib/supabase';
import type { Book, BookSource } from '@/lib/types';

export const revalidate = 60;

const IMG_LABELS: [keyof Book, string][] = [
  ['cover_front_url', 'Esikaas'],
  ['cover_spine_url', 'Selg'],
  ['cover_back_url', 'Tagakaas'],
  ['title_page_url', 'Tiitelleht']
];

export default async function BookPage({ params }: { params: { id: string } }) {
  const sb = serverClient();
  const { data: book } = await sb
    .from('books')
    .select('*, series(*)')
    .eq('id', params.id)
    .maybeSingle<Book>();

  if (!book) notFound();

  const { data: sources } = await sb
    .from('book_sources')
    .select('*, sources(*)')
    .eq('book_id', book.id)
    .order('fetched_at', { ascending: false });

  return (
    <>
      <h1>{book.title}</h1>
      {book.subtitle && <p className="muted">{book.subtitle}</p>}
      <p className="muted">{book.authors.join(', ')}</p>

      <div className="detail">
        <div className="imgcol">
          {IMG_LABELS.map(([field, label]) => {
            const url = book[field] as string | null;
            if (!url) return null;
            return (
              <figure key={field}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`${label}: ${book.title}`} />
                <figcaption>{label}</figcaption>
              </figure>
            );
          })}
          {!book.cover_front_url && <p className="muted small">Pilte pole veel lisatud.</p>}
        </div>

        <div>
          <dl className="meta">
            {book.isbn && <div><dt>ISBN</dt><dd>{book.isbn}</dd></div>}
            <div><dt>Autor(id)</dt><dd>{book.authors.join(', ') || '—'}</dd></div>
            <div><dt>Originaalkeel</dt><dd>{book.orig_language ?? '—'}</dd></div>
            <div><dt>Raamatu keel</dt><dd>{book.language}</dd></div>
            <div><dt>Kirjastus</dt><dd>{book.publisher ?? '—'}</dd></div>
            <div><dt>Tiraaž</dt><dd>{book.print_run ? book.print_run.toLocaleString('et-EE') : '—'}</dd></div>
            <div><dt>Originaali aasta</dt><dd>{book.orig_year ?? '—'}</dd></div>
            <div><dt>Väljaande aasta</dt><dd>{book.pub_year ?? '—'}</dd></div>
            {book.translators.length > 0 && <div><dt>Tõlkija(d)</dt><dd>{book.translators.join(', ')}</dd></div>}
            {book.series && (
              <div>
                <dt>Sari</dt>
                <dd>
                  <Link href={`/sari/${book.series.id}`}>{book.series.name}</Link>
                  {book.series_position != null && <> · nr {book.series_position}</>}
                </dd>
              </div>
            )}
            {book.genre && <div><dt>Žanr</dt><dd>{book.genre}</dd></div>}
          </dl>

          {book.description && (
            <>
              <h2>Sisututvustus</h2>
              <p>{book.description}</p>
            </>
          )}
          {book.notes && <p className="muted small">{book.notes}</p>}

          {(sources ?? []).length > 0 && (
            <>
              <h2>Allikad</h2>
              <ul>
                {((sources ?? []) as BookSource[]).map(s => (
                  <li key={s.id}>
                    {s.url
                      ? <a href={s.url} target="_blank" rel="noreferrer">{s.sources?.name ?? s.url}</a>
                      : (s.sources?.name ?? '—')}
                    <span className="muted small"> · {new Date(s.fetched_at).toLocaleDateString('et-EE')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
