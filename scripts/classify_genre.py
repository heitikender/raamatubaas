# -*- coding: utf-8 -*-
"""Žanri-agent: loeb olemasolevad sisututvustused ja klassifitseerib žanri.

Käib läbi raamatud, millel on kirjeldus JA mida pole veel kontrollitud
(genre_checked_at is null). Kui kirjeldus viitab selgelt ulmele → genre='ulme',
detektiivi/krimile → 'kriminaalromaan'. Iga raamat märgitakse genre_checked_at'ga,
nii et midagi ei töödelda kaks korda. Klassifikaator on kohalik (võrgupäringuid
pole), seega väga kiire.

Kasutus:
  export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
  python3 scripts/classify_genre.py --all
  python3 scripts/classify_genre.py --limit 5000
"""
import json, os, sys, time
import urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from genre_rules import classify_genre

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    sys.exit('Sea SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY')
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}

def req(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer:
        h['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(5):
        try:
            r = urllib.request.Request(f'{URL}{path}', data=data, method=method, headers=h)
            with urllib.request.urlopen(r, timeout=60) as resp:
                t = resp.read().decode()
                return json.loads(t) if t else None
        except urllib.error.HTTPError as e:
            if e.code in (409,):
                return None
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))

def main():
    args = sys.argv[1:]
    limit = 10**9 if '--all' in args else 2000
    if '--limit' in args:
        limit = int(args[args.index('--limit') + 1])
    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    processed = changed = 0
    PAGE = 500
    last_id = '00000000-0000-0000-0000-000000000000'
    while processed < limit:
        rows = req('GET', '/rest/v1/books'
                   '?select=id,genre,description'
                   '&description=not.is.null&genre_checked_at=is.null'
                   f'&id=gt.{last_id}&order=id.asc&limit={PAGE}')
        if not rows:
            break
        for b in rows:
            if processed >= limit:
                break
            processed += 1
            last_id = b['id']
            g = classify_genre(b.get('description'))
            patch = {'genre_checked_at': now_iso}
            if g and g != (b.get('genre') or ''):
                patch['genre'] = g
                changed += 1
                print(f'[{processed}] {b.get("genre") or "—"} -> {g}', flush=True)
            req('PATCH', f"/rest/v1/books?id=eq.{b['id']}", patch)
    print(f'Valmis. Kontrollitud {processed}, žanr muudetud {changed}.', flush=True)

if __name__ == '__main__':
    main()
