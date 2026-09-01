import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// On-demand rikastamine: leiab ühele raamatule esikaane + sisututvustuse
// Raamatukoist ja salvestab PUUDUVAD väljad. Kaitstud saladusega.
//   GET /api/rikasta?id=<raamatu-id>&key=<ENRICH_SECRET>
//   GET /api/rikasta?isbn=<isbn>&key=<ENRICH_SECRET>
// Ilma kirjutamiseta (ainult vaatab, mida leiaks): lisa &dry=1

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const UA = 'raamatubaas-enrich/1.0 (+https://raamatubaas.vercel.app)';
const DESC_MIN = 40, DESC_MAX = 4000;

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim();
}
function toks(s: string) { return new Set(norm(s).split(/\s+/).filter(Boolean)); }
function titleMatch(a: string, b: string) {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return false;
  let common = 0; A.forEach(t => { if (B.has(t)) common++; });
  return common >= Math.max(1, Math.min(A.size, 3)) && common / A.size >= 0.6;
}
function cleanDesc(txt?: string | null) {
  if (!txt) return null;
  const t = txt.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return t.length < DESC_MIN ? null : t.slice(0, DESC_MAX);
}
async function fetchText(url: string, timeoutMs = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeoutMs);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: c.signal }); return r.ok ? await r.text() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
async function headOkImage(url: string) {
  try { const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } }); return r.ok && (r.headers.get('content-type') || '').startsWith('image/'); }
  catch { return false; }
}
async function raamatukoiDesc(slug: string) {
  const h = await fetchText('https://raamatukoi.ee/raamat/' + encodeURIComponent(slug));
  if (!h) return null;
  let best: string | null = null;
  const blocks = h.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    const m = b.match(/>([\s\S]*?)<\/script>/i); if (!m) continue;
    try {
      const d = JSON.parse(m[1]);
      const desc = d && typeof d === 'object' ? d.description : null;
      if (desc && !String(desc).trim().startsWith('Eesti vanim internetiraamatupood')) {
        if (!best || desc.length > best.length) best = desc;
      }
    } catch { /* ignore */ }
  }
  if (best) return cleanDesc(best);
  const og = h.match(/og:description"\s+content="([^"]*)"/);
  return og ? cleanDesc(og[1]) : null;
}
async function fromRaamatukoi(title: string, year: number | null, authors: string[]) {
  const raw = await fetchText('https://raamatukoi.ee/api/search?q=' + encodeURIComponent(title));
  if (!raw) return null;
  let d: any; try { d = JSON.parse(raw); } catch { return null; }
  const cands = Array.isArray(d?.products) ? d.products : [];
  const aTok = toks((authors || []).join(' '));
  let best: any = null, bestScore = -1;
  for (const p of cands) {
    if (!titleMatch(title, p.pealkiri || '')) continue;
    let score = 0;
    if (year && p.aasta === year) score += 2;
    if (aTok.size) { const pt = toks(p.autor || ''); let hit = false; aTok.forEach(t => { if (pt.has(t)) hit = true; }); if (hit) score += 1; }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best) return null;
  const coverUrl = `https://raamatukoi.ee/covers/${best.kood}-lg.jpg`;
  const cover = (await headOkImage(coverUrl)) ? coverUrl : null;
  const description = best.slug ? await raamatukoiDesc(best.slug) : null;
  return (cover || description) ? { cover, description, via: 'Raamatukoi' } : null;
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const secret = process.env.ENRICH_SECRET;
  const key = sp.get('key') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!secret || key !== secret) {
    return NextResponse.json({ error: 'Vale või puuduv võti' }, { status: 401, headers: CORS });
  }
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!svcKey || !url) return NextResponse.json({ error: 'Server pole seadistatud' }, { status: 500, headers: CORS });

  const id = (sp.get('id') || '').trim();
  const isbn = (sp.get('isbn') || '').trim();
  const dry = sp.get('dry') === '1';
  if (!id && !isbn) return NextResponse.json({ error: 'Anna ?id= või ?isbn=' }, { status: 400, headers: CORS });

  const admin = createClient(url, svcKey, { auth: { persistSession: false } });
  let q = admin.from('books').select('id,title,pub_year,authors,cover_front_url,description').limit(1);
  q = id ? q.eq('id', id) : q.eq('isbn', isbn);
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  const book = rows?.[0];
  if (!book) return NextResponse.json({ error: 'Raamatut ei leitud' }, { status: 404, headers: CORS });

  const needCover = !book.cover_front_url, needDesc = !book.description;
  if (!needCover && !needDesc) {
    return NextResponse.json({ id: book.id, status: 'juba täidetud', patch: {} }, { headers: CORS });
  }

  const res = await fromRaamatukoi(book.title, book.pub_year ?? null, book.authors ?? []);
  const patch: Record<string, string> = {};
  if (res) {
    if (needCover && res.cover) patch.cover_front_url = res.cover;
    if (needDesc && res.description) patch.description = res.description;
  }

  if (!dry && Object.keys(patch).length) {
    const { error: uerr } = await admin.from('books').update(patch).eq('id', book.id);
    if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500, headers: CORS });
  }

  return NextResponse.json(
    { id: book.id, title: book.title, via: res?.via ?? null, found: !!res, dry, patch },
    { headers: CORS }
  );
}
