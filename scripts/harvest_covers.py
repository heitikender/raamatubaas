# -*- coding: utf-8 -*-
"""Korjeagent nr 3: kaanepildid mitmest allikast.

Käib läbi kaaneta raamatud ja proovib leida esikaane pildi järjekorras:
  1. Raamatukoi   (pealkiri + aasta klapp) -> /covers/{KOOD}-lg.jpg
  2. Vaimuvara    (WooCommerce Store API, pealkirja klapp)
  3. Kasutatudraamat.ee (WooCommerce Store API, pealkirja klapp)
Salvestab leitud pildi VÄLISE URL-i cover_front_url'i (ei lae Supabase Storage'sse,
et hoida tasuta mahtu) ja lisab book_sources viite. Iga URL kontrollitakse HEAD-iga.

Kasutus:
  export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
  python3 scripts/harvest_covers.py --limit 500
  python3 scripts/harvest_covers.py --all
"""
import json, os, sys, re, time, unicodedata
import urllib.request, urllib.parse, urllib.error

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    sys.exit('Sea SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY')

UA = 'raamatubaas-cover-harvester/1.0'

def norm(s):
    s = unicodedata.normalize('NFKD', s or '')
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
    return s

def tokens(s):
    return set(norm(s).split())

def title_match(book_title, cand_name):
    """True kui kandidaadi nimi katab raamatu pealkirja piisavalt hästi."""
    bt, cn = norm(book_title), norm(cand_name)
    if not bt or not cn:
        return False
    if bt in cn or cn in bt:
        return True
    a, b = tokens(book_title), tokens(cand_name)
    if not a:
        return False
    overlap = len(a & b) / len(a)
    return overlap >= 0.8

def http_json(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def url_ok(url, timeout=15):
    try:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            ct = r.headers.get('Content-Type', '')
            return r.status == 200 and ct.startswith('image/')
    except Exception:
        return False

def sb(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{URL}{path}', data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return json.loads(t) if t else None

# ---------- allikad ----------
def from_raamatukoi(title, year):
    try:
        d = http_json('https://raamatukoi.ee/api/search?q=' + urllib.parse.quote(title))
    except Exception:
        return None
    cands = d.get('products', [])
    # eelista aasta klappi + pealkirja klappi
    best = None
    for p in cands:
        if not title_match(title, p.get('pealkiri', '')):
            continue
        if year and p.get('aasta') == year:
            best = p; break
        if best is None:
            best = p
    if not best:
        return None
    cover = f"https://raamatukoi.ee/covers/{best['kood']}-lg.jpg"
    return cover if url_ok(cover) else None

def from_woo(site, title):
    try:
        d = http_json(f'https://{site}/wp-json/wc/store/v1/products?per_page=5&search='
                      + urllib.parse.quote(title))
    except Exception:
        return None
    if not isinstance(d, list):
        return None
    for p in d:
        if not title_match(title, p.get('name', '')):
            continue
        for img in (p.get('images') or []):
            src = img.get('src')
            if src and url_ok(src):
                return src
    return None

SOURCES = [
    ('Raamatukoi',          lambda t, y: from_raamatukoi(t, y)),
    ('Vaimuvara',           lambda t, y: from_woo('vaimuvara.ee', t)),
    ('Kasutatudraamat.ee',  lambda t, y: from_woo('kasutatudraamat.ee', t)),
]

def main():
    args = sys.argv[1:]
    all_mode = '--all' in args
    limit = 10**9 if all_mode else 500
    if '--limit' in args:
        limit = int(args[args.index('--limit') + 1])

    src_ids = {}
    for s in sb('GET', '/rest/v1/sources?select=id,name'):
        src_ids[s['name']] = s['id']

    processed = found = 0
    PAGE = 100
    last_id = '00000000-0000-0000-0000-000000000000'  # keyset-kursor id järgi
    while processed < limit:
        rows = sb('GET', '/rest/v1/books'
                  '?select=id,title,pub_year&cover_front_url=is.null'
                  f'&id=gt.{last_id}&order=id.asc&limit={PAGE}')
        if not rows:
            break
        for b in rows:
            if processed >= limit:
                break
            processed += 1
            last_id = b['id']
            title, year = b['title'], b.get('pub_year')
            hit = hit_src = None
            for name, fn in SOURCES:
                try:
                    hit = fn(title, year)
                except Exception:
                    hit = None
                if hit:
                    hit_src = name
                    break
                time.sleep(0.25)
            if hit:
                sb('PATCH', f"/rest/v1/books?id=eq.{b['id']}", {'cover_front_url': hit})
                try:
                    sb('POST', '/rest/v1/book_sources',
                       {'book_id': b['id'], 'source_id': src_ids.get(hit_src),
                        'url': hit, 'raw': {'cover': True, 'via': hit_src}})
                except urllib.error.HTTPError:
                    pass
                found += 1
                print(f'[{processed}] KAAS ({hit_src}): {title[:50]}')
            else:
                print(f'[{processed}] -     {title[:50]}')
            time.sleep(0.2)

    print(f'Valmis. Toodeldud {processed}, kaas leitud {found}.')

if __name__ == '__main__':
    main()
