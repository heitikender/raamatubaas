-- Rollid, toimetajaks-soovid, piltide RPC. Idempotentne.

-- 1) Laienda editors-tabelit rolliga
alter table public.editors add column if not exists role text not null default 'editor';
alter table public.editors add column if not exists granted_by text;
alter table public.editors add column if not exists created_at timestamptz not null default now();
alter table public.editors drop constraint if exists editors_role_chk;
alter table public.editors add constraint editors_role_chk check (role in ('editor','superadmin'));

-- Heiti = superadmin
insert into public.editors (user_email, role) values ('heiti.kender@gmail.com','superadmin')
on conflict (user_email) do update set role='superadmin';

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.editors
    where user_email = coalesce(auth.jwt() ->> 'email','') and role='superadmin');
$$;

-- 2) Toimetajaks-soovid
create table if not exists public.editor_requests (
  id uuid primary key default gen_random_uuid(),
  user_email text not null unique,
  message text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
alter table public.editor_requests drop constraint if exists er_status_chk;
alter table public.editor_requests add constraint er_status_chk check (status in ('pending','approved','rejected'));
alter table public.editor_requests enable row level security;

drop policy if exists "user insert own request" on public.editor_requests;
create policy "user insert own request" on public.editor_requests for insert
  with check (user_email = coalesce(auth.jwt() ->> 'email',''));
drop policy if exists "user update own request" on public.editor_requests;
create policy "user update own request" on public.editor_requests for update
  using (user_email = coalesce(auth.jwt() ->> 'email','')) with check (user_email = coalesce(auth.jwt() ->> 'email',''));
drop policy if exists "read requests" on public.editor_requests;
create policy "read requests" on public.editor_requests for select
  using (user_email = coalesce(auth.jwt() ->> 'email','') or public.is_editor());
drop policy if exists "editors decide requests" on public.editor_requests;
create policy "editors decide requests" on public.editor_requests for update
  using (public.is_editor()) with check (public.is_editor());

-- 3) editors-tabeli RLS: lugemine + volitamine
drop policy if exists "read own editor row" on public.editors;
drop policy if exists "editors read all editors" on public.editors;
create policy "editors read all editors" on public.editors for select
  using (public.is_editor() or user_email = coalesce(auth.jwt() ->> 'email',''));
drop policy if exists "editors grant editor" on public.editors;
create policy "editors grant editor" on public.editors for insert
  with check (public.is_editor() and role = 'editor');
drop policy if exists "superadmin grant any" on public.editors;
create policy "superadmin grant any" on public.editors for insert
  with check (public.is_superadmin());
drop policy if exists "superadmin update editor" on public.editors;
create policy "superadmin update editor" on public.editors for update
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists "superadmin delete editor" on public.editors;
create policy "superadmin delete editor" on public.editors for delete
  using (public.is_superadmin());

-- 4) Pildi määramine: tavakasutaja ainult puuduvale väljale, toimetaja igale
create or replace function public.set_book_image(p_book uuid, p_field text, p_url text)
returns void language plpgsql security definer set search_path=public as $$
declare cur text; ed boolean;
begin
  if auth.uid() is null then raise exception 'Pead olema sisse logitud'; end if;
  if p_field not in ('cover_front_url','cover_spine_url','cover_back_url','title_page_url') then
    raise exception 'Vigane väli'; end if;
  ed := public.is_editor();
  execute format('select %I from public.books where id=$1', p_field) into cur using p_book;
  if cur is not null and not ed then
    raise exception 'Sellel raamatul on sellel väljal juba pilt'; end if;
  execute format('update public.books set %I=$1, updated_at=now() where id=$2', p_field) using p_url, p_book;
end $$;
grant execute on function public.set_book_image(uuid,text,text) to authenticated;

-- 5) Storage: sisselogitud kasutaja saab covers bucketisse laadida
drop policy if exists "authed upload covers" on storage.objects;
create policy "authed upload covers" on storage.objects for insert
  with check (bucket_id='covers' and auth.uid() is not null);
