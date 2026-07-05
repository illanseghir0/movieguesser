import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { useTurnTimer } from "../src/lib/useTurnTimer";

/** monte le composable dans un vrai composant (onUnmounted, listeners) */
function withSetup<T>(fn: () => T): { result: T; unmount: () => void } {
  let result!: T;
  const app = createApp(defineComponent({
    setup() { result = fn(); return () => h("div"); },
  }));
  app.mount(document.createElement("div"));
  return { result, unmount: () => app.unmount() };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useTurnTimer — chrono sur l'horloge réelle", () => {
  it("décompte et n'expire qu'une seule fois", () => {
    const onExpire = vi.fn();
    const { result } = withSetup(() => useTurnTimer(onExpire));
    result.start(5);
    expect(result.timeLeft.value).toBe(5);
    vi.advanceTimersByTime(2000);
    expect(result.timeLeft.value).toBe(3);
    vi.advanceTimersByTime(3000);
    expect(result.timeLeft.value).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);              // le chrono est arrêté
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("se recale sur l'horloge réelle si des ticks ont été sautés (onglet en arrière-plan)", () => {
    const onExpire = vi.fn();
    const { result } = withSetup(() => useTurnTimer(onExpire));
    result.start(10);
    // throttling : 9 s passent sans qu'aucun tick ne tourne
    vi.setSystemTime(Date.now() + 9000);
    vi.advanceTimersByTime(250);               // premier tick au réveil
    expect(result.timeLeft.value).toBe(1);     // pas 10 : le temps a réellement filé
    expect(onExpire).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 2000);
    vi.advanceTimersByTime(250);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("stop() coupe le chrono sans expiration", () => {
    const onExpire = vi.fn();
    const { result } = withSetup(() => useTurnTimer(onExpire));
    result.start(3);
    result.stop();
    vi.advanceTimersByTime(10000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("start(0) ne lance rien (mode sans chrono)", () => {
    const onExpire = vi.fn();
    const { result } = withSetup(() => useTurnTimer(onExpire));
    result.start(0);
    vi.advanceTimersByTime(10000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
