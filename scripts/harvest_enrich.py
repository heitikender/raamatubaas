# -*- coding: utf-8 -*-
"""Rikastusagent: esikaane pilt + sisututvustus (kirjeldus).

Käib läbi raamatud, millel puudub kaanepilt VÕI kirjeldus, ja proovib täita
mõlemad väljad, eelistades eestikeelseid allikaid:
  1. Raamatukoi        pealkiri(+aasta/autor) klapp -> /covers/{KOOD}-lg.jpg
                       + /raamat/{slug} lehe JSON-LD / og:description
  2. Kasutatudraamat / Vaimuvara (WooCommerce Store API) -> pilt + kirjeldus

Kirjutab ainult PUUDUVAD väljad (ei kirjuta olemasolevat üle). Salvestab
kaane VÄLISE URL-i (ei lae Storage'sse). Iga pilt kontrollitakse HEAD-iga.
Jätkatav: kursor (viimane id) failis scripts/.enrich_cursor.

Kasutus:
  export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
  python3 scripts/harvest_enrich.py --all
  python3 scripts/harvest_enrich.py --limit 500
  python3 scripts/harvest_enrich.py --covers-only        # ainult kaaneta raamatud
"""
import json, os, sys, re, time, html, unicodedata
import urllib.request, urllib.parse, urllib.error

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    sys.exit('Sea SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY')

UA = 'raamatubaas-enrich/1.0 (+https://raamatubaas.vercel.app)'
CURSOR_FILE = os.path.join(os.path.dirname(__file__), '.enrich_cursor')
DESC_MIN = 40          # lühemad kui see pole mõistlikud kirjeldused
DESC_MAX = 4000        # lõika liiga pikad

# ---------- abifunktsioonid ----------
def norm(s):
    s = unicodedata.normalize('NFKD', (s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9 ]+', ' ', s).strip()

def tokens(s):
    return set(norm(s).split())

def title_match(book_title, cand_name):
    a, b = tokens(book_title), tokens(cand_name)
    if not a or not b:
        return False
    # kandidaadi pealkiri peab katma põhiosa raamatu pealkirjast
    common = len(a & b)
    return common >= max(1, min(len(a), 3)) and common / len(a) >= 0.6

def http(url, timeout=25, headers=None):
    h = {'User-Agent': UA}
    if headers:
        h.update(headers)
    last = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return None
            last = e
        except Exception as e:
            last = e
        time.sleep(min(20, 2 * (attempt + 1)))
    return None

def http_json(url, timeout=25):
    raw = http(url, timeout, headers={'Accept': 'application/json'})
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None

def url_ok(url, timeout=15):
    try:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status == 200 and r.headers.get('Content-Type', '').startswith('image/')
    except Exception:
        return False

def clean_desc(txt):
    if not txt:
        return None
    txt = html.unescape(re.sub(r'<[^>]+>', ' ', txt))
    txt = re.sub(r'\s+', ' ', txt).strip()
    if len(txt) < DESC_MIN:
        return None
    return txt[:DESC_MAX].strip()

def sb(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(4):
        try:
            req = urllib.request.Request(f'{URL}{path}', data=data, method=method, headers=h)
            with urllib.request.urlopen(req, timeout=60) as r:
                t = r.read().decode()
                return json.loads(t) if t else None
        except urllib.error.HTTPError as e:
            if e.code in (409,):
                return None
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))

# ---------- Raamatukoi ----------
def raamatukoi_desc(slug):
    """Täiskirjeldus toote lehe JSON-LD-st, fallback og:description."""
    raw = http('https://raamatukoi.ee/raamat/' + urllib.parse.quote(slug))
    if not raw:
        return None
    h = raw.decode('utf-8', 'replace')
    best = None
    for block in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', h, re.S):
        try:
            d = json.loads(block)
        except Exception:
            continue
        cand = d.get('description') if isinstance(d, dict) else None
        if not cand:
            continue
        # jäta vahele saidi üldkirjeldus
        if cand.strip().startswith('Eesti vanim internetiraamatupood'):
            continue
        if best is None or len(cand) > len(best):
            best = cand
    if best:
        return clean_desc(best)
    m = re.search(r'og:description"\s+content="([^"]*)"', h)
    return clean_desc(m.group(1)) if m else None

def from_raamatukoi(title, year, authors):
    d = http_json('https://raamatukoi.ee/api/search?q=' + urllib.parse.quote(title))
    if not d:
        return None
    cands = d.get('products', []) if isinstance(d, dict) else []
    best = None
    a_tok = tokens(' '.join(authors or []))
    for p in cands:
        if not title_match(title, p.get('pealkiri', '')):
            continue
        score = 0
        if year and p.get('aasta') == year:
            score += 2
        if a_tok and (a_tok & tokens(p.get('autor', ''))):
            score += 1
        if best is None or score > best[0]:
            best = (score, p)
    if not best:
        return None
    p = best[1]
    cover = f"https://raamatukoi.ee/covers/{p['kood']}-lg.jpg"
    cover = cover if url_ok(cover) else None
    desc = raamatukoi_desc(p['slug']) if p.get('slug') else None
    if cover or desc:
        return {'cover': cover, 'description': desc, 'via': 'Raamatukoi'}
    return None

# ---------- WooCommerce (Kasutatudraamat, Vaimuvara) ----------
def from_woo(site, name_label, title, year, authors):
    d = http_json(f'https://{site}/wp-json/wc/store/v1/products?per_page=5&search='
                  + urllib.parse.quote(title))
    if not isinstance(d, list):
        return None
    for p in d:
        if not title_match(title, p.get('name', '')):
            continue
        cover = None
        for img in (p.get('images') or []):
            src = img.get('src')
            if src and url_ok(src):
                cover = src
                break
        desc = clean_desc(p.get('description') or p.get('short_description'))
        if cover or desc:
            return {'cover': cover, 'description': desc, 'via': name_label}
    return None

SOURCES = [
    from_raamatukoi,
    lambda t, y, a: from_woo('kasutatudraamat.ee', 'Kasutatudraamat.ee', t, y, a),
    lambda t, y, a: from_woo('vaimuvara.ee', 'Vaimuvara', t, y, a),
]

def enrich_one(book):
    """Tagastab (patch_dict, via) või (None, None)."""
    need_cover = not book.get('cover_front_url')
    need_desc = not book.get('description')
    title, year, authors = book['title'], book.get('pub_year'), book.get('authors') or []
    patch, via = {}, None
    for fn in SOURCES:
        try:
            res = fn(title, year, authors)
        except Exception:
            res = None
        if not res:
            time.sleep(0.2)
            continue
        if need_cover and res.get('cover') and 'cover_front_url' not in patch:
            patch['cover_front_url'] = res['cover']
        if need_desc and res.get('description') and 'description' not in patch:
            patch['description'] = res['description']
        if via is None and (res.get('cover') or res.get('description')):
            via = res['via']
        # kui mõlemad vajaminevad väljad täidetud, lõpeta
        if (not need_cover or 'cover_front_url' in patch) and \
           (not need_desc or 'description' in patch):
            break
        time.sleep(0.2)
    return (patch, via) if patch else (None, None)

def main():
    args = sys.argv[1:]
    all_mode = '--all' in args
    covers_only = '--covers-only' in args
    # --mark: kasuta enriched_at-märgist edenemiseks (GitHub Actions jaoks) —
    # iga töödeldud raamat märgitakse, midagi ei proovita kaks korda.
    mark = '--mark' in args
    limit = 10**9 if all_mode else 500
    if '--limit' in args:
        limit = int(args[args.index('--limit') + 1])
    resume = '--resume' in args and not mark
    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    src_ids = {}
    for s in (sb('GET', '/rest/v1/sources?select=id,name') or []):
        src_ids[s['name']] = s['id']

    last_id = '00000000-0000-0000-0000-000000000000'
    if resume and os.path.exists(CURSOR_FILE):
        last_id = open(CURSOR_FILE).read().strip() or last_id

    # tingimus: kaaneta VÕI kirjelduseta (mark-režiimis lisaks veel märkimata)
    cond = 'cover_front_url=is.null' if covers_only else 'or=(cover_front_url.is.null,description.is.null)'
    if mark:
        cond = 'enriched_at=is.null&' + cond
    processed = filled_cover = filled_desc = 0
    PAGE = 100
    while processed < limit:
        rows = sb('GET', '/rest/v1/books'
                  f'?select=id,title,pub_year,authors,cover_front_url,description&{cond}'
                  f'&id=gt.{last_id}&order=id.asc&limit={PAGE}')
        if not rows:
            break
        for b in rows:
            if processed >= limit:
                break
            processed += 1
            last_id = b['id']
            patch, via = enrich_one(b)
            found = bool(patch)
            if mark:                       # märgi ka siis, kui midagi ei leitud
                patch = dict(patch or {})
                patch['enriched_at'] = now_iso
            if patch:
                sb('PATCH', f"/rest/v1/books?id=eq.{b['id']}", patch)
            if found:
                if 'cover_front_url' in patch:
                    filled_cover += 1
                if 'description' in patch:
                    filled_desc += 1
                if via and src_ids.get(via):
                    try:
                        sb('POST', '/rest/v1/book_sources',
                           {'book_id': b['id'], 'source_id': src_ids[via],
                            'url': patch.get('cover_front_url'),
                            'raw': {'via': via, 'fields': list(patch.keys())}})
                    except Exception:
                        pass
                tag = '+'.join(k.split('_')[0] for k in patch if k != 'enriched_at')
                print(f'[{processed}] {via} ({tag}): {b["title"][:48]}', flush=True)
            else:
                print(f'[{processed}] -     {b["title"][:48]}', flush=True)
            if not mark and processed % 20 == 0:
                open(CURSOR_FILE, 'w').write(last_id)
            time.sleep(0.15)
        if not mark:
            open(CURSOR_FILE, 'w').write(last_id)

    print(f'Valmis. Toodeldud {processed}, kaas +{filled_cover}, kirjeldus +{filled_desc}.')

if __name__ == '__main__':
    main()
