-- ============================================================
-- MovieGuesser — mode compétitif (à coller une fois dans le SQL Editor)
-- 1. `challenges` : le défi fixé par l'équipe (lecture publique,
--    aucune écriture client — on l'édite ici même).
-- 2. `challenge_scores` : un score par joueur et par défi (lecture
--    publique, écriture uniquement via la RPC bornée).
-- 3. RPC submit_challenge_score : security definer, exige une session,
--    vérifie la fenêtre temporelle, borne le score (rounds × 50),
--    refuse une seconde participation.
-- Idempotent : rejouable sans risque.
-- ============================================================

create table if not exists public.challenges (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) <= 80),
  list_slug text not null,
  rounds integer not null default 10 check (rounds between 1 and 50),
  timer_seconds integer not null default 15 check (timer_seconds between 3 and 60),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.challenges enable row level security;
drop policy if exists "challenges_select_all" on public.challenges;
create policy "challenges_select_all" on public.challenges for select using (true);
-- pas de policy insert/update/delete : le défi est fixé par l'équipe (SQL Editor)

create table if not exists public.challenge_scores (
  challenge_id bigint not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null check (score >= 0),
  best_gap integer,
  played_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
alter table public.challenge_scores enable row level security;
drop policy if exists "challenge_scores_select_all" on public.challenge_scores;
create policy "challenge_scores_select_all" on public.challenge_scores for select using (true);
-- pas d'insert/update direct : uniquement la RPC ci-dessous

create or replace function public.submit_challenge_score(
  p_challenge_id bigint, p_score integer, p_best_gap integer default null)
returns public.challenge_scores
language plpgsql security definer set search_path = public
as $$
declare
  ch public.challenges;
  n_films integer;
  max_score integer;
  result public.challenge_scores;
begin
  if auth.uid() is null then
    raise exception 'connexion requise';
  end if;
  select * into ch from public.challenges where id = p_challenge_id;
  if ch.id is null then
    raise exception 'défi introuvable';
  end if;
  if now() < ch.starts_at or now() > ch.ends_at then
    raise exception 'défi clos';
  end if;
  -- barème (taille de la liste - écart)/10 arrondi au-dessus :
  -- au plus ceil(films/10) points par manche
  select film_count into n_films from public.lists where slug = ch.list_slug;
  max_score := ch.rounds * ceil(coalesce(n_films, 500) / 10.0)::integer;
  if p_score < 0 or p_score > max_score then
    raise exception 'score hors bornes';
  end if;
  if p_best_gap is not null and (p_best_gap < 0 or p_best_gap > 10000) then
    p_best_gap := null;
  end if;
  insert into public.challenge_scores (challenge_id, user_id, score, best_gap)
  values (p_challenge_id, auth.uid(), p_score, p_best_gap)
  returning * into result;
  return result;
exception when unique_violation then
  raise exception 'déjà participé';
end
$$;

revoke all on function public.submit_challenge_score(bigint, integer, integer) from public;
revoke all on function public.submit_challenge_score(bigint, integer, integer) from anon;
grant execute on function public.submit_challenge_score(bigint, integer, integer) to authenticated;

-- ------------------------------------------------------------
-- Premier défi : Top 250 « fans », 10 manches, 15 s, 30 jours.
-- (relancer ce bloc seul pour créer les défis suivants)
-- ------------------------------------------------------------
insert into public.challenges (title, list_slug, rounds, timer_seconds, starts_at, ends_at)
select 'Défi d''ouverture', 'top-250-films-with-the-most-fans', 10, 15, now(), now() + interval '30 days'
where not exists (
  select 1 from public.challenges where now() between starts_at and ends_at
);
