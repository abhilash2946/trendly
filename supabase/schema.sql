drop policy if exists "public can read wardrobe images" on storage.objects;
drop policy if exists "public can read generated media" on storage.objects;
drop policy if exists "authenticated can upload wardrobe images" on storage.objects;
drop policy if exists "authenticated can update wardrobe images" on storage.objects;
drop policy if exists "authenticated can delete wardrobe images" on storage.objects;
drop policy if exists "authenticated can upload generated media" on storage.objects;
drop policy if exists "authenticated can update generated media" on storage.objects;
drop policy if exists "authenticated can delete generated media" on storage.objects;
drop policy if exists "profiles own read" on public.profiles;
drop policy if exists "profiles own write" on public.profiles;
drop policy if exists "profiles own update" on public.profiles;
drop policy if exists "user_profiles own read" on public.user_profiles;
drop policy if exists "user_profiles own write" on public.user_profiles;
drop policy if exists "user_profiles own update" on public.user_profiles;
drop policy if exists "wardrobe own" on public.wardrobe_items;
drop policy if exists "outfits own" on public.outfits;
drop policy if exists "favorites own" on public.favorite_outfits;
drop policy if exists "events own" on public.events;
drop policy if exists "hairstyles own" on public.hairstyles;
drop policy if exists "ar mirror own" on public.ar_mirror_saves;
-- Run in Supabase SQL editor

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text not null,
  date_of_birth date,
  gender text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text not null,
  date_of_birth date,
  gender text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  category text not null,
  color text,
  name text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  items text[] not null,
  combo_type text not null,
  image_url text,
  score int not null default 80,
  created_at timestamptz not null default now()
);

create table if not exists public.favorite_outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, outfit_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  location text,
  dress_code text,
  recommended_outfit text,
  date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, date)
);

create table if not exists public.hairstyles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ar_mirror_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  prompt text not null,
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_profiles enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.outfits enable row level security;
alter table public.favorite_outfits enable row level security;
alter table public.events enable row level security;
alter table public.hairstyles enable row level security;
alter table public.ar_mirror_saves enable row level security;

create policy "profiles own read" on public.profiles for select using (auth.uid() = id);
create policy "profiles own write" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles own update" on public.profiles for update using (auth.uid() = id);

create policy "user_profiles own read" on public.user_profiles for select using (auth.uid() = id);
create policy "user_profiles own write" on public.user_profiles for insert with check (auth.uid() = id);
create policy "user_profiles own update" on public.user_profiles for update using (auth.uid() = id);

create policy "wardrobe own" on public.wardrobe_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "outfits own" on public.outfits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "favorites own" on public.favorite_outfits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "events own" on public.events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "hairstyles own" on public.hairstyles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ar mirror own" on public.ar_mirror_saves for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  message text not null,
  role text not null check (role in ('user', 'assistant')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_conversations enable row level security;

drop policy if exists "conversations own" on public.ai_conversations;
create policy "conversations own" on public.ai_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('generated-media', 'generated-media', true)
on conflict (id) do nothing;

create policy "public can read wardrobe images"
on storage.objects for select
using (bucket_id = 'wardrobe-images');

create policy "public can read generated media"
on storage.objects for select
using (bucket_id = 'generated-media');

create policy "authenticated can upload wardrobe images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'wardrobe-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "authenticated can update wardrobe images"
on storage.objects for update to authenticated
using (
  bucket_id = 'wardrobe-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'wardrobe-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "authenticated can delete wardrobe images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'wardrobe-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "authenticated can upload generated media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'generated-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "authenticated can update generated media"
on storage.objects for update to authenticated
using (
  bucket_id = 'generated-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'generated-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "authenticated can delete generated media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'generated-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
