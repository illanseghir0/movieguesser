-- ============================================================
-- MovieGuesser — consolidation (à coller une fois dans le SQL Editor)
-- 1. FK challenges.list_slug -> lists.slug : un défi ne peut plus
--    pointer une liste inexistante (lobby cassé sinon).
-- 2. record_game rate-limitée : au plus une partie enregistrée toutes
--    les 20 s par profil (une vraie partie dure bien plus) — un script
--    ne peut plus se fabriquer des stats en boucle.
-- Idempotent : rejouable sans risque.
-- ============================================================

-- 1. intégrité référentielle du défi
alter table public.challenges
  drop constraint if exists challenges_list_slug_fkey;
alter table public.challenges
  add constraint challenges_list_slug_fkey
  foreign key (list_slug) references public.lists(slug);

-- 2. rate-limit des stats de profil
alter table public.profiles
  add column if not exists last_game_at timestamptz;

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
    best_gap     = nullif(least(coalesce(best_gap, 100000), coalesce(p_best_gap, 100000)), 100000),
    last_game_at = now()
  where id = auth.uid()
    -- la partie la plus courte possible (1 manche) dépasse 20 s ;
    -- en deçà c'est un script, pas un joueur
    and (last_game_at is null or now() - last_game_at >= interval '20 seconds')
  returning * into result;
  if result.id is null then
    raise exception 'profil introuvable ou parties trop rapprochées';
  end if;
  return result;
end
$$;

revoke all on function public.record_game(boolean, integer) from public;
revoke all on function public.record_game(boolean, integer) from anon;
grant execute on function public.record_game(boolean, integer) to authenticated;
