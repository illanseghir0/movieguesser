export interface Film {
  rank: number;
  title: string;
  year: number | null;
  slug: string | null;
  url: string | null;
  /** undefined = pas encore récupérée, null = pas d'affiche */
  poster?: string | null;
  /** undefined = pas encore récupéré, null = inconnu */
  director?: string | null;
}

export interface RoundResult {
  title: string;
  year: number | null;
  rank: number;
  g: [number, number];
  d: [number, number];
  win: 0 | 1 | 2; // 0 = égalité
  pts: number;    // points marqués (mode course aux points)
}

/** un classement du catalogue curaté (table `lists` côté Supabase) —
    entrée légère : les films sont récupérés à la demande, à la sélection */
export interface CatalogEntry {
  slug: string;
  url: string;
  title: string;
  cover: string | null;
  count: number;
}

/* ---- lignes PostgREST : contrats nommés des selects du client.
   (le jour où le CLI Supabase est installé et authentifié,
   `supabase gen types typescript` peut les remplacer) ---- */

/** un film du JSONB `lists.films` (enrichi à l'ingestion ; les clés
    poster/director sont absentes des anciennes données) */
export interface DbFilmJson {
  rank: number; title: string; year?: number | null; slug?: string | null;
  poster?: string | null; director?: string | null;
}
/** ligne du catalogue léger (sans le JSONB films) */
export interface DbListLight {
  slug: string; url: string; title: string;
  cover_url: string | null; film_count: number;
}
/** une liste complète, fetchée par slug à la sélection */
export interface DbListFull { url: string; title: string; films: DbFilmJson[] }
/** ligne de challenge_scores avec le pseudo embarqué (FK -> profiles) */
export interface DbScoreRow {
  user_id: string; score: number; best_gap: number | null; played_at: string;
  profiles: { username: string } | null;
}

/* ---- système d'amis (table `friendships`) ---- */

export type FriendStatus = "pending" | "accepted";

/** un lien d'amitié vu depuis mon profil */
export interface Friend {
  /** l'autre joueur */
  id: string;
  username: string;
  status: FriendStatus;
  /** true = c'est moi qui ai envoyé la demande */
  outgoing: boolean;
  since: string;
}

/** ligne friendships avec les deux profils embarqués (FK nommées) */
export interface DbFriendshipRow {
  requester: string;
  addressee: string;
  status: FriendStatus;
  created_at: string;
  requester_profile: { username: string } | null;
  addressee_profile: { username: string } | null;
}

/** défi compétitif fixé par l'équipe (table `challenges`) */
export interface Challenge {
  id: number;
  title: string;
  list_slug: string;
  rounds: number;
  timer_seconds: number;
  starts_at: string;
  ends_at: string;
}

/** ligne du classement d'un défi (challenge_scores + username) */
export interface ChallengeRow {
  user_id: string;
  username: string;
  score: number;
  best_gap: number | null;
  played_at: string;
}

export interface Profile {
  id: string;
  username: string;
  games_played: number;
  games_won: number;
  best_gap: number | null;
  created_at?: string;
}
