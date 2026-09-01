'use client';

import { useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase';

const MAX_UPLOAD = 1024 * 1024;   // sisendfail max 1 MB
const MAX_DIM = 1000;             // väljund max 1000x1000
const MAX_OUT = 100 * 1024;       // väljund max 100 KB

type Props = {
  bookId: string;
  field: 'cover_front_url' | 'cover_spine_url' | 'cover_back_url' | 'title_page_url';
  label: string;
  currentUrl?: string | null;
  onDone?: (url: string) => void;
};

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Pilti ei õnnestunud lugeda'));
      img.src = url;
    });
  } finally {
    // vabastame hiljem (onDone järel), aga lihtsuse mõttes kohe pärast laadimist ok
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function canvasAt(img: HTMLImageElement, scale: number): HTMLCanvasElement {
  let w = img.naturalWidth, h = img.naturalHeight;
  const fit = Math.min(1, MAX_DIM / Math.max(w, h)) * scale;
  w = Math.max(1, Math.round(w * fit));
  h = Math.max(1, Math.round(h * fit));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

function toBlob(c: HTMLCanvasElement, q: number): Promise<Blob | null> {
  return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', q));
}

/** Vähenda alla 1000x1000 ja pigista JPEG alla 100 KB. */
async function shrink(file: File): Promise<Blob> {
  const img = await loadImage(file);
  for (const scale of [1, 0.85, 0.7, 0.55, 0.4]) {
    const c = canvasAt(img, scale);
    for (const q of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
      const blob = await toBlob(c, q);
      if (blob && blob.size <= MAX_OUT) return blob;
    }
  }
  // viimane katse: väikseim
  const c = canvasAt(img, 0.3);
  const blob = await toBlob(c, 0.3);
  if (!blob) throw new Error('Pildi töötlemine ebaõnnestus');
  return blob;
}

export default function ImageUpload({ bookId, field, label, currentUrl, onDone }: Props) {
  const sb = browserClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(currentUrl ?? null);

  async function handle(file: File) {
    setErr(null);
    if (file.size > MAX_UPLOAD) { setErr('Fail on liiga suur (max 1 MB).'); return; }
    if (!file.type.startsWith('image/')) { setErr('Vali pildifail.'); return; }
    setBusy(true);
    try {
      const blob = await shrink(file);
      const slot = field.replace('_url', '');
      const path = `${bookId}/${slot}-${Date.now()}.jpg`;
      const up = await sb.storage.from('covers').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error) throw new Error(up.error.message);
      const pub = sb.storage.from('covers').getPublicUrl(path).data.publicUrl;
      const { error: rpcErr } = await sb.rpc('set_book_image', { p_book: bookId, p_field: field, p_url: pub });
      if (rpcErr) throw new Error(rpcErr.message);
      const shown = `${pub}?v=${Date.now()}`;
      setUrl(shown);
      onDone?.(shown);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Viga');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="imgup">
      <div className="imgup-label">{label}</div>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={label} className="imgup-thumb" />
        : <div className="imgup-empty">pilti pole</div>}
      <label className="btn secondary imgup-btn">
        {busy ? 'Laen…' : (url ? 'Asenda' : 'Lisa pilt')}
        <input ref={inputRef} type="file" accept="image/*" hidden disabled={busy}
               onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      </label>
      {err && <div className="imgup-err">{err}</div>}
    </div>
  );
}
