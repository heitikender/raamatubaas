# Raamatubaas

Eesti keeles ilmunud raamatute superandmebaas: Next.js (Vercel) + Supabase (Postgres, Auth, Storage).
Avalik sirvimine kõigile, muutmine Google'i loginiga toimetajatele.

## Seadistus

### 1. Supabase
1. Ava oma Supabase projekt → **SQL Editor** → kleebi ja käivita `supabase/schema.sql`.
2. Lisa ennast toimetajaks:
   ```sql
   insert into public.editors (user_email) values ('sinu.email@gmail.com');
   ```
3. **Authentication → Providers → Google** → lülita sisse.
   - Google Cloud Console'is (console.cloud.google.com) loo OAuth 2.0 Client ID (Web application).
   - Authorized redirect URI: `https://SINU-PROJEKT.supabase.co/auth/v1/callback`
   - Kopeeri Client ID ja Client Secret Supabase'i Google provideri seadetesse.
4. **Authentication → URL Configuration**: Site URL = sinu Verceli aadress (nt `https://raamatubaas.vercel.app`),
   lisa sama ka Redirect URLs alla (ja arenduseks `http://localhost:3000`).

### 2. Rakendus
```bash
npm install
cp .env.example .env.local   # täida NEXT_PUBLIC_SUPABASE_URL ja NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:3000
```

### 3. Vercel
- Impordi see repo (või `vercel deploy`), lisa Environment Variables:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Service role võtit Vercelisse EI lähe — seda kasutavad ainult skriptid.

### 4. Andmete seemendamine (61 ulmeraamatut 1970–1991 + kaanepildid)
```bash
export SUPABASE_URL=https://SINU-PROJEKT.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
python3 scripts/seed.py
```

### 5. Korjeagendid
- `scripts/harvest_raamatukoi.py` — otsib igale raamatule Raamatukoi kirje, salvestab toorkirje
  `book_sources` tabelisse ja täidab puuduvad kaanepildid.
- Uued allikad lisa `sources` tabelisse; iga korjeskript kirjutab leiud `book_sources`-i
  (toores JSON + URL), nii et iga fakti päritolu on tagantjärele tuvastatav.

## Andmemudel
- `books` — pealkiri, autorid[], ISBN, originaalkeel, keel, kirjastus, tiraaž, originaali aasta,
  väljaande aasta, sari + nr, 4 pilti (esikaas/selg/tagakaas/tiitelleht), sisututvustus, tõlkijad[].
- `series` — sarja nimi, kirjastus, kirjeldus; raamatud järjestatakse `series_position` järgi.
- `sources` — allikate register (poed, antikvariaadid, bibliograafiad, wikid).
- `book_sources` — iga allikast leitud kirje (toores JSON + URL + aeg) raamatu kohta.
- `editors` — toimetajate e-postid; RLS lubab kirjutada ainult neil.
