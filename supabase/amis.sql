-- ============================================================
-- MovieGuesser — système d'amis (à coller une fois dans le SQL Editor)
-- Table friendships : une ligne par lien (demande ou amitié), la paire
-- est unique dans les deux sens. Lecture/suppression directes (ses
-- propres lignes) ; création et acceptation UNIQUEMENT par RPC — un
-- insert/update direct permettrait de forger des amitiés non demandées.
-- Idempotent : rejouable sans risque.
-- ============================================================

create table if not exists public.friendships (
  requester uuid not null,
  addressee uuid not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee),
  -- FK nommées : PostgREST s'en sert pour joindre les deux profils
  constraint friendships_requester_fkey
    foreign key (requester) references public.profiles(id) on delete cascade,
  constraint friendships_addressee_fkey
    foreign key (addressee) references public.profiles(id) on delete cascade
);

-- une seule ligne par paire, quel que soit le sens de la demande
create unique index if not exists friendships_pair_uniq
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own" on public.friendships
  for select using (auth.uid() in (requester, addressee));

-- retirer un ami / annuler ou refuser une demande : chacun peut couper le lien
drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own" on public.friendships
  for delete using (auth.uid() in (requester, addressee));

-- pas de policy insert/update : voir les RPC ci-dessous

-- ------------------------------------------------------------
-- demander un ami par son pseudo
-- ------------------------------------------------------------
create or replace function public.add_friend(p_username text)
returns public.friendships
language plpgsql security definer set search_path = public
as $$
declare
  target uuid;
  result public.friendships;
begin
  if auth.uid() is null then
    raise exception 'connexion requise';
  end if;
  select id into target from public.profiles
    where lower(username) = lower(trim(p_username));
  if target is null then
    raise exception 'pseudo introuvable';
  end if;
  if target = auth.uid() then
    raise exception 'on ne s''invite pas soi-même';
  end if;
  insert into public.friendships (requester, addressee)
  values (auth.uid(), target)
  returning * into result;
  return result;
exception when unique_violation then
  raise exception 'demande déjà envoyée ou ami déjà présent';
end
$$;

revoke all on function public.add_friend(text) from public;
revoke all on function public.add_friend(text) from anon;
grant execute on function public.add_friend(text) to authenticated;

-- ------------------------------------------------------------
-- répondre à une demande reçue : accepter, ou refuser (= suppression)
-- ------------------------------------------------------------
create or replace function public.respond_friend(p_requester uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'connexion requise';
  end if;
  if p_accept then
    update public.friendships set status = 'accepted'
      where requester = p_requester and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships
      where requester = p_requester and addressee = auth.uid() and status = 'pending';
  end if;
  if not found then
    raise exception 'demande introuvable';
  end if;
end
$$;

revoke all on function public.respond_friend(uuid, boolean) from public;
revoke all on function public.respond_friend(uuid, boolean) from anon;
grant execute on function public.respond_friend(uuid, boolean) to authenticated;
