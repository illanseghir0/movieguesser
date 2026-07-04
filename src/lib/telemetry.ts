/* ============================================================
   telemetry.ts — visibilité minimale sur les erreurs en production
   Compteurs en mémoire + console.warn, et report vers la table
   Supabase `error_events` (insert-only, plafonné à 10 par session
   pour ne jamais spammer). Zéro dépendance externe.
   ============================================================ */

import { supabase } from "./supabase";

export const errorCounts: Record<string, number> = {};
let sent = 0;

export function reportError(category: string, detail?: string) {
  errorCounts[category] = (errorCounts[category] ?? 0) + 1;
  console.warn(`[mg] ${category}${detail ? ` — ${detail}` : ""} (x${errorCounts[category]})`);
  if (supabase && sent < 10) {
    sent++;
    supabase.from("error_events").insert({
      category: category.slice(0, 40),
      detail: detail?.slice(0, 300) ?? null,
      ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    }).then(
      ({ error }) => { if (error) console.warn("[mg] télémétrie indisponible:", error.message); },
      () => { /* réseau coupé : tant pis */ },
    );
  }
}
