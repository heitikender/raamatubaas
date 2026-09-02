# -*- coding: utf-8 -*-
"""Žanri heuristiline klassifitseerimine sisututvustuse põhjal.

classify_genre(kirjeldus) -> 'ulme' | 'kriminaalromaan' | None

Kasutatakse nii rikastusagendis (harvest_enrich.py) kui eraldi
žanri-agendis (classify_genre.py). Tagastab žanri ainult siis, kui on
selge signaal — muidu None (žanri ei muudeta).
"""

# Selged žanrimärksõnad (üksainus piisab)
ULME_STRONG = [
    'ulmeromaan', 'ulmejutt', 'ulmelugu', 'ulmenovell', 'teadusulme',
    'ulmekirjand', 'ulmeklassik', 'ulmežanr', 'ulmeraamat', 'ulmeteos',
    'science fiction', 'science-fiction',
]
KRIMI_STRONG = [
    'kriminaalromaan', 'krimiromaan', 'kriminaaljutt', 'krimilugu',
    'detektiiviromaan', 'detektiivilugu', 'krimipõnevik', 'kriminaallugu',
]

# Temaatilised tüved (vaja vähemalt 2 erinevat, ja rohkem kui teisel poolel)
ULME_THEME = [
    'kosmos', 'tulnuk', 'robot', 'android', 'ajamasin', 'ajaränd', 'ajarännak',
    'teleport', 'düstoop', 'postapokalüp', 'galaktik', 'teisel planeedil',
    'ulmeline', 'tulevikumaailm', 'kauge tuleviku', 'maaväline', 'maavälise',
    'tähelaev', 'aegruum', 'kosmoselaev', 'teine planeet',
]
KRIMI_THEME = [
    'detektiiv', 'mõrv', 'mõrtsuk', 'politsei', 'komissar', 'inspektor',
    'juurdlus', 'kuriteg', 'kuriteo', 'tapmi', 'eeluurimi', 'salapolitsei',
    'sarimõrv', 'mõistatuslik surm', 'laip',
]


def classify_genre(description):
    d = (description or '').lower()
    if len(d) < 25:
        return None
    if any(k in d for k in ULME_STRONG):
        return 'ulme'
    if any(k in d for k in KRIMI_STRONG):
        return 'kriminaalromaan'
    u = sum(1 for k in ULME_THEME if k in d)
    c = sum(1 for k in KRIMI_THEME if k in d)
    if u >= 2 and u > c:
        return 'ulme'
    if c >= 2 and c > u:
        return 'kriminaalromaan'
    return None
