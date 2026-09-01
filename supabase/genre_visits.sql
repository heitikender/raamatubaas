-- Žanri-typeahead allikas
create index if not exists books_genre_idx on public.books (genre) where genre is not null;
create or replace view public.genre_counts as
  select genre as name, count(*)::int as book_count
  from public.books where genre is not null and genre <> '' group by genre;
grant select on public.genre_counts to anon, authenticated;

-- Külastused
create table if not exists public.visits (
  id bigint generated always as identity primary key,
  path text,
  created_at timestamptz not null default now()
);
alter table public.visits enable row level security;
drop policy if exists "anyone insert visit" on public.visits;
create policy "anyone insert visit" on public.visits for insert with check (true);
drop policy if exists "anyone read visits" on public.visits;
create policy "anyone read visits" on public.visits for select using (true);
create index if not exists visits_created_idx on public.visits (created_at desc);
