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

export interface Profile {
  id: string;
  username: string;
  games_played: number;
  games_won: number;
  best_gap: number | null;
}
