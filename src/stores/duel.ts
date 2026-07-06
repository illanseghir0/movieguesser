/* ============================================================
   stores/duel.ts — la partie en ligne « entre amis »
   Canal Realtime éphémère `game:<roomId>` (broadcast + presence),
   l'HÔTE EST L'ARBITRE : il tire le deck, envoie les manches (film
   complet : pas de dépendance à la version de liste de l'invité),
   collecte les deux paris et diffuse le verdict (duelVerdict, le
   même que le duel local). Sièges fixes : 0 = hôte, 1 = invité.
   Les paris restent secrets à l'écran jusqu'à la révélation.
   ============================================================ */

import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import type { RealtimeChannel } from "@supabase/supabase-js";
import router from "../router";
import { supabase } from "../lib/supabase";
import { REDUCE } from "../lib/env";
import { reportError } from "../lib/telemetry";
import type { Film, RoundResult } from "../types";
import { duelVerdict, REVEAL_STAGE1_MS, REVEAL_STAGE2_MS, type RevealState } from "./game";
import { useListStore } from "./list";
import { useProfileStore } from "./profile";
import { useRoomStore } from "./rooms";

interface StartPayload {
  names: [string, string];
  mode: "rounds" | "points";
  target: number;
  timer: number;
  totalRounds: number;
  maxRank: number;
}
interface RevealPayload {
  g: [number, number];
  win: 0 | 1 | 2;
  pts: number;
  d: [number, number];
  scores: [number, number];
}

/** grâce accordée au pari manquant après l'expiration du chrono (réseau) */
const GUESS_GRACE_MS = 4000;

export const useDuelStore = defineStore("duel", () => {
  const list = useListStore();
  const profile = useProfileStore();
  const rooms = useRoomStore();

  /* ---- état partagé (les deux clients) ---- */
  const playing = ref(false);
  const ended = ref(false);
  /** partie interrompue : l'autre joueur est parti */
  const aborted = ref(false);
  const names = ref<[string, string]>(["Hôte", "Invité"]);
  const mode = ref<"rounds" | "points">("rounds");
  const target = ref(1000);
  const timer = ref(0);
  const totalRounds = ref(10);
  const maxRank = ref(500);
  const round = ref(0);
  const film = ref<Film | null>(null);
  const score = ref<[number, number]>([0, 0]);
  const scoreShown = ref<[number, number]>([0, 0]);
  const guesses = ref<[number | null, number | null]>([null, null]);
  const myGuess = ref<number | null>(null);
  const oppGuessed = ref(false);
  const reveal = ref<RevealState | null>(null);
  const history = ref<RoundResult[]>([]);
  const statsRecorded = ref(false);

  /** mon siège : 0 = hôte, 1 = invité */
  const seat = computed(() => (rooms.isHost ? 0 : 1));
  const oppSeat = computed(() => (seat.value === 0 ? 1 : 0));

  /* ---- canal de jeu ---- */
  let channel: RealtimeChannel | null = null;
  let attachedRoom: string | null = null;

  function send(event: string, payload: object) {
    channel?.send({ type: "broadcast", event, payload });
  }

  /** appelé dès qu'on est dans un salon : prêt à recevoir le lancement */
  function attach(roomId: string) {
    if (attachedRoom === roomId) return;
    detach();
    if (!supabase) return;
    attachedRoom = roomId;
    channel = supabase.channel(`game:${roomId}`, {
      config: { presence: { key: String(seat.value) }, broadcast: { self: false } },
    });
    channel
      .on("broadcast", { event: "start" }, ({ payload }) => onStart(payload as StartPayload))
      .on("broadcast", { event: "round" }, ({ payload }) => onRound(payload as { n: number; film: Film }))
      .on("broadcast", { event: "guess" }, ({ payload }) => onGuess(payload as { seat: 0 | 1; v: number }))
      .on("broadcast", { event: "guessed" }, () => { oppGuessed.value = true; })
      .on("broadcast", { event: "reveal" }, ({ payload }) => onReveal(payload as RevealPayload))
      .on("broadcast", { event: "end" }, () => onEnd())
      .on("broadcast", { event: "lobby" }, () => onBackToLobby())
      .on("presence", { event: "leave" }, () => {
        // l'autre joueur a coupé en pleine partie : on interrompt
        if (playing.value && !ended.value) abortByLeave();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel?.track({ at: Date.now() });
      });
  }

  function detach() {
    channel?.unsubscribe();
    channel = null;
    attachedRoom = null;
  }

  /* le salon a été dissous (rooms.watchRoom) pendant la partie */
  watch(() => rooms.room, (r) => {
    if (!r && playing.value && !ended.value) abortByLeave();
  });

  /* ---- côté hôte : arbitrage ---- */
  let deck: Film[] = [];
  const pending: [number | null, number | null] = [null, null];
  let watchdog: number | undefined;

  /** l'hôte lance (ou relance) la partie — la liste doit être chargée */
  function hostStart(guestName: string, cfg: { mode: "rounds" | "points"; rounds: number; target: number; timer: number }) {
    if (!list.films?.length || !channel) return;
    const d = list.films.slice();
    for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; }
    deck = d;
    const payload: StartPayload = {
      names: [profile.username ?? "Hôte", guestName],
      mode: cfg.mode, target: cfg.target, timer: cfg.timer,
      totalRounds: Math.min(cfg.rounds, d.length),
      maxRank: list.maxRank,
    };
    send("start", payload);
    onStart(payload);           // broadcast self=false : on s'applique le sien
    hostNextRound();
  }

  function hostNextRound() {
    if (seat.value !== 0) return;
    clearTimeout(watchdog);
    const over = mode.value === "points"
      ? Math.max(...score.value) >= target.value || round.value >= deck.length
      : round.value >= totalRounds.value;
    if (over) { send("end", {}); onEnd(); return; }
    pending[0] = null; pending[1] = null;
    const f = deck[round.value];
    // l'affiche est enrichie en DB : le film part complet vers l'invité
    const payload = { n: round.value + 1, film: { ...f } };
    send("round", payload);
    onRound(payload);
    // chrono + grâce : si un pari manque encore, l'hôte le tire au sort
    if (timer.value > 0) {
      watchdog = window.setTimeout(() => {
        let changed = false;
        ([0, 1] as const).forEach((s) => {
          if (pending[s] === null) { pending[s] = 1 + ((Math.random() * maxRank.value) | 0); changed = true; }
        });
        if (changed) hostMaybeReveal();
      }, (timer.value * 1000) + GUESS_GRACE_MS);
    }
  }

  function onGuess(p: { seat: 0 | 1; v: number }) {
    if (seat.value === 0) {
      pending[p.seat] = p.v;
      hostMaybeReveal();
    }
    if (p.seat !== seat.value) oppGuessed.value = true;
  }

  function hostMaybeReveal() {
    if (pending[0] === null || pending[1] === null || reveal.value) return;
    clearTimeout(watchdog);
    const f = film.value!;
    const g: [number, number] = [pending[0], pending[1]];
    const { win, pts, d } = duelVerdict(g[0], g[1], f.rank, mode.value);
    const next: [number, number] = [...score.value] as [number, number];
    if (mode.value === "points") {
      if (win === 1) next[0] += pts;
      else if (win === 2) next[1] += pts;
    } else {
      if (win !== 2) next[0]++;
      if (win !== 1) next[1]++;
    }
    const payload: RevealPayload = { g, win, pts, d, scores: next };
    send("reveal", payload);
    onReveal(payload);
  }

  /* ---- application des événements (les deux clients) ---- */
  let stagers: number[] = [];
  const later = (fn: () => void, ms: number) => {
    if (REDUCE) fn(); else stagers.push(window.setTimeout(fn, ms));
  };
  const clearStagers = () => { stagers.forEach(clearTimeout); stagers = []; };

  function onStart(p: StartPayload) {
    clearStagers();
    names.value = p.names;
    mode.value = p.mode; target.value = p.target; timer.value = p.timer;
    totalRounds.value = p.totalRounds; maxRank.value = p.maxRank;
    round.value = 0; score.value = [0, 0]; scoreShown.value = [0, 0];
    history.value = []; reveal.value = null; film.value = null;
    ended.value = false; aborted.value = false; statsRecorded.value = false;
    playing.value = true;
    if (router.currentRoute.value.name !== "amisJeu") router.push("/entre-amis/jeu");
  }

  function onRound(p: { n: number; film: Film }) {
    clearStagers();
    round.value = p.n;
    film.value = p.film;
    guesses.value = [null, null];
    myGuess.value = null;
    oppGuessed.value = false;
    reveal.value = null;
    scoreShown.value = [...score.value] as [number, number];
    if (p.film.poster) new Image().src = p.film.poster; // préchauffe
  }

  /** renvoie false si hors bornes (le champ secoue) */
  function submitGuess(v: number): boolean {
    if (!(v >= 1 && v <= maxRank.value)) return false;
    if (myGuess.value !== null || reveal.value) return true;
    myGuess.value = v;
    if (seat.value === 0) {
      pending[0] = v;
      send("guessed", {});
      hostMaybeReveal();
    } else {
      send("guess", { seat: 1, v });
    }
    return true;
  }

  function onReveal(p: RevealPayload) {
    clearStagers();
    guesses.value = p.g;
    score.value = p.scores;
    const f = film.value!;
    history.value.push({ title: f.title, year: f.year, rank: f.rank, g: p.g, d: p.d, win: p.win, pts: p.pts });
    reveal.value = { stage: 0, win: p.win, pts: p.pts, d: p.d };
    later(() => { if (reveal.value) reveal.value.stage = 1; }, REVEAL_STAGE1_MS);
    later(() => {
      if (!reveal.value) return;
      reveal.value.stage = 2;
      scoreShown.value = [...score.value] as [number, number];
    }, REVEAL_STAGE2_MS);
  }

  function onEnd() {
    clearStagers();
    ended.value = true;
    scoreShown.value = [...score.value] as [number, number];
    router.push("/entre-amis/fin");
    // chacun enregistre SES stats (même RPC bornée que le duel local)
    if (profile.profile && history.value.length && !statsRecorded.value) {
      const won = score.value[seat.value] > score.value[oppSeat.value];
      const mine = history.value.map((h) => h.d[seat.value]);
      profile.recordGame(won, Math.min(...mine)).then((ok) => { statsRecorded.value = ok; });
    }
  }

  function onBackToLobby() {
    clearStagers();
    playing.value = false;
    ended.value = false;
    round.value = 0;
    router.push("/entre-amis");
  }

  function abortByLeave() {
    clearStagers();
    clearTimeout(watchdog);
    aborted.value = true;
    ended.value = true;
    router.push("/entre-amis/fin");
  }

  /* ---- actions de fin ---- */
  function rematch(guestName: string) {
    if (seat.value !== 0) return;
    hostStart(guestName, {
      mode: mode.value, rounds: totalRounds.value, target: target.value, timer: timer.value,
    });
  }

  function backToLobby() {
    if (seat.value !== 0) return;
    send("lobby", {});
    onBackToLobby();
  }

  /** sortie volontaire : on quitte la partie ET le salon */
  async function quit() {
    clearStagers();
    clearTimeout(watchdog);
    playing.value = false;
    ended.value = false;
    aborted.value = false;
    round.value = 0;
    detach();
    await rooms.leave();
  }

  return {
    playing, ended, aborted, names, mode, target, timer, totalRounds, maxRank,
    round, film, score, scoreShown, guesses, myGuess, oppGuessed, reveal,
    history, statsRecorded, seat, oppSeat,
    attach, detach, hostStart, hostNextRound, submitGuess, rematch, backToLobby, quit,
  };
});
