import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase';
import type { Book } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SITE = 'https://raamatubaas.vercel.app';

// Avalik ainult-lugemise API — mõeldud nt raamatuskänneri äpile.
//   GET /api/otsing?isbn=9789916039540   → täpne ISBN-vaste
//   GET /api/otsing?q=Sipsik             → pealkirja/autori otsing
//   GET /api/otsing?q=...&limit=20&lk=1  → lehekülgedena
// Vastus: { query, count, books: [...] }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function shape(b: Book & { series?: { id: string; name: string } | null }) {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle ?? null,
    authors: b.authors ?? [],
    translators: b.translators ?? [],
    isbn: b.isbn ?? null,
    orig_language: b.orig_language ?? null,
    language: b.language ?? null,
    publisher: b.publisher ?? null,
    print_run: b.print_run ?? null,
    orig_year: b.orig_year ?? null,
    pub_year: b.pub_year ?? null,
    genre: b.genre ?? null,
    series: b.series ? { id: b.series.id, name: b.series.name } : null,
    series_position: b.series_position ?? null,
    cover_front_url: b.cover_front_url ?? null,
    cover_spine_url: b.cover_spine_url ?? null,
    cover_back_url: b.cover_back_url ?? null,
    title_page_url: b.title_page_url ?? null,
    description: b.description ?? null,
    url: `${SITE}/raamat/${b.id}`
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const isbnRaw = (sp.get('isbn') ?? '').trim();
  const q = (sp.get('q') ?? '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20));
  const lk = Math.max(1, parseInt(sp.get('lk') ?? '1', 10) || 1);

  if (!isbnRaw && !q) {
    return NextResponse.json(
      { error: 'Anna parameeter ?isbn= või ?q=', example: `${SITE}/api/otsing?isbn=9789916039540` },
      { status: 400, headers: CORS }
    );
  }

  const sb = serverClient();
  const sel = '*, series(id,name)';
  let query = sb.from('books').select(sel, { count: 'exact' });

  if (isbnRaw) {
    const isbn = isbnRaw.replace(/[^0-9Xx]/g, '');
    // ISBN salvestatakse mõnikord sidekriipsudega — võrdle ka toorkujul
    query = query.or(`isbn.eq.${isbn},isbn.eq.${isbnRaw}`);
  } else {
    const parts = [`title.ilike.%${q}%`, `authors_text.ilike.%${q}%`];
    const isbnClean = q.replace(/[^0-9Xx]/g, '');
    if (isbnClean.length >= 5) parts.push(`isbn.ilike.%${isbnClean}%`);
    query = query.or(parts.join(',')).order('pub_year', { ascending: false });
  }

  query = query.range((lk - 1) * limit, lk * limit - 1);

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }

  const books = ((data ?? []) as (Book & { series?: { id: string; name: string } | null })[]).map(shape);
  return NextResponse.json(
    { query: isbnRaw ? { isbn: isbnRaw } : { q }, count: count ?? books.length, page: lk, limit, books },
    { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=300' } }
  );
}
