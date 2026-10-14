import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "@/lib/env";

/**
 * Cookie-less anon client for PUBLIC catalog reads (products, categories, ...).
 * It never touches cookies()/headers(), so it is safe inside `'use cache'`
 * scopes. Never use it for anything user-specific: use ./server for that.
 */
export function createPublicClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
