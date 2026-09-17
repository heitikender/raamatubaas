# -*- coding: utf-8 -*-
"""antikvariaat.eu sarja-põhine sidumine.

Iga antikvariaadi sarja kohta: kraabi raamatud (autor, pealkiri, slug, kaas),
seo baasis olevad vasted sarjaga (series_id), täida puuduv kaas.

Etapid:
  seeriad     -> json.php?request=seriesautocomplete (query='') = kõik ~1437
  raamatud    -> /trükised/sari=<nimi>/leht=N  (AJAX-fragment, 10 tk/lk)
  vaste       -> baasi books (autor+pealkiri), säti series_id kui puudub

Kasutus:
  python3 scripts/antik_series.py --pilot "Mirabilia" "Videviku saaga"
  python3 scripts/antik_series.py --all           # kõik sarjad (taust)
  python3 scripts/antik_series.py --list          # ainult sarjade arv
"""
import os, sys, json, re, time, html, urllib.request, urllib.parse

URL = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
AB = 'https://www.antikvariaat.eu'
UA = {'User-Agent': 'Mozilla/5.0 (raamatubaas)', 'X-Requested-With': 'XMLHttpRequest'}
HERE = os.path.dirname(os.path.abspath(__file__))

# ---------- HTTP ----------
def web(url, timeout=30):
    for a in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (404, 410): return None
            if a == 3: return None
        except Exception:
            if a == 3: return None
        time.sleep(1.5 * (a + 1))

def series_list():
    data = urllib.parse.urlencode({'query': ''}).encode()
    req = urllib.request.Request(AB + '/json.php?request=seriesautocomplete&type=', data=data, method='POST',
        headers={**UA, 'Content-Type': 'application/x-www-form-urlencoded'})
    j = json.loads(urllib.request.urlopen(req, timeout=40).read().decode())
    return [x['title'].strip() for x in j.get('data', []) if x.get('title', '').strip()]

def clean(t):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', t or ''))).strip()

def series_books(name):
    """Kõik raamatud sarjas: [{title,author,slug,cover}]."""
    out, page = [], 1
    while True:
        u = AB + '/tr%C3%BCkised/sari=' + urllib.parse.quote(name, safe='') + f'/leht={page}'
        h = web(u)
        if not h: break
        blocks = re.split(r'class="[^"]*single-product-item', h)[1:]
        if not blocks: break
        for b in blocks:
            m_url = re.search(r'data-url="([^"]+)"', b)
            m_title = re.search(r'<h3>\s*(.*?)\s*</h3>', b, re.S)
            m_auth = re.search(r'class="author">\s*(.*?)\s*<', b, re.S)
            m_img = re.search(r"background-image:url\(([^)]+)\)", b)
            if not (m_url and m_title): continue
            cover = m_img.group(1).strip("'\"") if m_img else None
            if cover and not cover.startswith('http'):
                cover = AB + '/' + cover.lstrip('./')
            out.append({'title': clean(m_title.group(1)),
                        'author': clean(m_auth.group(1)) if m_auth else '',
                        'slug': m_url.group(1), 'cover': cover})
        if len(blocks) < 10: break
        page += 1
        time.sleep(0.25)
    return out

# ---------- Supabase ----------
def sb(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    for a in range(4):
        try:
            req = urllib.request.Request(f'{URL}{path}', data=data, method=method, headers=h)
            with urllib.request.urlopen(req, timeout=60) as r:
                t = r.read().decode(); return json.loads(t) if t else None
        except urllib.error.HTTPError as e:
            if e.code == 409: return None
            if a == 3: raise
            time.sleep(2 * (a + 1))
        except Exception:
            if a == 3: raise
            time.sleep(2 * (a + 1))

def norm(s): return re.sub(r'[^0-9a-zõäöüžš ]+', ' ', (s or '').lower()).strip()
def toks(s): return {w for w in norm(s).split() if len(w) >= 3}

def get_series_id(name, cache):
    if name in cache: return cache[name]
    q = 'series?name=eq.' + urllib.parse.quote(name) + '&select=id'
    r = sb('GET', '/rest/v1/' + q)
    sid = r[0]['id'] if r else None
    cache[name] = sid
    return sid

def match_book(van_title, van_author):
    """Leia parim DB-vaste (autor+pealkiri). Tagab (id, series_id, has_cover) või None."""
    cand = {}
    va = toks(van_author)
    if van_author:
        for a in van_author.split(','):
            a = a.strip()
            if not a: continue
            q = urllib.parse.quote(f'{{"{a}"}}')
            for r in sb('GET', f'/rest/v1/books?authors=cs.{q}&select=id,title,authors,series_id,cover_front_url&limit=60') or []:
                cand[r['id']] = r
    keyt = [w for w in norm(van_title).split() if len(w) >= 6]
    if keyt:
        kw = urllib.parse.quote(max(keyt, key=len))
        for r in sb('GET', f'/rest/v1/books?title=ilike.*{kw}*&select=id,title,authors,series_id,cover_front_url&limit=60') or []:
            cand[r['id']] = r
    vt = toks(van_title)
    best = None
    for r in cand.values():
        ct = toks(r['title'])
        if not vt or not ct: continue
        cov = len(vt & ct) / min(len(vt), len(ct))
        if cov < 0.7: continue
        ca = toks(' '.join(r.get('authors') or []))
        a_ov = (len(va & ca) / len(va)) if va else 0
        if a_ov < 0.5: continue          # autor peab klappima
        score = cov + a_ov
        if best is None or score > best[0]:
            best = (score, r)
    return best[1] if best else None

def process(name, sid_cache, apply):
    books = series_books(name)
    sid = get_series_id(name, sid_cache)
    stat = {'books': len(books), 'matched': 0, 'linked': 0, 'already': 0, 'cover': 0, 'no_series_row': sid is None}
    samples = []
    for b in books:
        m = match_book(b['title'], b['author'])
        if not m: continue
        stat['matched'] += 1
        patch = {}
        if sid:
            if m.get('series_id') == sid:
                stat['already'] += 1
            elif not m.get('series_id'):
                patch['series_id'] = sid; stat['linked'] += 1
            # kui juba mõne muu sarja all -> ei kirjuta üle
        if b['cover'] and not m.get('cover_front_url'):
            patch['cover_front_url'] = b['cover']; stat['cover'] += 1
        if len(samples) < 4:
            samples.append(f"{b['author'][:18]} — {b['title'][:30]} -> {m['title'][:30]}")
        if apply and patch:
            sb('PATCH', f"/rest/v1/books?id=eq.{m['id']}", patch)
    return stat, samples

DONE = os.path.join(HERE, '.antik_done')

def ensure_series(name, cache):
    """Tagasta series_id; loo rida kui puudub."""
    sid = get_series_id(name, cache)
    if sid: return sid
    r = sb('POST', '/rest/v1/series', {'name': name}, prefer='return=representation')
    sid = r[0]['id'] if r else get_series_id(name, {})   # 409 korral loe uuesti
    cache[name] = sid
    return sid

def main():
    apply = '--all' in sys.argv
    if '--list' in sys.argv:
        print('antikvariaadi sarju:', len(series_list())); return
    sid_cache = {}
    if '--pilot' in sys.argv:
        names = sys.argv[sys.argv.index('--pilot') + 1:]
        for nm in names:
            st, samp = process(nm, sid_cache, apply=False)
            print(f"\n=== {nm} === {st}")
            for s in samp: print('   ', s)
        return
    # --all: kõik antikvariaadi sarjad, jätkatav (.antik_done)
    names = series_list()
    done = set()
    if os.path.exists(DONE):
        done = set(l.rstrip('\n') for l in open(DONE, encoding='utf-8'))
    limit = 10**9
    if '--limit' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])
    print(f'Sarju kokku {len(names)}, juba tehtud {len(done)}, selle jooksu limiit {limit}', flush=True)
    tot = {'books': 0, 'matched': 0, 'linked': 0, 'cover': 0}
    processed = 0
    for i, nm in enumerate(names, 1):
        if nm in done:
            continue
        if processed >= limit:
            print(f'Limiit {limit} täis — peatun (jätkatav .antik_done põhjal).', flush=True)
            return
        # loo puuduv sarjarida, seejärel seo
        ensure_series(nm, sid_cache)
        st, _ = process(nm, sid_cache, apply=True)
        processed += 1
        for k in tot: tot[k] += st[k]
        with open(DONE, 'a', encoding='utf-8') as f:
            f.write(nm + '\n')
        if processed % 25 == 0 or st['linked'] or st['cover']:
            print(f"[{i}/{len(names)}] {nm[:34]}: raamatuid {st['books']}, "
                  f"seotud +{st['linked']}, kaas +{st['cover']} | KOKKU {tot}", flush=True)
    print('VALMIS — kõik antikvariaadi sarjad läbi.', tot, flush=True)

if __name__ == '__main__':
    main()
