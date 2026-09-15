'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/lib/auth';

const KINDS = ['pood', 'antikvariaat', 'bibliograafia', 'raamatukogu', 'wiki', 'blogi'];

/** Toimetaja/superadmini vorm uue allika lisamiseks otse veebis.
 *  RLS "editors write sources" lubab sisselogitud toimetajal kirjutada. */
export default function AddSource() {
  const { sb, isEditor, loading } = useRole();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('antikvariaat');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiNotes, setApiNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  if (loading || !isEditor) return null;

  async function submit() {
    setMsg(''); setErr('');
    const nm = name.trim();
    if (!nm) { setErr('Nimi on kohustuslik'); return; }
    setBusy(true);
    const { error } = await sb.from('sources').insert({
      name: nm,
      kind,
      base_url: baseUrl.trim() || null,
      api_notes: apiNotes.trim() || null,
    });
    setBusy(false);
    if (error) {
      setErr(/duplicate|unique/i.test(error.message)
        ? `Allikas nimega „${nm}" on juba olemas.`
        : `Salvestamine ebaõnnestus: ${error.message}`);
      return;
    }
    setMsg(`Lisatud: ${nm}`);
    setName(''); setBaseUrl(''); setApiNotes('');
    router.refresh();
  }

  if (!open) {
    return (
      <p style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => setOpen(true)}>+ Lisa allikas</button>
      </p>
    );
  }

  return (
    <div className="form" style={{ marginTop: 16, maxWidth: 640 }}>
      <h3 style={{ margin: '0 0 8px' }}>Lisa uus allikas</h3>
      {msg && <p className="notice">{msg}</p>}
      {err && <p className="notice err">{err}</p>}
      <div>
        <label>Nimi *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="nt Antikvariaat.eu" />
      </div>
      <div className="row2">
        <div>
          <label>Liik</label>
          <select value={kind} onChange={e => setKind(e.target.value)}>
            {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label>Veebiaadress (base_url)</label>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <div>
        <label>Märkused masinloetavuse kohta</label>
        <input value={apiNotes} onChange={e => setApiNotes(e.target.value)}
               placeholder="nt JSON API, HTML-kraapimine, OAI-PMH…" />
      </div>
      <p style={{ marginTop: 10 }}>
        <button className="btn" onClick={submit} disabled={busy}>
          {busy ? 'Salvestan…' : 'Salvesta'}
        </button>{' '}
        <button className="btn" onClick={() => { setOpen(false); setErr(''); setMsg(''); }}>Sulge</button>
      </p>
    </div>
  );
}
