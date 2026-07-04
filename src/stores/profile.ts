/* ============================================================
   stores/profile.ts — session Supabase + profil joueur
   Le profil connecté est considéré comme le Joueur 1 des parties
   locales : ses stats (parties, victoires, meilleur écart) sont
   mises à jour à chaque fin de partie.
   ============================================================ */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { reportError } from "../lib/telemetry";
import type { Profile } from "../types";

export const useProfileStore = defineStore("profile", () => {
  const enabled = !!supabase;
  const session = ref<Session | null>(null);
  const profile = ref<Profile | null>(null);
  const busy = ref(false);

  const username = computed(() => profile.value?.username ?? null);

  async function init() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    if (session.value) await ensureProfile();
    supabase.auth.onAuthStateChange(async (_event, s) => {
      session.value = s;
      if (s) await ensureProfile();
      else profile.value = null;
    });
  }

  /** charge le profil ; le crée au premier login (username passé au signUp) */
  async function ensureProfile() {
    if (!supabase || !session.value) return;
    const uid = session.value.user.id;
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) { profile.value = data as Profile; return; }
    const meta = session.value.user.user_metadata as Record<string, unknown>;
    const fallback = (session.value.user.email || "joueur").split("@")[0].slice(0, 20);
    const uname = (typeof meta.username === "string" && meta.username) || fallback;
    const { data: created, error } = await supabase.from("profiles")
      .insert({ id: uid, username: uname }).select().single();
    if (!error && created) profile.value = created as Profile;
  }

  /** envoie un code de connexion à 6 chiffres par email
      (crée le compte au premier passage ; pseudo optionnel) */
  async function sendCode(email: string, uname?: string): Promise<string | null> {
    if (!supabase) return "Profils indisponibles sur cette version";
    if (uname && !/^[\w.-]{3,20}$/.test(uname)) {
      return "Pseudo : 3 à 20 caractères (lettres, chiffres, . _ -)";
    }
    busy.value = true;
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: uname ? { username: uname } : undefined,
        },
      });
      return error ? traduireErreur(error.message) : null;
    } finally { busy.value = false; }
  }

  /** vérifie le code reçu : succès = session ouverte (profil créé au besoin) */
  async function verifyCode(email: string, token: string): Promise<string | null> {
    if (!supabase) return "Profils indisponibles sur cette version";
    busy.value = true;
    try {
      const { error } = await supabase.auth.verifyOtp({
        email, token: token.trim(), type: "email",
      });
      return error ? traduireErreur(error.message) : null;
    } finally { busy.value = false; }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  /** mise à jour des stats en fin de partie (profil = Joueur 1) —
      via la RPC record_game, validée côté Postgres (incréments bornés) */
  async function recordGame(won: boolean, bestGap: number | null): Promise<boolean> {
    if (!supabase || !profile.value) return false;
    const { data, error } = await supabase.rpc("record_game", {
      p_won: won, p_best_gap: bestGap,
    });
    if (!error && data) { profile.value = data as Profile; return true; }
    reportError("record_game", error?.message);
    return false;
  }

  function traduireErreur(msg: string): string {
    if (/expired|invalid/i.test(msg)) return "Code invalide ou expiré — redemande un code";
    if (/valid email/i.test(msg)) return "Adresse email invalide";
    if (/only request this once|rate limit/i.test(msg)) return "Patiente un peu avant de redemander un code";
    return msg;
  }

  return {
    enabled, session, profile, username, busy,
    init, sendCode, verifyCode, signOut, recordGame,
  };
});
