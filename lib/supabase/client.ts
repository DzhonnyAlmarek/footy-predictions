import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// ВАЖНО: читать env только статически, чтобы Next подставил значения в клиентский бандл
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assertClientEnv() {
  if (!SUPABASE_URL) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function createClient(): SupabaseClient {
  assertClientEnv();

  return createSupabaseClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

// singleton для client components
const supabaseClient = createClient();
export default supabaseClient;
export { supabaseClient };
