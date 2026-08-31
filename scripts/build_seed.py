# -*- coding: utf-8 -*-
"""Genereerib seed_data.json 1970–1991 ulmenimekirjast (/home/claude/ulme/data.py)."""
import json, re, sys, shutil, os

sys.path.insert(0, '/home/claude/ulme')
from data import BOOKS  # (id, aasta, autor, pealkiri, sari, markus, aeg)

ORIG_LANG = {
    'vercors1970':'prantsuse','calvino1971':'itaalia','palei1971':'vene','vonnegut1971':'inglise',
    'laoshe1972':'hiina','asimov1973':'inglise','boulle1973':'prantsuse','kellermann1973':'saksa',
    'saginjan1973':'vene','bradbury1974':'inglise','jemtsev1974':'vene','botond1975':'ungari',
    'crichton1975':'inglise','simak1975':'inglise','strugatski1975':'vene','diogenese1976':'vene',
    'lilled1976':'inglise','hellat1976':None,'lem1976':'poola','tolkien1977':'inglise',
    'hellat1978':None,'simonjan1978':'armeenia','vallikivi1978':None,'merle1980':'prantsuse',
    'grin1980':'vene','clarke1981':'inglise','leguin1981':'inglise','eloon1981':None,
    'abramov1982':'vene','laipaik1982':None,'preussler1982':'saksa','verne1982':'prantsuse',
    'aitmatov1983':'vene','sefner1983':'vene','mirer1984':'vene','parnov1984':'vene',
    'shelley1984':'inglise','asimov1985':'inglise','wahloo1985':'rootsi','varsavski1985':'vene',
    'capek1985':'tšehhi','strugatski1987':'vene','vetemaa1987':None,'abramov1988':'vene',
    'peevski1988':'bulgaaria','bulgakov1988':'vene','bringsvaerd1988':'norra','eloon1988':None,
    'lem1989':'poola','rosny1989':'prantsuse','simak1989':'inglise','asimov1989':'inglise',
    'huxley1989':'inglise','jersild1990':'rootsi','orwell1990':'inglise','wyndham1990':'inglise',
    'lattik1990':None,'raud1990':None,'sinilaid1991a':None,'sinilaid1991b':None,'paju1991':None,
}

SERIES = {
    'Mirabilia': 'Eesti Raamat',
    'Loomingu Raamatukogu': 'Perioodika',
    'Ajast aega': 'Eesti Raamat',
    'Põnevik': 'Eesti Raamat',
}

def orig_year(markus):
    m = re.search(r'\((\d{4})\)', markus)
    return int(m.group(1)) if m else None

def translators(markus):
    m = re.search(r'tlk ([^·]+)', markus)
    return [t.strip() for t in m.group(1).split(',')] if m else []

books, series = [], {}
for name, pub in SERIES.items():
    series[name] = {'name': name, 'publisher': pub}

for (bid, aasta, autor, pealkiri, sari, markus, aeg) in BOOKS:
    s_name = sari if sari in SERIES else None
    publisher = SERIES.get(sari) if s_name else (sari or None)  # "Eesti Raamat" sari-väljal = kirjastus
    o_lang = ORIG_LANG.get(bid)
    books.append({
        'seed_id': bid,
        'title': pealkiri,
        'authors': [a.strip() for a in re.split(r',| ja ', autor) if a.strip() and 'antoloogia' not in a] or [autor],
        'orig_language': o_lang,
        'language': 'eesti',
        'publisher': publisher,
        'orig_year': orig_year(markus) if o_lang else None,
        'pub_year': aasta,
        'series': s_name,
        'genre': 'ulme',
        'translators': translators(markus),
        'description': None,
        'notes': markus + (' · ajaränd' if aeg == 'core' else (' · ajanihe/dilatatsioon' if aeg == 'dila' else '')),
        'cover_file': f'{bid}.jpg',
    })

os.makedirs('scripts/covers', exist_ok=True)
for b in books:
    src = f'/home/claude/ulme/covers/{b["cover_file"]}'
    if os.path.exists(src):
        shutil.copy(src, f'scripts/covers/{b["cover_file"]}')
    else:
        b['cover_file'] = None

json.dump({'series': list(series.values()), 'books': books},
          open('scripts/seed_data.json', 'w'), ensure_ascii=False, indent=1)
print(f'{len(books)} raamatut, {len(series)} sarja -> scripts/seed_data.json')
