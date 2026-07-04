-- ============================================================
-- Guess the Rank — schéma Supabase
-- À exécuter dans le SQL Editor du dashboard Supabase (une fois).
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20),
  games_played integer not null default 0,
  games_won integer not null default 0,
  best_gap integer,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- lecture publique (classements futurs), écriture uniquement sur son propre profil
create policy "profiles_select_all"
  on public.profiles for select using (true);

create policy "profiles_insert_own"
  on public.profiles for insert with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id);
