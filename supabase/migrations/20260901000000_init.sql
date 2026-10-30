-- Оценки КарТУ: схема, RLS, Storage. Та же схема — в server/app/db.py (SQLite).

create extension if not exists pgcrypto;

-- Доступ только с JWT, который выдала Edge Function verify-telegram
-- (у пользователя-владельца app_metadata.tg_owner = true; обычный пользователь
-- Supabase Auth не может сам выставить app_metadata).
create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'tg_owner')::boolean, false)
$$;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  period int not null default 1,
  hidden boolean not null default false,
  sort int not null default 0,
  rk1_official numeric(5,2) check (rk1_official between 0 and 100),
  rk2_official numeric(5,2) check (rk2_official between 0 and 100),
  exam numeric(5,2) check (exam between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete set null,
  kind text check (kind in ('lecture','practice','srop','srsp')),
  date date not null default current_date,
  path text not null,
  width int,
  height int,
  size bigint not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  date date not null default current_date,
  score numeric(5,2) not null check (score between 0 and 100),
  kind text not null check (kind in ('lecture','practice','srop','srsp')),
  source text not null check (source in ('lecturer','practitioner')),
  note text,
  photo_id uuid references public.photos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grades_subject_date on public.grades (subject_id, date);
create index if not exists photos_subject_date on public.photos (subject_id, date);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.subjects enable row level security;
alter table public.grades enable row level security;
alter table public.photos enable row level security;
alter table public.settings enable row level security;

revoke all on public.subjects, public.grades, public.photos, public.settings from anon;
grant select, insert, update, delete on public.subjects, public.grades, public.photos, public.settings to authenticated;

do $$
declare t text;
begin
  foreach t in array array['subjects','grades','photos','settings'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())',
      t
    );
  end loop;
end $$;

-- Приватный bucket для фото (до 5 МБ на файл, только картинки)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false;

drop policy if exists photos_owner_select on storage.objects;
drop policy if exists photos_owner_insert on storage.objects;
drop policy if exists photos_owner_update on storage.objects;
drop policy if exists photos_owner_delete on storage.objects;

create policy photos_owner_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_owner());
create policy photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_owner());
create policy photos_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_owner())
  with check (bucket_id = 'photos' and public.is_owner());
create policy photos_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_owner());

-- Сколько места занято (для профиля)
create or replace function public.usage_stats()
returns json
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if not public.is_owner() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return json_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects where bucket_id = 'photos'), 0)
  );
end $$;

revoke all on function public.usage_stats() from public, anon;
grant execute on function public.usage_stats() to authenticated;

-- Предметы 1 академического периода (из ИУП). id совпадают с frontend/src/data/defaults.ts
insert into public.subjects (id, name, short_name, period, sort) values
  ('00000000-0000-4000-8000-000000000001', 'История Казахстана', 'История', 1, 1),
  ('00000000-0000-4000-8000-000000000002', 'Казахский (Русский) язык', 'Каз/рус язык', 1, 2),
  ('00000000-0000-4000-8000-000000000003', 'Информационно-коммуникационные технологии', 'ИКТ', 1, 3),
  ('00000000-0000-4000-8000-000000000004', 'Иностранный язык', 'Ин. язык', 1, 4),
  ('00000000-0000-4000-8000-000000000005', 'Физическая культура', 'Физкультура', 1, 5),
  ('00000000-0000-4000-8000-000000000006', 'Математика', null, 1, 6)
on conflict (id) do nothing;

insert into public.settings (key, value) values (
  'app',
  '{"semester_start":"2026-09-01","rk1":{"from":1,"to":7},"rk2":{"from":8,"to":15},"weights":{"lecture":1,"practice":1,"srop":1,"srsp":1},"theme":"auto","period":1}'
) on conflict (key) do nothing;
