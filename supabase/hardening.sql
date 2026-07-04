-- ============================================================
-- Guess the Rank — durcissement (à coller une fois dans le SQL Editor)
-- 1. Les stats de profil ne sont plus modifiables librement par le
--    client : uniquement via la RPC record_game (incréments bornés).
-- 2. Table error_events pour la télémétrie d'erreurs (insert-only).
-- ============================================================

-- plus d'update direct ; l'insert initial doit partir de stats vierges
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id and games_played = 0 and games_won = 0 and best_gap is null);

-- une partie enregistrée = +1 séance, +0/1 victoire, meilleur écart qui ne
-- peut que s'améliorer. security definer : contourne RLS, valide les bornes.
create or replace function public.record_game(p_won boolean, p_best_gap integer default null)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  result public.profiles;
begin
  if p_best_gap is not null and (p_best_gap < 0 or p_best_gap > 10000) then
    p_best_gap := null;
  end if;
  update public.profiles set
    games_played = games_played + 1,
    games_won    = games_won + (case when p_won then 1 else 0 end),
    best_gap     = nullif(least(coalesce(best_gap, 100000), coalesce(p_best_gap, 100000)), 100000)
  where id = auth.uid()
  returning * into result;
  if result.id is null then
    raise exception 'profil introuvable';
  end if;
  return result;
end
$$;

revoke all on function public.record_game(boolean, integer) from public;
revoke all on function public.record_game(boolean, integer) from anon;
grant execute on function public.record_game(boolean, integer) to authenticated;

-- télémétrie : écriture ouverte (plafonnée côté client), lecture dashboard only
create table if not exists public.error_events (
  id bigint generated always as identity primary key,
  category text not null,
  detail text,
  ua text,
  created_at timestamptz not null default now()
);
alter table public.error_events enable row level security;
drop policy if exists "error_events_insert_any" on public.error_events;
create policy "error_events_insert_any"
  on public.error_events for insert
  with check (char_length(category) <= 40);
