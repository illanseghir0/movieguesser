import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useSettingsStore } from "../src/stores/settings";

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("settings store", () => {
  it("a des valeurs par défaut saines", () => {
    const s = useSettingsStore();
    expect(s.mode).toBe("rounds");
    expect(s.rounds).toBe(10);
    expect(s.target).toBe(1000);
    expect(s.start).toBe("alt");
  });

  it("persiste les changements dans localStorage", async () => {
    const s = useSettingsStore();
    s.mode = "points";
    s.target = 750;
    await nextTick();
    const saved = JSON.parse(localStorage.getItem("gtrCfg")!);
    expect(saved).toMatchObject({ mode: "points", target: 750 });
  });

  it("restaure les réglages sauvegardés", () => {
    localStorage.setItem("gtrCfg", JSON.stringify({ mode: "points", rounds: 7, target: 500, start: "random" }));
    const s = useSettingsStore();
    expect(s.mode).toBe("points");
    expect(s.rounds).toBe(7);
    expect(s.target).toBe(500);
    expect(s.start).toBe("random");
  });

  it("assainit les valeurs invalides et migre l'ancien « fixed »", () => {
    localStorage.setItem("gtrCfg", JSON.stringify({ mode: "bogus", rounds: 0, target: 3, start: "fixed" }));
    const s = useSettingsStore();
    expect(s.mode).toBe("rounds");
    expect(s.rounds).toBe(10);
    expect(s.target).toBe(1000);
    expect(s.start).toBe("alt"); // « toujours J1 » n'existe plus
  });

  it("décrit le mode sélectionné", () => {
    const s = useSettingsStore();
    expect(s.modeNote).toContain("10 manches");
    s.mode = "points";
    expect(s.modeNote).toContain("1000 points");
  });
});
