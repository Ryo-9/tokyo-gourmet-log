-- TOKYO GOURMET LOG cloud foundation (DRAFT — NOT APPLIED)
-- For a NEW or explicitly approved Supabase project only.
-- Version: 2026-11-18 / phase 1 private data synchronization
-- Keep existing GitHub Pages localStorage untouched until opted-in migration.
-- Public feed, groups, photo storage, follows and proximity are NOT enabled.
--
-- SECURITY: every public table has RLS and owner-only policies.
-- Never put a service_role/secret key in web clients.
BEGIN;

create table if not exists public.tgl_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'グルメ好き',
  about text not null default '',
  is_discoverable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tgl_profiles_nickname_length check (char_length(nickname) between 1 and 40),
  constraint tgl_profiles_about_length check (char_length(about) <= 200)
);

create table if not exists public.tgl_saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  name text not null,
  area text not null default '',
  cuisine text not null default '',
  status text not null default 'new' check (status in ('new','wish','visited')),
  note text not null default '',
  lat numeric(9,6),
  lon numeric(9,6),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id),
  unique (user_id, id),
  constraint tgl_places_name_length check (char_length(name) between 1 and 180),
  constraint tgl_places_client_id_length check (char_length(client_id) between 1 and 160),
  constraint tgl_places_text_length check (char_length(note) <= 4000),
  constraint tgl_places_latitude_range check (lat is null or (lat between -90 and 90)),
  constraint tgl_places_longitude_range check (lon is null or (lon between -180 and 180))
);

create table if not exists public.tgl_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null,
  visited_on date not null,
  rating smallint check (rating between 1 and 5),
  price_yen integer check (price_yen >= 0),
  dish text not null default '',
  note text not null default '',
  revisit text not null default '' check (revisit in ('','yes','maybe','no')),
  created_at timestamptz not null default now(),
  constraint tgl_visit_dish_length check (char_length(dish) <= 150),
  constraint tgl_visit_note_length check (char_length(note) <= 5000),
  constraint tgl_visits_place_ownership foreign key (user_id, place_id)
      references public.tgl_saved_places(user_id, id) on delete cascade
);

-- Future post foundation, but NO public viewing policies until moderation,
-- report/block, consent, and visibility UX are fully implemented.
create table if not exists public.tgl_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_name text not null,
  area_label text not null default '',
  cuisine text not null default '',
  caption text not null default '',
  visibility text not null default 'private' check (visibility in ('private','friends','public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tgl_post_place_length check (char_length(place_name) between 1 and 180),
  constraint tgl_post_caption_length check (char_length(caption) <= 2000)
);

create index if not exists tgl_saved_places_user_status on public.tgl_saved_places(user_id, status);
create index if not exists tgl_visits_user_date on public.tgl_visits(user_id, visited_on desc);
create index if not exists tgl_posts_user_created on public.tgl_posts(user_id, created_at desc);

alter table public.tgl_profiles enable row level security;
alter table public.tgl_saved_places enable row level security;
alter table public.tgl_visits enable row level security;
alter table public.tgl_posts enable row level security;

revoke all on public.tgl_profiles, public.tgl_saved_places, public.tgl_visits, public.tgl_posts from anon;
revoke all on public.tgl_profiles, public.tgl_saved_places, public.tgl_visits, public.tgl_posts from authenticated;
grant select, insert, update, delete on public.tgl_profiles, public.tgl_saved_places, public.tgl_visits, public.tgl_posts to authenticated;

-- Authenticated readers see their own rows only.
create policy "tgl_profiles_select_self" on public.tgl_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "tgl_profiles_insert_self" on public.tgl_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "tgl_profiles_update_self" on public.tgl_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "tgl_profiles_delete_self" on public.tgl_profiles
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "tgl_places_select_self" on public.tgl_saved_places
  for select to authenticated using (user_id = (select auth.uid()));
create policy "tgl_places_insert_self" on public.tgl_saved_places
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "tgl_places_update_self" on public.tgl_saved_places
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "tgl_places_delete_self" on public.tgl_saved_places
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "tgl_visits_select_self" on public.tgl_visits
  for select to authenticated using (user_id = (select auth.uid()));
create policy "tgl_visits_insert_self" on public.tgl_visits
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "tgl_visits_update_self" on public.tgl_visits
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "tgl_visits_delete_self" on public.tgl_visits
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "tgl_posts_select_self" on public.tgl_posts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "tgl_posts_insert_self" on public.tgl_posts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "tgl_posts_update_self" on public.tgl_posts
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "tgl_posts_delete_self" on public.tgl_posts
  for delete to authenticated using (user_id = (select auth.uid()));

COMMIT;

-- Manual verification after applying (do NOT assume success from a commit alone):
-- select relname, relrowsecurity from pg_class where relname like 'tgl_%';
-- Test private user A cannot SELECT/INSERT/UPDATE/DELETE user B's rows
-- through an authenticated API client. Confirm anon sees zero records.
-- Test visit cannot reference another user's saved_place UUID.
-- Test visibility='public' post is still not readable by others (expected).
-- Existing local data MUST remain until the owner reviews cloud import.
