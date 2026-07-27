import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let clientInitFailed = false;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  if (clientInitFailed) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    clientInitFailed = true;
    return null;
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null;
}
