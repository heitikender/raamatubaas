'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRole } from '@/lib/auth';

type Req = { id: string; user_email: string; message: string | null; status: string; created_at: string };
type Ed = { user_email: string; role: string; granted_by: string | null };

const ROLE_LABEL: Record<string, string> = { user: 'Tavakasutaja', editor: 'Toimetaja', superadmin: 'Superadmin' };

export default function KontoPage() {
  const { sb, email, role, isEditor, isSuperadmin, loading, login, logout, refresh } = useRole();

  const [myReq, setMyReq] = useState<Req | null>(null);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Req[]>([]);
  const [editors, setEditors] = useState<Ed[]>([]);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantRole, setGrantRole] = useState<'editor' | 'superadmin'>('editor');
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!email) return;
    // oma soov
    const { data: mine } = await sb.from('editor_requests').select('*').eq('user_email', email).maybeSingle();
    setMyReq((mine as Req) ?? null);
    if (isEditor) {
      const { data: pend } = await sb.from('editor_requests').select('*').eq('status', 'pending').order('created_at');
      setPending((pend ?? []) as Req[]);
    }
    if (isSuperadmin) {
      const { data: eds } = await sb.from('editors').select('user_email,role,granted_by').order('role');
      setEditors((eds ?? []) as Ed[]);
    }
  }, [sb, email, isEditor, isSuperadmin]);

  useEffect(() => { load(); }, [load]);

  async function submitRequest() {
    setErr(null); setNotice(null);
    if (!email) return;
    const { error } = await sb.from('editor_requests')
      .upsert({ user_email: email, message: msg || null, status: 'pending' }, { onConflict: 'user_email' });
    if (error) setErr(error.message);
    else { setNotice('Soov esitatud. Toimetajad vaatavad selle üle.'); setMsg(''); load(); }
  }

  async function decide(req: Req, approve: boolean) {
    setErr(null); setNotice(null);
    if (approve) {
      const ins = await sb.from('editors').insert({ user_email: req.user_email, role: 'editor', granted_by: email });
      if (ins.error && !ins.error.message.includes('duplicate')) { setErr(ins.error.message); return; }
    }
    const { error } = await sb.from('editor_requests')
      .update({ status: approve ? 'approved' : 'rejected', decided_by: email, decided_at: new Date().toISOString() })
      .eq('id', req.id);
    if (error) setErr(error.message);
    else { setNotice(approve ? `${req.user_email} on nüüd toimetaja.` : 'Soov tagasi lükatud.'); load(); }
  }

  async function grant() {
    setErr(null); setNotice(null);
    const e = grantEmail.trim().toLowerCase();
    if (!e) return;
    const { error } = await sb.from('editors')
      .upsert({ user_email: e, role: grantRole, granted_by: email }, { onConflict: 'user_email' });
    if (error) setErr(error.message);
    else { setNotice(`${e} → ${ROLE_LABEL[grantRole]}.`); setGrantEmail(''); load(); }
  }

  async function changeRole(ed: Ed, newRole: string) {
    setErr(null);
    const { error } = await sb.from('editors').update({ role: newRole }).eq('user_email', ed.user_email);
    if (error) setErr(error.message); else load();
  }

  async function revoke(ed: Ed) {
    setErr(null);
    if (ed.user_email === email) { setErr('Iseennast ei saa eemaldada.'); return; }
    const { error } = await sb.from('editors').delete().eq('user_email', ed.user_email);
    if (error) setErr(error.message); else load();
  }

  if (loading) return <><h1>Konto</h1><p className="muted">Laen…</p></>;

  if (!email) {
    return (
      <>
        <h1>Konto</h1>
        <div className="notice">
          <p>Logi sisse Google&apos;i kontoga, et hallata oma rolli ja lisada kaanepilte.</p>
          <button className="btn" onClick={login}>Logi sisse Google&apos;iga</button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Konto</h1>
      <p className="muted">
        {email} · <b>{ROLE_LABEL[role] ?? role}</b>{' '}
        <button className="btn secondary" style={{ padding: '3px 10px', marginLeft: 8 }} onClick={logout}>Logi välja</button>
      </p>

      {notice && <p className="notice">{notice}</p>}
      {err && <p className="notice err">{err}</p>}

      {/* Tavakasutaja: soovi esitamine */}
      {role === 'user' && (
        <section>
          <h2>Toimetajaks saamine</h2>
          {myReq?.status === 'pending' ? (
            <p className="notice">Sinu soov on ootel. Toimetaja saab selle kinnitada.</p>
          ) : myReq?.status === 'rejected' ? (
            <p className="muted">Eelmine soov lükati tagasi. Võid esitada uue.</p>
          ) : null}
          {myReq?.status !== 'pending' && (
            <div className="form" style={{ maxWidth: 560 }}>
              <div>
                <label>Sõnum (valikuline) — miks soovid toimetajaks saada?</label>
                <textarea value={msg} onChange={e => setMsg(e.target.value)} />
              </div>
              <button className="btn" onClick={submitRequest}>Esita soov</button>
            </div>
          )}
        </section>
      )}

      {/* Toimetaja: ootel soovid */}
      {isEditor && (
        <section>
          <h2>Ootel toimetaja-soovid {pending.length > 0 && <span className="muted">({pending.length})</span>}</h2>
          {pending.length === 0 ? (
            <p className="muted">Ootel soove pole.</p>
          ) : (
            <div className="tablewrap">
              <table>
                <thead><tr><th>E-post</th><th>Sõnum</th><th>Esitatud</th><th></th></tr></thead>
                <tbody>
                  {pending.map(r => (
                    <tr key={r.id}>
                      <td><b>{r.user_email}</b></td>
                      <td className="muted small">{r.message || '—'}</td>
                      <td className="muted small">{new Date(r.created_at).toLocaleDateString('et-EE')}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => decide(r, true)}>Kinnita</button>{' '}
                        <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => decide(r, false)}>Lükka tagasi</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Superadmin: rollihaldus */}
      {isSuperadmin && (
        <section>
          <h2>Rollihaldus</h2>
          <div className="toolbar">
            <input type="email" placeholder="kasutaja@näide.ee" value={grantEmail}
                   onChange={e => setGrantEmail(e.target.value)} />
            <select value={grantRole} onChange={e => setGrantRole(e.target.value as 'editor' | 'superadmin')}>
              <option value="editor">Toimetaja</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <button className="btn" onClick={grant}>Volita</button>
          </div>
          <div className="tablewrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>E-post</th><th>Roll</th><th>Volitas</th><th></th></tr></thead>
              <tbody>
                {editors.map(ed => (
                  <tr key={ed.user_email}>
                    <td><b>{ed.user_email}</b></td>
                    <td>
                      <select value={ed.role} onChange={e => changeRole(ed, e.target.value)}
                              disabled={ed.user_email === email}>
                        <option value="editor">Toimetaja</option>
                        <option value="superadmin">Superadmin</option>
                      </select>
                    </td>
                    <td className="muted small">{ed.granted_by || '—'}</td>
                    <td>
                      <button className="btn danger" style={{ padding: '4px 10px' }}
                              onClick={() => revoke(ed)} disabled={ed.user_email === email}>Eemalda</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
