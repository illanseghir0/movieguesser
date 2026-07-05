/* ============================================================
   stores/compet.ts — mode compétitif
   Le défi actif (règles fixées par l'équipe), son classement,
   et l'envoi du score via la RPC submit_challenge_score
   (security definer : bornes, fenêtre temporelle, une seule
   participation par joueur).
   ============================================================ */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { supabase } from "../lib/supabase";
import { reportError } from "../lib/telemetry";
import { useProfileStore } from "./profile";
import type { Challenge, ChallengeRow, DbScoreRow } from "../types";

/** issue de l'envoi du score en fin de défi */
export type SubmitState = "none" | "sent" | "anon" | "already" | "partial" | "error";

export const useCompetStore = defineStore("compet", () => {
  const enabled = !!supabase;
  const challenge = ref<Challenge | null>(null);
  const board = ref<ChallengeRow[]>([]);
  const loading = ref(false);
  const loaded = ref(false);
  /** échec de chargement (réseau/DB) — à distinguer de « pas de défi » */
  const loadError = ref(false);
  const submitState = ref<SubmitState>("none");
  const submittedScore = ref<number | null>(null);

  const profile = useProfileStore();
  const myRow = computed(() =>
    board.value.find((r) => r.user_id === profile.profile?.id) ?? null);
  const myRank = computed(() => {
    const i = board.value.findIndex((r) => r.user_id === profile.profile?.id);
    return i < 0 ? null : i + 1;
  });

  /** charge le défi actif (fenêtre temporelle courante) puis son classement.
      Relançable (bouton réessayer) : chaque appel refait la requête. */
  async function load() {
    if (!supabase) { loaded.value = true; return; }
    if (loading.value) return;
    loading.value = true;
    loadError.value = false;
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("challenges").select("*")
        .lte("starts_at", nowIso).gte("ends_at", nowIso)
        .order("ends_at", { ascending: true }).limit(1);
      if (error) throw new Error(error.message);
      challenge.value = (data?.[0] as Challenge) ?? null;
      if (challenge.value) await loadBoard();
    } catch (e) {
      reportError("compet_load", e instanceof Error ? e.message : "inconnu");
      challenge.value = null;
      loadError.value = true; // réseau/DB : ne pas afficher « aucun défi »
    } finally {
      loading.value = false;
      loaded.value = true;
    }
  }

  async function loadBoard() {
    if (!supabase || !challenge.value) return;
    const { data, error } = await supabase
      .from("challenge_scores")
      .select("user_id,score,best_gap,played_at,profiles(username)")
      .eq("challenge_id", challenge.value.id)
      .order("score", { ascending: false })
      .order("played_at", { ascending: true })
      .limit(100);
    if (error) { reportError("compet_board", error.message); return; }
    board.value = ((data ?? []) as unknown as DbScoreRow[]).map((r): ChallengeRow => ({
      user_id: r.user_id, score: r.score, best_gap: r.best_gap,
      played_at: r.played_at,
      username: r.profiles?.username ?? "anonyme",
    }));
  }

  /** fin de partie compétitive : n'inscrit que les parties complètes,
      d'un joueur connecté, une seule fois par défi (la RPC re-vérifie tout) */
  async function submit(score: number, bestGap: number | null, complete: boolean) {
    submittedScore.value = score;
    if (!complete) { submitState.value = "partial"; return; }
    if (!supabase || !profile.profile) { submitState.value = "anon"; return; }
    if (!challenge.value) { submitState.value = "error"; return; }
    const { error } = await supabase.rpc("submit_challenge_score", {
      p_challenge_id: challenge.value.id, p_score: score, p_best_gap: bestGap,
    });
    if (!error) { submitState.value = "sent"; await loadBoard(); return; }
    if (/déjà particip|duplicate key/i.test(error.message)) {
      submitState.value = "already";
    } else {
      submitState.value = "error";
      reportError("compet_submit", error.message);
    }
  }

  return {
    enabled, challenge, board, loading, loaded, loadError, submitState, submittedScore,
    myRow, myRank, load, loadBoard, submit,
  };
});
