'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AuthGate from '@/components/AuthGate';
import ImageUpload from '@/components/ImageUpload';
import { browserClient } from '@/lib/supabase';
import type { Book, Series } from '@/lib/types';

const EMPTY: Partial<Book> = {
  title: '', authors: [], translators: [], language: 'eesti', genre: 'ulme'
};

const IMG_FIELDS = [
  ['cover_front_url', 'Esikaas'],
  ['cover_spine_url', 'Selg'],
  ['cover_back_url', 'Tagakaas'],
  ['title_page_url', 'Tiitelleht']
] as const;

function BookForm() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sb = browserClient();
  const isNew = params.id === 'uus';

  const [book, setBook] = useState<Partial<Book>>(EMPTY);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb.from('series').select('*').order('name').then(({ data }) => setSeriesList((data ?? []) as Series[]));
    if (!isNew) {
      sb.from('books').select('*').eq('id', params.id).maybeSingle()
        .then(({ data }) => { if (data) setBook(data as Book); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  function set<K extends keyof Book>(key: K, value: Book[K] | null) {
    setBook(b => ({ ...b, [key]: value }));
  }

  async function save() {
    setSaving(true); setErr(null); setMsg(null);
    const payload = { ...book };
    delete (payload as Record<string, unknown>).series;
    delete (payload as Record<string, unknown>).created_at;
    delete (payload as Record<string, unknown>).updated_at;
    delete (payload as Record<string, unknown>).authors_text; // genereeritud veerg — ei tohi kirjutada

    if (!payload.title?.trim()) { setErr('Pealkiri on kohustuslik.'); setSaving(false); return; }

    if (isNew) {
      const { data, error } = await sb.from('books').insert(payload).select('id').single();
      if (error) setErr(error.message);
      else { setMsg('Salvestatud.'); router.replace(`/toimeta/${data.id}`); }
    } else {
      const { error } = await sb.from('books').update(payload).eq('id', params.id);
      if (error) setErr(error.message); else setMsg('Salvestatud.');
    }
    setSaving(false);
  }

  async function remove() {
    if (isNew) return;
    if (!confirm('Kas kustutada see raamat koos allikaviidetega?')) return;
    const { error } = await sb.from('books').delete().eq('id', params.id);
    if (error) setErr(error.message); else router.push('/toimeta');
  }

  return (
    <div className="form">
      {msg && <p className="notice">{msg}</p>}
      {err && <p className="notice err">{err}</p>}

      <div>
        <label>Pealkiri *</label>
        <input value={book.title ?? ''} onChange={e => set('title', e.target.value)} />
      </div>
      <div>
        <label>Alapealkiri</label>
        <input value={book.subtitle ?? ''} onChange={e => set('subtitle', e.target.value || null)} />
      </div>
      <div className="row2">
        <div>
          <label>Autor(id) — eralda komaga</label>
          <input value={(book.authors ?? []).join(', ')}
                 onChange={e => set('authors', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
        </div>
        <div>
          <label>Tõlkija(d) — eralda komaga</label>
          <input value={(book.translators ?? []).join(', ')}
                 onChange={e => set('translators', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />
        </div>
      </div>
      <div className="row2">
        <div>
          <label>ISBN</label>
          <input value={book.isbn ?? ''} onChange={e => set('isbn', e.target.value || null)} />
        </div>
        <div>
          <label>Žanr</label>
          <input value={book.genre ?? ''} onChange={e => set('genre', e.target.value || null)} />
        </div>
      </div>
      <div className="row2">
        <div>
          <label>Originaalkeel</label>
          <input value={book.orig_language ?? ''} onChange={e => set('orig_language', e.target.value || null)} />
        </div>
        <div>
          <label>Raamatu keel</label>
          <input value={book.language ?? 'eesti'} onChange={e => set('language', e.target.value)} />
        </div>
      </div>
      <div className="row2">
        <div>
          <label>Kirjastus</label>
          <input value={book.publisher ?? ''} onChange={e => set('publisher', e.target.value || null)} />
        </div>
        <div>
          <label>Tiraaž</label>
          <input type="number" value={book.print_run ?? ''} onChange={e => set('print_run', e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>
      <div className="row2">
        <div>
          <label>Originaali aasta</label>
          <input type="number" value={book.orig_year ?? ''} onChange={e => set('orig_year', e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div>
          <label>Väljaande aasta</label>
          <input type="number" value={book.pub_year ?? ''} onChange={e => set('pub_year', e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>
      <div className="row2">
        <div>
          <label>Sari</label>
          <select value={book.series_id ?? ''} onChange={e => set('series_id', e.target.value || null)}>
            <option value="">— pole sarjas —</option>
            {seriesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label>Nr sarjas</label>
          <input type="number" step="0.1" value={book.series_position ?? ''} onChange={e => set('series_position', e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>
      <div>
        <label>Sisututvustus</label>
        <textarea value={book.description ?? ''} onChange={e => set('description', e.target.value || null)} />
      </div>
      <div>
        <label>Märkused</label>
        <textarea value={book.notes ?? ''} onChange={e => set('notes', e.target.value || null)} />
      </div>

      <h2>Pildid</h2>
      {isNew && <p className="muted small">Salvesta raamat kõigepealt, siis saab pilte lisada.</p>}
      {!isNew && (
        <>
          <p className="muted small">Max 1 MB; suurus vähendatakse automaatselt alla 1000×1000 ja 100 KB.</p>
          <div className="imgup-grid">
            {IMG_FIELDS.map(([field, label]) => (
              <ImageUpload key={field} bookId={params.id} field={field} label={label}
                           currentUrl={(book[field] as string) ?? null}
                           onDone={url => set(field, url)} />
            ))}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" onClick={save} disabled={saving}>{saving ? 'Salvestan…' : 'Salvesta'}</button>
        {!isNew && <button className="btn danger" onClick={remove}>Kustuta</button>}
      </div>
    </div>
  );
}

export default function EditBookPage() {
  return (
    <>
      <h1>Raamatu toimetamine</h1>
      <AuthGate>
        <BookForm />
      </AuthGate>
    </>
  );
}
