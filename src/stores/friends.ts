/* ============================================================
   stores/friends.ts — le système d'amis
   Liens en DB (table friendships : lecture/suppression directes,
   création/acceptation par RPC), présence en ligne via Realtime
   Presence (chaque connecté s'annonce sur le canal "online",
   zéro écriture en base). Socle du mode « entre amis ».
   ============================================================ */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { reportError } from "../lib/telemetry";
import { useProfileStore } from "./profile";
import type { DbFriendshipRow, Friend } from "../types";

export const useFriendsStore = defineStore("friends", () => {
  const enabled = !!supabase;
  const all = ref<Friend[]>([]);
  const loading = ref(false);
  const busy = ref(false);

  const profile = useProfileStore();

  const friends = computed(() => all.value.filter((f) => f.status === "accepted"));
  /** demandes reçues, à accepter ou refuser */
  const incoming = computed(() => all.value.filter((f) => f.status === "pending" && !f.outgoing));
  /** demandes envoyées, en attente */
  const outgoing = computed(() => all.value.filter((f) => f.status === "pending" && f.outgoing));

  async function load() {
    if (!supabase || !profile.profile) { all.value = []; return; }
    loading.value = true;
    try {
      const me = profile.profile.id;
      const { data, error } = await supabase
        .from("friendships")
        .select("requester,addressee,status,created_at," +
          "requester_profile:profiles!friendships_requester_fkey(username)," +
          "addressee_profile:profiles!friendships_addressee_fkey(username)")
        .order("created_at", { ascending: false });
      if (error) { reportError("friends_load", error.message); return; }
      all.value = ((data ?? []) as unknown as DbFriendshipRow[]).map((r): Friend => {
        const outgoing = r.requester === me;
        return {
          id: outgoing ? r.addressee : r.requester,
          username: (outgoing ? r.addressee_profile : r.requester_profile)?.username ?? "?",
          status: r.status,
          outgoing,
          since: r.created_at,
        };
      });
    } finally {
      loading.value = false;
    }
  }

  /** demande d'ami par pseudo — renvoie un message d'erreur, ou null si ok */
  async function add(username: string): Promise<string | null> {
    if (!supabase || !profile.profile) return "Connexion requise";
    busy.value = true;
    try {
      const { error } = await supabase.rpc("add_friend", { p_username: username.trim() });
      if (error) return traduire(error.message);
      await load();
      return null;
    } finally {
      busy.value = false;
    }
  }

  /** accepter ou refuser une demande reçue */
  async function respond(requesterId: string, accept: boolean): Promise<void> {
    if (!supabase) return;
    busy.value = true;
    try {
      const { error } = await supabase.rpc("respond_friend",
        { p_requester: requesterId, p_accept: accept });
      if (error) { reportError("friends_respond", error.message); return; }
      await load();
    } finally {
      busy.value = false;
    }
  }

  /** retirer un ami, ou annuler une demande envoyée */
  async function remove(otherId: string): Promise<void> {
    if (!supabase || !profile.profile) return;
    busy.value = true;
    try {
      const me = profile.profile.id;
      const { error } = await supabase.from("friendships").delete()
        .or(`and(requester.eq.${me},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${me})`);
      if (error) { reportError("friends_remove", error.message); return; }
      await load();
    } finally {
      busy.value = false;
    }
  }

  /* ---- présence : qui est en ligne, en direct, sans toucher la DB ---- */
  const onlineIds = ref<Set<string>>(new Set());
  let channel: RealtimeChannel | null = null;

  function startPresence() {
    if (!supabase || !profile.profile || channel) return;
    channel = supabase.channel("online",
      { config: { presence: { key: profile.profile.id } } });
    channel.on("presence", { event: "sync" }, () => {
      onlineIds.value = new Set(Object.keys(channel?.presenceState() ?? {}));
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channel?.track({ at: Date.now() });
    });
  }

  function stopPresence() {
    channel?.unsubscribe();
    channel = null;
    onlineIds.value = new Set();
  }

  function isOnline(id: string): boolean { return onlineIds.value.has(id); }

  function traduire(msg: string): string {
    if (/introuvable/.test(msg)) return "Pseudo introuvable — vérifie l'orthographe";
    if (/soi-même/.test(msg)) return "On ne s'invite pas soi-même";
    if (/déjà/.test(msg)) return "Demande déjà envoyée, ou vous êtes déjà amis";
    if (/connexion/i.test(msg)) return "Connexion requise";
    return msg;
  }

  return {
    enabled, all, friends, incoming, outgoing, loading, busy, onlineIds,
    load, add, respond, remove, startPresence, stopPresence, isOnline,
  };
});
