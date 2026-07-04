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
import type { Profile } from "../types";

export const useProfileStore = defineStore("profile", () => {
  const enabled = !!supabase;
  const session = ref<Session | null>(null);
  const profile = ref<Profile | null>(null);
  const authOpen = ref(false);
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

  /** renvoie un message d'erreur, un message d'info (confirmation email), ou null si ok */
  async function signUp(email: string, password: string, uname: string):
    Promise<{ err?: string; info?: string } | null> {
    if (!supabase) return { err: "Supabase non configuré" };
    if (!/^[\w.-]{3,20}$/.test(uname)) return { err: "Pseudo : 3 à 20 caractères (lettres, chiffres, . _ -)" };
    busy.value = true;
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { username: uname } },
      });
      if (error) return { err: traduireErreur(error.message) };
      if (!data.session) return { info: "Compte créé — clique sur le lien reçu par email pour activer ton profil." };
      return null;
    } finally { busy.value = false; }
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    if (!supabase) return "Supabase non configuré";
    busy.value = true;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? traduireErreur(error.message) : null;
    } finally { busy.value = false; }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  /** mise à jour des stats en fin de partie (profil = Joueur 1) */
  async function recordGame(won: boolean, bestGap: number | null): Promise<boolean> {
    if (!supabase || !profile.value) return false;
    const p = profile.value;
    const next = {
      games_played: p.games_played + 1,
      games_won: p.games_won + (won ? 1 : 0),
      best_gap: bestGap == null ? p.best_gap
        : p.best_gap == null ? bestGap : Math.min(p.best_gap, bestGap),
    };
    const { data, error } = await supabase.from("profiles")
      .update(next).eq("id", p.id).select().single();
    if (!error && data) { profile.value = data as Profile; return true; }
    return false;
  }

  function traduireErreur(msg: string): string {
    if (/invalid login credentials/i.test(msg)) return "Email ou mot de passe incorrect";
    if (/already registered/i.test(msg)) return "Un compte existe déjà avec cet email";
    if (/at least 6 characters/i.test(msg)) return "Mot de passe : 6 caractères minimum";
    if (/valid email/i.test(msg)) return "Adresse email invalide";
    if (/rate limit/i.test(msg)) return "Trop de tentatives — réessaie dans un instant";
    return msg;
  }

  return {
    enabled, session, profile, username, authOpen, busy,
    init, signUp, signIn, signOut, recordGame,
  };
});
