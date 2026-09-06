# -*- coding: utf-8 -*-
"""Žanri heuristiline klassifitseerimine sisututvustuse põhjal.

classify_genre(kirjeldus, praegune_žanr=None) -> 'ulme' | 'kriminaalromaan' | None

Kasutatakse nii rikastusagendis (harvest_enrich.py) kui eraldi
žanri-agendis (classify_genre.py). Tagastab žanri ainult siis, kui on
selge signaal — muidu None (žanri ei muudeta).

Eestis on "ulme" katusžanr (nii teadusulme kui fantaasia). Reeglid on
kalibreeritud päris baasi sisututvustuste järgi: tugevad märksõnad
(üksainus piisab) on need, mis praktikas peaaegu alati tähistavad
ulmet/krimit; temaatilised tüved on nõrgemad ja vajavad vähemalt kahte
erinevat (ning rohkem kui vastaspoolel).
"""

# --- Selged žanrimärksõnad (üksainus piisab) ---------------------------------
# NB: "ulmeline"/"ulmelis" TAHTLIKULT välja jäetud — tähendab sageli
# "unenäoline/sürreaalne" ka mitte-ulme kontekstis.
ULME_STRONG = [
    'ulmeromaan', 'ulmejutt', 'ulmelugu', 'ulmenovell', 'teadusulme',
    'ulmekirjand', 'ulmekirjan', 'ulmeklassik', 'ulmežanr', 'ulmeraamat',
    'ulmeteos', 'ulmeantoloogia', 'ulme antoloogia', 'ulmesar',
    'ulmeühing', 'ulmeauhind', 'ulmelugej', 'ulmest', 'ulmeulme',
    'science fiction', 'science-fiction',
    'eesti ulme', 'vene ulme', 'briti ulme', 'ameerika ulme',
    'düstoop', 'düstoopili',   # 1984, Testamendid jne — puhas signaal
]
KRIMI_STRONG = [
    'kriminaalromaan', 'krimiromaan', 'kriminaaljutt', 'krimilugu',
    'detektiiviromaan', 'detektiivilugu', 'krimipõnevik', 'kriminaallugu',
    'krimikirjand', 'krimiklassik', 'põnevik ', 'kriminaalpõnevik',
]

# --- Temaatilised tüved (vaja vähemalt 2 erinevat, rohkem kui teisel poolel) --
ULME_THEME = [
    'kosmos', 'kosmoselaev', 'tähelaev', 'tulnuk', 'maaväline', 'maavälise',
    'robot', 'android', 'tehisintellek', 'tehismõistus', 'küborg',
    'ajamasin', 'ajaränd', 'ajarännak', 'teleport', 'aegruum',
    'postapokalüp', 'apokalüp', 'galakti', 'planeedil', 'planeedile',
    'teisel planeedil', 'teine planeet', 'tulevikumaailm', 'kaugtulevik',
    'kauges tulevikus', 'aastat tulevikus', 'sajandite pärast',
    'kloon', 'geneetiliselt muundatud', 'virtuaalreaalsus', 'kübermaailm',
    'marsil', 'kosmoserännak', 'ufo', 'tulnukas', 'ulmeline',
]
KRIMI_THEME = [
    'detektiiv', 'mõrv', 'mõrtsuk', 'politsei', 'komissar', 'inspektor',
    'juurdlus', 'kuriteg', 'kuriteo', 'tapmi', 'eeluurimi', 'salapolitsei',
    'sarimõrv', 'mõistatuslik surm', 'laip', 'uurija', 'reamõrv',
]

# Žanrid, kus temaatilised märksõnad on tõenäoliselt juhuslikud
# (aime-/teatmekirjandus, luule jm) — neid EI klassifitseerita ümber
# ainult temaatiliste tüvede põhjal (tugev märksõna endiselt kehtib).
NON_NARRATIVE = {
    'aimekirjandus', 'õpikud', 'kooliõpikud', 'õppematerjalid',
    'teatmeteosed', 'sõnaraamatud', 'käsiraamatud', 'aforismid',
    'luuletused', 'luule', 'reisijuhid', 'reisikirjad', 'reisikiri',
    'kokaraamatud', 'artiklikogumikud',
    'biograafiad', 'mälestused', 'intervjuud', 'harduskirjandus',
    'liikluseeskirjad', 'värvimisraamatud', 'juubeliväljaanded',
    'võrguväljaanded', 'seadused', 'määrused', 'kataloogid',
}


def classify_genre(description, current_genre=None):
    d = (description or '').lower()
    if len(d) < 25:
        return None
    if any(k in d for k in ULME_STRONG):
        return 'ulme'
    if any(k in d for k in KRIMI_STRONG):
        return 'kriminaalromaan'
    u = sum(1 for k in ULME_THEME if k in d)
    c = sum(1 for k in KRIMI_THEME if k in d)
    cur = (current_genre or '').strip().lower()
    if cur in NON_NARRATIVE:
        return None                      # ainult tugev märksõna lubatud
    if u >= 2 and u > c:
        return 'ulme'
    if c >= 2 and c > u:
        return 'kriminaalromaan'
    return None
