'use client';

import { useState, useEffect, useRef } from 'react';
import { browserClient } from '@/lib/supabase';

type Opt = { id: string; name: string; book_count: number };

export default function SeriesSearch({
  initialId = '',
  initialLabel = ''
}: { initialId?: string; initialLabel?: string }) {
  const sb = browserClient();
  const [text, setText] = useState(initialLabel);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = text.trim();
    if (term.length < 3) { setOpts([]); setOpen(false); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await sb
        .from('series_with_counts')
        .select('id,name,book_count')
        .gt('book_count', 0)
        .ilike('name', `%${term}%`)
        .order('book_count', { ascending: false })
        .limit(15);
      if (alive) { setOpts((data ?? []) as Opt[]); setOpen(true); }
    }, 220);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function apply(id: string, label: string) {
    setText(label);
    setOpen(false);
    const hid = hiddenRef.current;
    if (hid) {
      hid.value = id;
      hid.form?.requestSubmit();
    }
  }

  function clear() {
    setText('');
    setOpts([]);
    const hid = hiddenRef.current;
    if (hid) { hid.value = ''; hid.form?.requestSubmit(); }
  }

  return (
    <div className="ss" ref={boxRef}>
      <input type="hidden" name="sari" defaultValue={initialId} ref={hiddenRef} />
      <input
        type="text"
        placeholder="Sari (tipi ≥3 tähte)…"
        value={text}
        autoComplete="off"
        onChange={e => { setText(e.target.value); if (!e.target.value) clear(); }}
        onFocus={() => { if (opts.length) setOpen(true); }}
      />
      {text && (
        <button type="button" className="ss-clear" onClick={clear} aria-label="Tühjenda">✕</button>
      )}
      {open && opts.length > 0 && (
        <ul className="ss-list">
          {opts.map(o => (
            <li key={o.id} onMouseDown={() => apply(o.id, o.name)}>
              <span>{o.name}</span>
              <span className="muted small">{o.book_count}</span>
            </li>
          ))}
        </ul>
      )}
      {open && text.trim().length >= 3 && opts.length === 0 && (
        <ul className="ss-list"><li className="muted">Sarja ei leitud</li></ul>
      )}
    </div>
  );
}
