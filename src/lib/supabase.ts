/* ============================================================
   supabase.ts — client Supabase, null si non configuré
   (le jeu fonctionne alors normalement, sans profils)
   ============================================================ */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
