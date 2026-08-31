# -*- coding: utf-8 -*-
"""Korjeagent nr 1: Raamatukoi.

Käib baasi raamatud läbi, otsib igaühe Raamatukoi kataloogist (JSON API),
salvestab toorkirje book_sources tabelisse ning täidab puuduvad väljad
(kaanepilt, aasta) kui leid on kindel (pealkiri + aasta klapivad).

  export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
  python3 scripts/harvest_raamatukoi.py [--limit 100]
"""
import json, os, sys, time, urllib.request, urllib.parse

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    sys.exit('Sea SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY')

UA = {'User-Agent': 'raamatubaas-harvester/0.1 (kontakt: toimetaja)'}

def sb(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if prefer: h['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{URL}{path}', data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else None

def koi_search(q):
    u = 'https://raamatukoi.ee/api/search?q=' + urllib.parse.quote(q)
    req = urllib.request.Request(u, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

limit = 1000
if '--limit' in sys.argv:
    limit = int(sys.argv[sys.argv.index('--limit') + 1])

sources = sb('GET', '/rest/v1/sources?select=id,name&name=eq.Raamatukoi')
if not sources: sys.exit('Allikas "Raamatukoi" puudub sources-tabelist')
SRC = sources[0]['id']

books = sb('GET', f'/rest/v1/books?select=id,title,authors,pub_year,cover_front_url&limit={limit}')
print(f'{len(books)} raamatut kontrollida')

for b in books:
    try:
        res = koi_search(b['title'])
    except Exception as e:
        print('!', b['title'], e); time.sleep(2); continue

    match = None
    for p in res.get('products', []):
        if p.get('aasta') == b['pub_year']:
            match = p; break

    if match:
        kood = match['kood']
        url = f'https://www.raamatukoi.ee (kood {kood})'
        try:
            sb('POST', '/rest/v1/book_sources',
               {'book_id': b['id'], 'source_id': SRC,
                'url': f'https://raamatukoi.ee/covers/{kood}-lg.jpg', 'raw': match},
               prefer='resolution=ignore-duplicates')
        except Exception:
            pass
        if not b.get('cover_front_url'):
            cover = f'https://raamatukoi.ee/covers/{kood}-lg.jpg'
            sb('PATCH', f"/rest/v1/books?id=eq.{b['id']}", {'cover_front_url': cover})
            print('kaas +', b['title'])
        else:
            print('ok   ', b['title'])
    else:
        print('pole ', b['title'])
    time.sleep(0.5)
