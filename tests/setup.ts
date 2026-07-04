/* Setup Vitest : localStorage en mémoire.
   Le localStorage exposé par happy-dom/Node dans l'environnement de test est
   incomplet (clear absent) — on installe une implémentation minimale fiable. */

class MemStorage implements Storage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemStorage(),
  configurable: true,
  writable: true,
});
