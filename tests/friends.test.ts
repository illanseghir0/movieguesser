import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/* Supabase factice : friendships dans les deux sens + RPC espionnées */
const ME = "00000000-0000-0000-0000-0000000000aa";
const ALICE = "00000000-0000-0000-0000-0000000000bb";
const BOB = "00000000-0000-0000-0000-0000000000cc";
const CARO = "00000000-0000-0000-0000-0000000000dd";

const ROWS = [
  // Alice et moi : amis (c'est elle qui avait demandé)
  { requester: ALICE, addressee: ME, status: "accepted", created_at: "2026-07-01",
    requester_profile: { username: "alice" }, addressee_profile: { username: "moi" } },
  // Bob m'a envoyé une demande
  { requester: BOB, addressee: ME, status: "pending", created_at: "2026-07-02",
    requester_profile: { username: "bob" }, addressee_profile: { username: "moi" } },
  // j'ai invité Caro
  { requester: ME, addressee: CARO, status: "pending", created_at: "2026-07-03",
    requester_profile: { username: "moi" }, addressee_profile: { username: "caro" } },
];

const { rpcSpy, deleteOrSpy } = vi.hoisted(() => ({
  rpcSpy: vi.fn(async () => ({ data: null, error: null })),
  deleteOrSpy: vi.fn(async () => ({ error: null })),
}));

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    rpc: rpcSpy,
    from: (table: string) => ({
      select: () => ({
        order: async () => (table === "friendships" ? { error: null, data: ROWS } : { error: null, data: [] }),
      }),
      delete: () => ({ or: deleteOrSpy }),
    }),
  },
}));

import { useFriendsStore } from "../src/stores/friends";
import { useProfileStore } from "../src/stores/profile";

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  rpcSpy.mockClear();
  deleteOrSpy.mockClear();
  // profil connecté factice
  useProfileStore().profile = {
    id: ME, username: "moi", games_played: 0, games_won: 0, best_gap: null,
  };
});

describe("friends store — liens et demandes", () => {
  it("trie les lignes : amis, demandes reçues, invitations envoyées", async () => {
    const friends = useFriendsStore();
    await friends.load();
    expect(friends.friends.map((f) => f.username)).toEqual(["alice"]);
    expect(friends.incoming.map((f) => f.username)).toEqual(["bob"]);
    expect(friends.outgoing.map((f) => f.username)).toEqual(["caro"]);
    // l'id exposé est toujours celui de l'autre joueur
    expect(friends.friends[0].id).toBe(ALICE);
    expect(friends.incoming[0].id).toBe(BOB);
    expect(friends.outgoing[0].id).toBe(CARO);
  });

  it("add : appelle la RPC add_friend avec le pseudo nettoyé", async () => {
    const friends = useFriendsStore();
    const err = await friends.add("  Zoé ");
    expect(err).toBeNull();
    expect(rpcSpy).toHaveBeenCalledWith("add_friend", { p_username: "Zoé" });
  });

  it("add : traduit les erreurs de la RPC", async () => {
    rpcSpy.mockResolvedValueOnce({ data: null, error: { message: "pseudo introuvable" } } as never);
    const friends = useFriendsStore();
    const err = await friends.add("fantome");
    expect(err).toMatch(/introuvable/);
  });

  it("respond : accepte ou refuse via la RPC respond_friend", async () => {
    const friends = useFriendsStore();
    await friends.respond(BOB, true);
    expect(rpcSpy).toHaveBeenCalledWith("respond_friend", { p_requester: BOB, p_accept: true });
  });

  it("remove : supprime la paire dans les deux sens", async () => {
    const friends = useFriendsStore();
    await friends.remove(ALICE);
    expect(deleteOrSpy).toHaveBeenCalledWith(
      `and(requester.eq.${ME},addressee.eq.${ALICE}),and(requester.eq.${ALICE},addressee.eq.${ME})`);
  });

  it("présence : isOnline reflète le set d'ids en ligne", () => {
    const friends = useFriendsStore();
    friends.onlineIds = new Set([ALICE]);
    expect(friends.isOnline(ALICE)).toBe(true);
    expect(friends.isOnline(BOB)).toBe(false);
  });
});
