-- Raamatute superandmebaas · Supabase skeem
-- Käivita Supabase SQL Editoris (või supabase db push kaudu).

create extension if not exists "pgcrypto";

-- ============ SARJAD ============
create table if not exists public.series (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- sarja nimi, nt "Mirabilia"
  publisher   text,                          -- kirjastus
  description text,
  created_at  timestamptz not null default now()
);

-- ============ RAAMATUD ============
create table if not exists public.books (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,            -- pealkiri
  subtitle         text,
  authors          text[] not null default '{}',  -- autor(id)
  isbn             text,                     -- kui olemas (enne 1988 reeglina pole)
  orig_language    text,                     -- originaalkeel, nt "inglise"
  language         text not null default 'eesti', -- olemasoleva raamatu keel
  publisher        text,                     -- kirjastus
  print_run        integer,                  -- tiraaž
  orig_year        integer,                  -- originaali väljaandmise aasta
  pub_year         integer,                  -- (tõlke)väljaande aasta
  series_id        uuid references public.series(id) on delete set null,
  series_position  numeric,                  -- järjekord sarjas (nt 12, 12.5)
  cover_front_url  text,                     -- esikaas
  cover_spine_url  text,                     -- selg
  cover_back_url   text,                     -- tagakaas
  title_page_url   text,                     -- tiitelleht
  description      text,                     -- sisututvustus
  genre            text,                     -- nt "ulme"
  translators      text[] not null default '{}',
  notes            text,
  slug             text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists books_pub_year_idx  on public.books (pub_year);
create index if not exists books_series_idx    on public.books (series_id, series_position);
create index if not exists books_title_idx     on public.books (lower(title));

-- ============ ALLIKAD (raamatupoed, antikvariaadid, wikid jm) ============
create table if not exists public.sources (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,   -- nt "Raamatukoi"
  kind       text not null,          -- 'pood' | 'antikvariaat' | 'bibliograafia' | 'wiki' | 'blogi' | 'raamatukogu'
  base_url   text,
  api_notes  text,                   -- kuidas masinloetavalt kätte saab
  created_at timestamptz not null default now()
);

-- Iga allikast leitud kirje iga raamatu kohta (toorandmed + link)
create table if not exists public.book_sources (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references public.books(id) on delete cascade,
  source_id  uuid not null references public.sources(id) on delete cascade,
  url        text,
  raw        jsonb,                  -- toores kirje allikast
  fetched_at timestamptz not null default now(),
  unique (book_id, source_id, url)
);

-- ============ TOIMETAJAD ============
create table if not exists public.editors (
  user_email text primary key
);

-- Lisa siia oma Google'i konto e-post:
-- insert into public.editors (user_email) values ('heiti.kender@gmail.com');

create or replace function public.is_editor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.editors
    where user_email = coalesce(auth.jwt() ->> 'email', '')
  );
$$;

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists books_touch on public.books;
create trigger books_touch before update on public.books
for each row execute function public.touch_updated_at();

-- ============ RLS ============
alter table public.series       enable row level security;
alter table public.books        enable row level security;
alter table public.sources      enable row level security;
alter table public.book_sources enable row level security;
alter table public.editors      enable row level security;

-- Avalik lugemine
create policy "public read series"       on public.series       for select using (true);
create policy "public read books"        on public.books        for select using (true);
create policy "public read sources"      on public.sources      for select using (true);
create policy "public read book_sources" on public.book_sources for select using (true);

-- Kirjutamine ainult toimetajatele
create policy "editors write series"  on public.series  for all using (public.is_editor()) with check (public.is_editor());
create policy "editors write books"   on public.books   for all using (public.is_editor()) with check (public.is_editor());
create policy "editors write sources" on public.sources for all using (public.is_editor()) with check (public.is_editor());
create policy "editors write book_sources" on public.book_sources for all using (public.is_editor()) with check (public.is_editor());

-- editors-tabelit näeb sisselogitu ainult iseenda kirje kontrolliks; muudab ainult service_role
create policy "read own editor row" on public.editors for select
  using (user_email = coalesce(auth.jwt() ->> 'email', ''));

-- ============ STORAGE ============
-- Loo bucket 'covers' (avalik). SQL-iga:
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

create policy "public read covers" on storage.objects for select
  using (bucket_id = 'covers');
create policy "editors upload covers" on storage.objects for insert
  with check (bucket_id = 'covers' and public.is_editor());
create policy "editors update covers" on storage.objects for update
  using (bucket_id = 'covers' and public.is_editor());
create policy "editors delete covers" on storage.objects for delete
  using (bucket_id = 'covers' and public.is_editor());

-- ============ ALGALLIKAD ============
insert into public.sources (name, kind, base_url, api_notes) values
  ('Raamatukoi',            'antikvariaat',  'https://www.raamatukoi.ee',        'JSON API: /api/search?q=... (vajab User-Agent päist); kaanepildid /covers/{KOOD}-lg.jpg'),
  ('ESTER',                 'raamatukogu',   'https://www.ester.ee',             'OPAC otsing search~S1*est; MARC-kirjed'),
  ('Eesti rahvusbibliograafia (ERB)', 'bibliograafia', 'https://erb.nlib.ee',    'Avaandmed, MARC21/JSON dump'),
  ('DIGAR',                 'raamatukogu',   'https://www.digar.ee',             'digiteeritud trükised, kaanepildid'),
  ('Vikipeedia (et)',       'wiki',          'https://et.wikipedia.org',         'artiklid raamatute/sarjade kohta'),
  ('Ulmekirjanduse BAAS',   'bibliograafia', 'https://baas.ulme.ee',             'ulmeteoste arvustused ja andmed'),
  ('Eesti ulme bibliograafia', 'bibliograafia', 'https://ulmebiblio.blogspot.com', 'Jüri Kallase bibliograafiablogi'),
  ('obs.ee ulmebibliograafia', 'bibliograafia', 'http://www.obs.ee/cgi-bin/w3-msql/sfbiblio/index.html', 'Tuvikese/Kallase eestikeelse ulme bibliograafia (1911–2003)'),
  ('Vanaraamat.ee',         'antikvariaat',  'https://www.vanaraamat.ee',        'kasutatud raamatud, fotod'),
  ('Vaimuvara',             'antikvariaat',  'https://vaimuvara.ee',             'WooCommerce; otsing /search/<q>/'),
  ('Apollo',                'pood',          'https://www.apollo.ee',            'uued raamatud'),
  ('Rahva Raamat',          'pood',          'https://www.rahvaraamat.ee',       'uued raamatud'),
  ('Krisostomus',           'pood',          'https://www.kriso.ee',             'uued raamatud'),
  ('Osta.ee',               'antikvariaat',  'https://www.osta.ee',              'oksjonifotod (Cloudflare kaitse)'),
  ('Kasutatudraamat.ee',    'antikvariaat',  'https://kasutatudraamat.ee',       'WooCommerce Store API: /wp-json/wc/store/v1/products?search=<q>; kaaned images[].src'),
  ('Goodreads',             'wiki',          'https://www.goodreads.com',        'kirjeldused, hinnangud')
on conflict (name) do nothing;
