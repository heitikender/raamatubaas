'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AuthGate from '@/components/AuthGate';
import { browserClient } from '@/lib/supabase';
import type { Book, Series } from '@/lib/types';

const EMPTY: Partial<Book> = {
  title: '', authors: [], translators: [], language: 'eesti', genre: 'ulme'
};

const IMG_FIELDS = [
  ['cover_front_url', 'esikaas', 'front'],
  ['cover_spine_url', 'selg', 'spine'],
  ['cover_back_url', 'tagakaas', 'back'],
  ['title_page_url', 'tiitelleht', 'title']
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

  async function uploadImage(field: (typeof IMG_FIELDS)[number][0], slot: string, file: File) {
    if (isNew) { setErr('Salvesta raamat enne piltide lisamist.'); return; }
    setErr(null);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${params.id}/${slot}.${ext}`;
    const { error } = await sb.storage.from('covers').upload(path, file, { upsert: true });
    if (error) { setErr(`Pildi üleslaadimine ebaõnnestus: ${error.message}`); return; }
    const { data } = sb.storage.from('covers').getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;
    set(field, url);
    await sb.from('books').update({ [field]: url }).eq('id', params.id);
    setMsg('Pilt üles laaditud.');
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
        <div className="row2">
          {IMG_FIELDS.map(([field, label, slot]) => (
            <div key={field}>
              <label>{label}</label>
              {book[field] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={book[field] as string} alt={label} style={{ width: 120, display: 'block', marginBottom: 6, border: '1px solid var(--line)' }} />
              )}
              <input type="file" accept="image/*"
                     onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(field, slot, f); }} />
            </div>
          ))}
        </div>
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
