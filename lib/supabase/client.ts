/**
 * Supabase browser client.
 *
 * Use this in client components and for operations that don't need
 * server-side auth cookie handling.
 *
 * For server components and Route Handlers, use "@/lib/supabase/server" instead.
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
