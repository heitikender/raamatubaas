# -*- coding: utf-8 -*-
"""Korjeagent nr 2: Eesti rahvusbibliograafia (ERB) — kõik eesti keeles ilmunud raamatud.

Allikas: Rahvusraamatukogu OAI-PMH, set=raamat (eestikeelsed raamatud, ~230 000 kirjet),
MARC21XML, litsents CC0. Voogesitab kirjed, teisendab books-skeemi ja upsertib Supabase'i
(võti erb_id), lisades igale raamatule book_sources viite ERB kirjele.

Resumable: viimane resumptionToken salvestatakse faili .erb_token, --resume jätkab sealt.

Kasutus:
  export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
  python3 scripts/harvest_erb.py --max-pages 4      # test (4 lehte = 2000 kirjet)
  python3 scripts/harvest_erb.py --all --resume     # täiskorje, jätkatav
"""
import json, os, sys, time, re
import urllib.request, urllib.parse, urllib.error
import xml.etree.ElementTree as ET

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not URL or not KEY:
    sys.exit('Sea SUPABASE_URL ja SUPABASE_SERVICE_ROLE_KEY')

OAI = 'https://data.digar.ee/repox/OAIHandler'
TOKEN_FILE = os.path.join(os.path.dirname(__file__), '.erb_token')
MARC_NS = '{http://www.loc.gov/MARC21/slim}'

# MARC keelekoodid -> eesti keele nimi (originaalkeele jaoks, 041 $h)
LANG = {
    'eng':'inglise','rus':'vene','ger':'saksa','deu':'saksa','fre':'prantsuse','fra':'prantsuse',
    'fin':'soome','swe':'rootsi','pol':'poola','lat':'ladina','lav':'läti','lit':'leedu',
    'ita':'itaalia','spa':'hispaania','cze':'tšehhi','ces':'tšehhi','hun':'ungari','nor':'norra',
    'dan':'taani','dut':'hollandi','nld':'hollandi','ukr':'ukraina','bul':'bulgaaria','jpn':'jaapani',
    'chi':'hiina','zho':'hiina','gre':'kreeka','ell':'kreeka','heb':'heebrea','ara':'araabia',
    'arm':'armeenia','geo':'gruusia','est':'eesti','tur':'türgi','ron':'rumeenia','rum':'rumeenia',
    'slo':'slovaki','slk':'slovaki','slv':'sloveeni','srp':'serbia','hrv':'horvaadi','por':'portugali',
}

# ---------- HTTP ----------
def http_get(url, timeout=90):
    req = urllib.request.Request(url, headers={'User-Agent': 'raamatubaas-erb-harvester/1.0'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))

def sb(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'{URL}{path}', data=data, method=method, headers=h)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                t = r.read().decode()
                return json.loads(t) if t else None
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            if e.code in (502, 503, 504) and attempt < 3:
                time.sleep(3 * (attempt + 1)); continue
            raise RuntimeError(f'{method} {path} -> {e.code}: {detail}') from None
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3: raise
            time.sleep(3 * (attempt + 1))

# ---------- MARC parse ----------
def clean(s, trail=' /:;,.'):
    return (s or '').strip().strip(trail).strip()

def flip_name(n):
    """'Laar, Mart' -> 'Mart Laar'; jätab muu kujul nime alles."""
    n = clean(n)
    if n.count(',') == 1:
        a, b = [p.strip() for p in n.split(',')]
        if a and b:
            return f'{b} {a}'
    return n

def get_subs(df, code):
    return [clean(v) for c, v in df if c == code and clean(v)]

def parse_record(rec_el):
    cf, dfs = {}, []
    for el in rec_el.iter():
        tag = el.tag.replace(MARC_NS, '')
        if tag == 'controlfield':
            cf[el.get('tag')] = el.text or ''
        elif tag == 'datafield':
            subs = [(s.get('code'), s.text or '') for s in el if s.tag.replace(MARC_NS, '') == 'subfield']
            dfs.append((el.get('tag'), subs))

    erb_id = cf.get('001', '').strip()
    if not erb_id:
        return None
    f008 = cf.get('008', '')
    year = None
    if len(f008) >= 11 and f008[7:11].isdigit():
        year = int(f008[7:11])
    lang = clean(f008[35:38]) if len(f008) >= 38 else 'est'

    df = {}
    for tag, subs in dfs:
        df.setdefault(tag, []).append(subs)

    # pealkiri / alapealkiri
    title = subtitle = None
    if '245' in df:
        a = get_subs(df['245'][0], 'a')
        b = get_subs(df['245'][0], 'b')
        title = clean(a[0]) if a else None
        subtitle = clean(b[0]) if b else None
    if not title:
        return None

    # autorid ja tõlkijad (100 = põhiautor, 700 = lisakirje; relaator $e / $4)
    authors, translators = [], []
    def relator(subs):
        return ' '.join(get_subs(subs, 'e') + get_subs(subs, '4')).lower()
    for subs in df.get('100', []):
        nm = get_subs(subs, 'a')
        if nm: authors.append(flip_name(nm[0]))
    for subs in df.get('700', []):
        nm = get_subs(subs, 'a')
        if not nm: continue
        rel = relator(subs)
        if 'tõlk' in rel:
            translators.append(flip_name(nm[0]))
        elif ('toimeta' in rel or 'illustr' in rel or 'koost' in rel or 'kunstnik' in rel
              or 'kujund' in rel or 'fotograaf' in rel or 'saate' in rel):
            continue
        else:
            authors.append(flip_name(nm[0]))
    # 110/710 = kollektiivautor
    for subs in df.get('110', []):
        nm = get_subs(subs, 'a')
        if nm and not authors: authors.append(clean(nm[0]))
    # eemalda autoritest need, kes on juba tõlkijad; kaota kordused järjekorda hoides
    authors = [a for a in dict.fromkeys(authors) if a not in translators]
    translators = list(dict.fromkeys(translators))

    # ISBN (esimene 020 $a, ainult numbrid + X)
    isbn = None
    for subs in df.get('020', []):
        a = get_subs(subs, 'a')
        if a:
            cand = re.sub(r'[^0-9Xx]', '', a[0])
            if len(cand) in (10, 13):
                isbn = cand.upper(); break

    # kirjastus / ilmumiskoht / aasta (260 või 264)
    publisher = place = None
    year260 = None
    for tag in ('260', '264'):
        if tag in df:
            subs = df[tag][0]
            pl = get_subs(subs, 'a'); pb = get_subs(subs, 'b'); yr = get_subs(subs, 'c')
            if pl and not place: place = clean(pl[0])
            if pb and not publisher: publisher = clean(pb[0])
            if yr and not year260:
                m = re.search(r'(\d{4})', yr[0])
                if m: year260 = int(m.group(1))
            if publisher: break
    if year is None:
        year = year260

    # originaalkeel (041 $h) ja originaalpealkiri (240 $a)
    orig_lang = None
    for subs in df.get('041', []):
        h = get_subs(subs, 'h')
        if h:
            orig_lang = LANG.get(h[0][:3].lower())
            break
    orig_title = None
    if '240' in df:
        a = get_subs(df['240'][0], 'a')
        if a: orig_title = clean(a[0])
    if not orig_title and '130' in df:
        a = get_subs(df['130'][0], 'a')
        if a: orig_title = clean(a[0])

    # žanr / vorm (655 $a; nt "romaanid", "luuletused", "aimekirjandus")
    genre = None
    genres = []
    for subs in df.get('655', []):
        a = get_subs(subs, 'a')
        if a:
            g = re.sub(r'\s*\([^)]*\)\s*$', '', a[0]).strip(' .,;:').strip()
            if g and g.lower() not in [x.lower() for x in genres]:
                genres.append(g)
    if genres:
        genre = genres[0].lower()

    # sari (490 $a + $v)
    series_raw = None
    if '490' in df:
        a = get_subs(df['490'][0], 'a'); v = get_subs(df['490'][0], 'v')
        if a:
            series_raw = clean(a[0], ' =:;,.')
            if v: series_raw += f' ; {clean(v[0])}'

    # tiraaž (500 märkusest "Tiraaž NNNN")
    print_run = None
    notes_extra = []
    for subs in df.get('500', []):
        a = get_subs(subs, 'a')
        if not a: continue
        note = a[0]
        m = re.search(r'[Tt]iraaž[^\d]{0,6}(\d[\d ]{0,7}\d)', note)
        if m and print_run is None:
            digits = re.sub(r'\D', '', m.group(1))
            if digits:
                val = int(digits)
                if 1 <= val <= 5000000:
                    print_run = val

    # märkused kokku
    notes = []
    if place: notes.append(f'Ilmumiskoht: {place}')
    if series_raw: notes.append(f'Sari (ERB): {series_raw}')
    if orig_title: notes.append(f'Originaalpealkiri: {orig_title}')
    notes.append('Allikas: Eesti rahvusbibliograafia (ERB)')

    return {
        'erb_id': erb_id,
        'title': title,
        'subtitle': subtitle,
        'authors': authors[:6],
        'translators': translators[:6],
        'isbn': isbn,
        'orig_language': orig_lang,
        'language': lang or 'eesti',
        'publisher': publisher,
        'print_run': print_run,
        'pub_year': year,
        'genre': genre,
        'notes': ' · '.join(notes),
    }

# ---------- upsert ----------
def get_source_id(name):
    r = sb('GET', f'/rest/v1/sources?select=id&name=eq.{urllib.parse.quote(name)}')
    if r:
        return r[0]['id']
    r = sb('POST', '/rest/v1/sources',
           {'name': name, 'kind': 'bibliograafia', 'base_url': 'https://erb.nlib.ee',
            'api_notes': 'OAI-PMH data.digar.ee/repox/OAIHandler set=raamat, MARC21XML, CC0'},
           prefer='return=representation')
    return r[0]['id']

def flush(rows, src_id):
    """Lisab ainult uued kirjed (erb_id järgi); olemasolevaid ei dubleeri."""
    if not rows:
        return 0
    # dedupe ka partii sees
    seen = {}
    for r in rows:
        seen[r['erb_id']] = r
    rows = list(seen.values())

    erb_ids = [r['erb_id'] for r in rows]
    id_by_erb = {}
    existing_ids = set()
    # tükelda in.() päring, et URL ei läheks liiga pikaks
    for i in range(0, len(erb_ids), 200):
        chunk = erb_ids[i:i + 200]
        lst = ','.join(chunk)
        ex = sb('GET', f'/rest/v1/books?select=id,erb_id&erb_id=in.({lst})')
        for g in ex or []:
            id_by_erb[g['erb_id']] = g['id']
            existing_ids.add(g['erb_id'])

    # täienda olemasolevatel žanr (kui puudu) — ainult kui GENRE_BACKFILL=1
    # (muidu jäetakse vahele, et import jõuaks kiiresti puuduvate kirjeteni)
    if os.environ.get('GENRE_BACKFILL') == '1':
        by_genre = {}
        for r in rows:
            if r['erb_id'] in existing_ids and r.get('genre'):
                by_genre.setdefault(r['genre'], []).append(r['erb_id'])
        for g, ids in by_genre.items():
            for i in range(0, len(ids), 150):
                lst = ','.join(ids[i:i + 150])
                try:
                    sb('PATCH', f'/rest/v1/books?erb_id=in.({lst})&genre=is.null',
                       {'genre': g})
                except RuntimeError:
                    pass

    new_rows = [r for r in rows if r['erb_id'] not in id_by_erb]
    if new_rows:
        try:
            got = sb('POST', '/rest/v1/books', new_rows, prefer='return=representation')
        except RuntimeError:
            # üks vigane rida ei tohi tervet partiid nurjata — proovi ridu ükshaaval
            got = []
            for r in new_rows:
                try:
                    got += sb('POST', '/rest/v1/books', [r], prefer='return=representation') or []
                except RuntimeError as e:
                    print('  (vahele jäetud:', r.get('erb_id'), str(e)[:70], ')')
        for g in got or []:
            if g.get('erb_id'):
                id_by_erb[g['erb_id']] = g['id']
    new_rows = [r for r in new_rows if r['erb_id'] in id_by_erb]

    # book_sources viited ainult uutele (väldib unikaalsuse konflikti korduskäivitusel)
    bs = []
    for r in new_rows:
        bid = id_by_erb.get(r['erb_id'])
        if bid:
            bs.append({'book_id': bid, 'source_id': src_id,
                       'url': f"https://erb.nlib.ee/?otsi={r['erb_id']}",
                       'raw': {'erb_id': r['erb_id'], 'isbn': r.get('isbn')}})
    if bs:
        try:
            sb('POST', '/rest/v1/book_sources', bs)
        except RuntimeError as e:
            print('  (book_sources hoiatus:', str(e)[:80], ')')
    return len(new_rows)

# ---------- main ----------
def main():
    args = sys.argv[1:]
    all_mode = '--all' in args
    resume = '--resume' in args
    max_pages = 10**9 if all_mode else 4
    if '--max-pages' in args:
        max_pages = int(args[args.index('--max-pages') + 1])

    src_id = get_source_id('Eesti rahvusbibliograafia (ERB)')

    token = None
    if resume and os.path.exists(TOKEN_FILE):
        token = open(TOKEN_FILE).read().strip() or None
        print('Jätkan tokeniga:', token[:40] if token else None)

    if token:
        url = f'{OAI}?verb=ListRecords&resumptionToken={urllib.parse.quote(token)}'
    else:
        url = f'{OAI}?verb=ListRecords&set=raamat&metadataPrefix=marc21xml'

    total_up = 0
    for page in range(1, max_pages + 1):
        raw = http_get(url)
        root = ET.fromstring(raw)
        recs = root.findall('.//' + '{http://www.openarchives.org/OAI/2.0/}record')
        rows = []
        for rec in recs:
            md = rec.find('{http://www.openarchives.org/OAI/2.0/}metadata')
            if md is None:
                continue  # kustutatud kirje
            marc = md.find(MARC_NS + 'record')
            if marc is None:
                continue
            row = parse_record(marc)
            if row and row['pub_year']:
                rows.append(row)
        up = flush(rows, src_id)
        total_up += up

        rt_el = root.find('.//{http://www.openarchives.org/OAI/2.0/}resumptionToken')
        rt = rt_el.text.strip() if (rt_el is not None and rt_el.text) else None
        size = rt_el.get('completeListSize') if rt_el is not None else '?'
        cursor = rt_el.get('cursor') if rt_el is not None else '?'
        print(f'leht {page}: {len(recs)} kirjet, upsert {up} (kokku {total_up}) · kursor {cursor}/{size}')

        if rt:
            open(TOKEN_FILE, 'w').write(rt)
        else:
            print('ERB voog läbi.')
            if os.path.exists(TOKEN_FILE):
                os.remove(TOKEN_FILE)
            break
        url = f'{OAI}?verb=ListRecords&resumptionToken={urllib.parse.quote(rt)}'
        time.sleep(1)

    print(f'Valmis. Upsertitud kokku {total_up} raamatut.')

if __name__ == '__main__':
    main()
