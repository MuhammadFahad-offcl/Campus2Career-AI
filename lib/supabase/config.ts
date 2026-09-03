const PLACEHOLDER_VALUES = new Set([
  "placeholder",
  "placeholder-key",
  "placeholder-service-role-key",
  "your-project-url",
  "your-anon-key",
  "your-service-role-key",
  "your-openai-api-key",
]);

export function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;

  const trimmed = value.trim();
  if (!trimmed) return true;

  return PLACEHOLDER_VALUES.has(trimmed.toLowerCase());
}

export function isRealSupabaseUrl(value: string | undefined): boolean {
  if (!value) return false;

  const trimmed = value.trim();
  if (!trimmed.startsWith("https://")) return false;

  try {
    const url = new URL(trimmed);
    return url.hostname.includes("supabase.co");
  } catch {
    return false;
  }
}

export function assertSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!isRealSupabaseUrl(url) && isPlaceholderValue(url)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (isPlaceholderValue(anonKey)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.");
  }
}

export function assertSupabaseAdminConfig() {
  assertSupabasePublicConfig();

  if (isPlaceholderValue(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
}
