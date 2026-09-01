import { NextRequest, NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Logib ühe külastuse (sessioonipõhiselt kutsub VisitLogger).
export async function POST(req: NextRequest) {
  let path = '/';
  try {
    const b = await req.json();
    if (b?.path) path = String(b.path).slice(0, 200);
  } catch { /* tühi keha ok */ }
  try {
    await serverClient().from('visits').insert({ path });
  } catch { /* loendur pole kriitiline */ }
  return new NextResponse(null, { status: 204 });
}
