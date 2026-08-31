# -*- coding: utf-8 -*-
"""Seemendab Supabase'i baasi seed_data.json sisuga (sarjad, raamatud, kaanepildid, allikaviited).

Kasutamine:
  export SUPABASE_URL=https://xxxx.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=eyJ...
  python3 scripts/seed.py
Idempotentne: raamatut tuvastatakse (title, pub_year) järgi; olemasolevat ei dubleerita.
"""
import json, os, sys, mimetypes
import urllib.request, urllib.parse, urllib.error

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    sys.exit('Sea keskkonnamuutujad SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY')

def api(method, path, body=None, headers=None, raw=False):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
    if body is not None and not raw:
        body = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    h.update(headers or {})
    req = urllib.request.Request(f'{URL}{path}', data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:500]
        raise RuntimeError(f'{method} {path} -> {e.code}: {detail}') from None

data = json.load(open(os.path.join(os.path.dirname(__file__), 'seed_data.json')))

# --- sarjad ---
series_ids = {}
existing = api('GET', '/rest/v1/series?select=id,name') or []
for s in existing:
    series_ids[s['name']] = s['id']
for s in data['series']:
    if s['name'] in series_ids:
        continue
    r = api('POST', '/rest/v1/series', s, headers={'Prefer': 'return=representation'})
    series_ids[s['name']] = r[0]['id']
    print('sari +', s['name'])

# --- allikas "käsitsi seemendatud" viidete jaoks ---
srcs = api('GET', '/rest/v1/sources?select=id,name') or []
src_by_name = {s['name']: s['id'] for s in srcs}

# --- raamatud ---
def upload_cover(book_id, path):
    ctype = mimetypes.guess_type(path)[0] or 'image/jpeg'
    with open(path, 'rb') as f:
        blob = f.read()
    obj = f'covers/{book_id}/front.jpg'
    api('POST', f'/storage/v1/object/{obj}', blob, raw=True,
        headers={'Content-Type': ctype, 'x-upsert': 'true'})
    return f'{URL}/storage/v1/object/public/{obj}'

added = skipped = 0
for b in data['books']:
    q = f"/rest/v1/books?select=id&title=eq.{urllib.parse.quote(b['title'])}&pub_year=eq.{b['pub_year']}"
    if api('GET', q):
        skipped += 1
        continue
    row = {k: b[k] for k in ('title','authors','orig_language','language','publisher',
                             'orig_year','pub_year','genre','translators','description','notes')}
    row['series_id'] = series_ids.get(b['series']) if b['series'] else None
    r = api('POST', '/rest/v1/books', row, headers={'Prefer': 'return=representation'})
    book_id = r[0]['id']
    if b.get('cover_file'):
        p = os.path.join(os.path.dirname(__file__), 'covers', b['cover_file'])
        if os.path.exists(p):
            url = upload_cover(book_id, p)
            api('PATCH', f'/rest/v1/books?id=eq.{book_id}', {'cover_front_url': url})
    # allikaviide Raamatukoi kaanepildile
    if 'Raamatukoi' in src_by_name and b.get('cover_file'):
        try:
            api('POST', '/rest/v1/book_sources', {
                'book_id': book_id, 'source_id': src_by_name['Raamatukoi'],
                'url': 'https://www.raamatukoi.ee', 'raw': {'seed': b['seed_id']}
            })
        except RuntimeError:
            pass
    added += 1
    print('raamat +', b['title'])

print(f'Valmis: lisatud {added}, olemas oli {skipped}.')
