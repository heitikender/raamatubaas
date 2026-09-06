# -*- coding: utf-8 -*-
"""Uuesti-klassifitseerimine uute genre_rules reeglitega KÕIGI kirjeldusega
raamatute üle (ei arvesta genre_checked_at). Muudab žanri ainult siis, kui
klassifikaator annab tulemuse ja see erineb praegusest.

  python3 scripts/reclassify_genre.py --dry           # ainult loenda + näidised
  python3 scripts/reclassify_genre.py --apply         # kirjuta muudatused
"""
import json, os, sys, time, urllib.request, urllib.error
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from genre_rules import classify_genre

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    sys.exit('Sea SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY')
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(5):
        try:
            r = urllib.request.Request(f'{URL}{path}', data=data, method=method, headers=H)
            with urllib.request.urlopen(r, timeout=60) as resp:
                t = resp.read().decode()
                return json.loads(t) if t else None
        except urllib.error.HTTPError as e:
            if e.code == 409:
                return None
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))


def main():
    apply = '--apply' in sys.argv
    processed = 0
    changes = Counter()          # (from_genre -> to_genre)
    samples = {'ulme': [], 'kriminaalromaan': []}
    PAGE = 1000
    last_id = '00000000-0000-0000-0000-000000000000'
    while True:
        rows = req('GET', '/rest/v1/books'
                   '?select=id,title,genre,description'
                   '&description=not.is.null'
                   f'&id=gt.{last_id}&order=id.asc&limit={PAGE}')
        if not rows:
            break
        for b in rows:
            processed += 1
            last_id = b['id']
            cur = b.get('genre') or ''
            g = classify_genre(b.get('description'), cur)
            if g and g != cur:
                changes[(cur or '—', g)] += 1
                if len(samples[g]) < 25:
                    samples[g].append((cur or '—', b['title'][:44],
                                       (b['description'] or '')[:90].replace('\n', ' ')))
                if apply:
                    req('PATCH', f"/rest/v1/books?id=eq.{b['id']}", {'genre': g})
    total_ulme = sum(n for (f, t), n in changes.items() if t == 'ulme')
    total_krimi = sum(n for (f, t), n in changes.items() if t == 'kriminaalromaan')
    print(f'\nTöödeldud {processed} kirjeldusega raamatut.')
    print(f'Muutuks -> ulme: {total_ulme}, -> kriminaalromaan: {total_krimi}\n')
    print('Muutused žanrite kaupa (praegune -> uus : arv):')
    for (f, t), n in changes.most_common():
        print(f'  {f:>22} -> {t:<16} : {n}')
    for g in ('ulme', 'kriminaalromaan'):
        print(f'\n--- näidised -> {g} ---')
        for cur, title, desc in samples[g]:
            print(f'  [{cur}] {title} :: {desc}')
    if apply:
        print('\n>>> Muudatused KIRJUTATUD.')
    else:
        print('\n(kuiv jooks — midagi ei kirjutatud; --apply kirjutamiseks)')


if __name__ == '__main__':
    main()
