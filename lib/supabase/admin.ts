import { createClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig } from "./config";

/**
 * Server-only Supabase admin client.
 *
 * Used only inside trusted Server Actions for controlled anonymous MVP uploads.
 * Never import this from Client Components.
 */
export function createAdminClient() {
  assertSupabaseAdminConfig();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
