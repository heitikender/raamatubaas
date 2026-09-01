# -*- coding: utf-8 -*-
"""Seob raamatud sarjadega ERB 490 välja põhjal (salvestatud notes'i sisse
kujul 'Sari (ERB): <nimi ; köide>'). Loob puuduvad sarjad ja täidab series_id.

Käib läbi raamatud, millel on notes's 'Sari (ERB): ' JA series_id on tühi.
Nimi = osa enne ' ; '; series_position = köite algusnumber, kui see on puhas arv.

Kasutus:
  export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
  python3 scripts/link_490_series.py --all --resume
"""
import json, os, sys, re, time
import urllib.request, urllib.parse, urllib.error

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    sys.exit('Sea SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY')

CURSOR = os.path.join(os.path.dirname(__file__), '.link490_cursor')
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def req(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer:
        h['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(6):
        try:
            r = urllib.request.Request(f'{URL}{path}', data=data, method=method, headers=h)
            with urllib.request.urlopen(r, timeout=60) as resp:
                t = resp.read().decode()
                return json.loads(t) if t else None
        except urllib.error.HTTPError as e:
            if e.code == 409:   # unique konflikt (sari juba olemas)
                return None
            if attempt == 5:
                raise
            time.sleep(min(20, 2 * (attempt + 1)))
        except Exception:
            if attempt == 5:
                raise
            time.sleep(min(20, 2 * (attempt + 1)))

def parse_490(notes):
    m = re.search(r'Sari \(ERB\): (.+?)(?: · |$)', notes)
    if not m:
        return None, None
    raw = m.group(1).strip()
    parts = raw.split(' ; ', 1)
    name = parts[0].strip().rstrip(' .,;:')
    vol = parts[1].strip() if len(parts) > 1 else ''
    pos = None
    mv = re.match(r'^(\d{1,4})$', vol)
    if mv:
        pos = int(mv.group(1))
    return (name or None), pos

def load_series():
    """name(lower) -> id kõigi olemasolevate sarjade jaoks."""
    cache = {}
    last = ''
    while True:
        rows = req('GET', '/rest/v1/series?select=id,name'
                   f'&name=gt.{urllib.parse.quote(last)}&order=name.asc&limit=1000')
        if not rows:
            break
        for s in rows:
            cache[s['name'].lower()] = s['id']
            last = s['name']
        if len(rows) < 1000:
            break
    return cache

def get_or_create_series(name, cache):
    key = name.lower()
    if key in cache:
        return cache[key]
    res = req('POST', '/rest/v1/series', {'name': name}, prefer='return=representation')
    if res and isinstance(res, list) and res:
        sid = res[0]['id']
    else:
        # tõenäoliselt konflikt — loe id
        got = req('GET', f'/rest/v1/series?select=id&name=eq.{urllib.parse.quote(name)}')
        sid = got[0]['id'] if got else None
    if sid:
        cache[key] = sid
    return sid

def main():
    args = sys.argv[1:]
    limit = 10**9 if '--all' in args else 1000
    if '--limit' in args:
        limit = int(args[args.index('--limit') + 1])
    resume = '--resume' in args

    print('Laen olemasolevad sarjad…', flush=True)
    cache = load_series()
    print(f'  {len(cache)} sarja mälus', flush=True)

    last_id = '00000000-0000-0000-0000-000000000000'
    if resume and os.path.exists(CURSOR):
        last_id = open(CURSOR).read().strip() or last_id

    processed = 0
    linked = 0
    PAGE = 200
    while processed < limit:
        rows = req('GET', '/rest/v1/books'
                   '?select=id,notes'
                   '&notes=ilike.*Sari%20(ERB):*&series_id=is.null'
                   f'&id=gt.{last_id}&order=id.asc&limit={PAGE}')
        if not rows:
            break
        for b in rows:
            processed += 1
            last_id = b['id']
            name, pos = parse_490(b.get('notes') or '')
            if not name:
                continue
            sid = get_or_create_series(name, cache)
            if not sid:
                continue
            patch = {'series_id': sid}
            if pos is not None:
                patch['series_position'] = pos
            req('PATCH', f"/rest/v1/books?id=eq.{b['id']}", patch)
            linked += 1
            if linked % 100 == 0:
                print(f'  seotud {linked} · sarju {len(cache)} · viimane "{name[:40]}"', flush=True)
        open(CURSOR, 'w').write(last_id)

    print(f'Valmis. Seotud {linked} raamatut, sarju kokku {len(cache)}.', flush=True)

if __name__ == '__main__':
    main()
