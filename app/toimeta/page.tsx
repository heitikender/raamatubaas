'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGate from '@/components/AuthGate';
import { browserClient } from '@/lib/supabase';
import type { Book } from '@/lib/types';

function BookList() {
  const sb = browserClient();
  const [books, setBooks] = useState<Book[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let query = sb.from('books').select('id,title,authors,pub_year,publisher,cover_front_url')
      .order('updated_at', { ascending: false }).limit(100);
    if (q.trim()) query = query.ilike('title', `%${q.trim()}%`);
    query.then(({ data }) => setBooks((data ?? []) as Book[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder="Otsi pealkirja…" value={q} onChange={e => setQ(e.target.value)} />
        <Link className="btn" href="/toimeta/uus">+ Lisa uus raamat</Link>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th></th><th>Pealkiri</th><th>Autor</th><th>Aasta</th><th>Kirjastus</th><th></th></tr></thead>
          <tbody>
            {books.map(b => (
              <tr key={b.id}>
                <td style={{ width: 48 }}>
                  {b.cover_front_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.cover_front_url} alt="" style={{ width: 36, border: '1px solid var(--line)' }} />
                  )}
                </td>
                <td><b>{b.title}</b></td>
                <td>{(b.authors ?? []).join(', ')}</td>
                <td>{b.pub_year ?? ''}</td>
                <td>{b.publisher ?? ''}</td>
                <td><Link href={`/toimeta/${b.id}`}>Muuda</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function EditorHome() {
  return (
    <>
      <h1>Toimetamine</h1>
      <AuthGate>
        <BookList />
      </AuthGate>
    </>
  );
}
