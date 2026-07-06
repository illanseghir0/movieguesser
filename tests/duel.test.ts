import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Film, Room } from "../src/types";

/* ---- canal Realtime factice : on capture les handlers et les envois ---- */
const { handlers, sent, fakeChannel, channelSpy, push } = vi.hoisted(() => {
  const handlers: Record<string, (arg: { payload?: unknown }) => void> = {};
  const sent: Array<{ event: string; payload: unknown }> = [];
  const fakeChannel = {
    on(_type: string, filter: { event?: string }, cb: (arg: { payload?: unknown }) => void) {
      handlers[filter.event ?? _type] = cb; return fakeChannel;
    },
    subscribe(cb?: (s: string) => void) { cb?.("SUBSCRIBED"); return fakeChannel; },
    send(msg: { event: string; payload: unknown }) { sent.push({ event: msg.event, payload: msg.payload }); },
    track: () => {}, unsubscribe: () => {}, presenceState: () => ({}),
  };
  return { handlers, sent, fakeChannel, channelSpy: vi.fn(() => fakeChannel), push: vi.fn() };
});

vi.mock("../src/router", () => ({
  default: { push, currentRoute: { value: { name: "amis" } } },
}));
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    channel: channelSpy,
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: () => ({ insert: () => ({ then: (r: (x: unknown) => void) => r({ error: null }) }) }),
  },
}));

import { duelVerdict } from "../src/stores/game";
import { useDuelStore } from "../src/stores/duel";
import { useListStore } from "../src/stores/list";
import { useProfileStore } from "../src/stores/profile";
import { useRoomStore } from "../src/stores/rooms";

const ME = "00000000-0000-0000-0000-0000000000aa";
const GUEST = "00000000-0000-0000-0000-0000000000bb";
const ROOM: Room = {
  id: "22222222-2222-2222-2222-222222222222", host: ME, guest: GUEST,
  status: "lobby", config: {}, created_at: "2026-07-06",
};

const seed = (n: number): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1, title: `Film ${i + 1}`, year: 2000,
    slug: null, url: null, poster: null, director: null,
  }));

/** l'invité pose son pari : on rejoue l'événement broadcast reçu par l'hôte */
function guestGuess(v: number) {
  handlers["guess"]({ payload: { seat: 1, v } });
}

function freshDuel(opts: { rounds?: number; mode?: "rounds" | "points"; timer?: number } = {}) {
  const list = useListStore();
  list.films = seed(100);
  const duel = useDuelStore();
  duel.attach(ROOM.id);
  duel.hostStart("invite", {
    mode: opts.mode ?? "rounds", rounds: opts.rounds ?? 3,
    target: 100, timer: opts.timer ?? 0,
  });
  return duel;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers();
  push.mockClear();
  sent.length = 0;
  useProfileStore().profile = {
    id: ME, username: "hote", games_played: 0, games_won: 0, best_gap: null,
  };
  useRoomStore().room = { ...ROOM }; // je suis l'hôte (siège 0)
});
afterEach(() => { vi.useRealTimers(); });

describe("duelVerdict — le même verdict que le duel local", () => {
  it("plus proche gagne, égalité = 0", () => {
    expect(duelVerdict(10, 20, 12, "rounds")).toMatchObject({ win: 1, d: [2, 8] });
    expect(duelVerdict(30, 8, 12, "rounds")).toMatchObject({ win: 2 });
    expect(duelVerdict(9, 15, 12, "rounds")).toMatchObject({ win: 0 });
  });
  it("course aux points : le vainqueur marque l'écart des estimations", () => {
    expect(duelVerdict(12, 40, 12, "points")).toMatchObject({ win: 1, pts: 28 });
  });
});

describe("duel en ligne — l'hôte arbitre", () => {
  it("lance la partie : start + manche 1 diffusés, navigation vers le jeu", () => {
    const duel = freshDuel();
    expect(sent.map((s) => s.event)).toEqual(["start", "round"]);
    expect(duel.playing).toBe(true);
    expect(duel.round).toBe(1);
    expect(duel.names).toEqual(["hote", "invite"]);
    expect(duel.film).not.toBeNull();
    expect(push).toHaveBeenCalledWith("/entre-amis/jeu");
  });

  it("révèle quand les DEUX paris sont posés, avec le verdict diffusé", () => {
    const duel = freshDuel();
    const rank = duel.film!.rank;
    expect(duel.submitGuess(Math.min(rank + 1, 100))).toBe(true);
    expect(duel.reveal).toBeNull();          // il manque l'invité
    guestGuess(Math.max(rank - 5, 1));
    expect(duel.reveal).not.toBeNull();
    const rev = sent.find((s) => s.event === "reveal");
    expect(rev).toBeTruthy();
    expect(duel.history).toHaveLength(1);
    // scoreShown ne rattrape le score qu'au temps 3
    expect(duel.scoreShown).toEqual([0, 0]);
    vi.advanceTimersByTime(2500);
    expect(duel.scoreShown[0]).toBe(1);      // l'hôte était plus proche
  });

  it("marque l'adversaire « a répondu » sans révéler sa valeur", () => {
    const duel = freshDuel();
    guestGuess(50);
    expect(duel.oppGuessed).toBe(true);
    expect(duel.guesses).toEqual([null, null]); // rien d'affichable avant le verdict
  });

  it("rejette un pari hors bornes, n'accepte qu'un pari par manche", () => {
    const duel = freshDuel();
    expect(duel.submitGuess(0)).toBe(false);
    expect(duel.submitGuess(101)).toBe(false);
    expect(duel.submitGuess(10)).toBe(true);
    expect(duel.myGuess).toBe(10);
    duel.submitGuess(20);                    // trop tard : pari déjà posé
    expect(duel.myGuess).toBe(10);
  });

  it("chrono écoulé + grâce : l'hôte complète le pari manquant et révèle", () => {
    const duel = freshDuel({ timer: 5 });
    duel.submitGuess(10);
    expect(duel.reveal).toBeNull();
    vi.advanceTimersByTime(5000 + 4000 + 100); // chrono + grâce
    expect(duel.reveal).not.toBeNull();      // pari de l'invité tiré au sort
  });

  it("termine après le nombre de manches et navigue vers le générique", () => {
    const duel = freshDuel({ rounds: 2 });
    for (let i = 0; i < 2; i++) {
      duel.submitGuess(duel.film!.rank);
      guestGuess(Math.min(duel.film!.rank + 3, 100));
      vi.advanceTimersByTime(2500);
      duel.hostNextRound();
    }
    expect(sent.filter((s) => s.event === "end")).toHaveLength(1);
    expect(duel.ended).toBe(true);
    expect(push).toHaveBeenCalledWith("/entre-amis/fin");
    expect(duel.history).toHaveLength(2);
  });

  it("départ de l'autre joueur en pleine partie : séance interrompue", () => {
    const duel = freshDuel();
    handlers["leave"]({});
    expect(duel.aborted).toBe(true);
    expect(duel.ended).toBe(true);
    expect(push).toHaveBeenCalledWith("/entre-amis/fin");
  });
});
