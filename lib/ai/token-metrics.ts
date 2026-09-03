/**
 * Lightweight server-side token observability for AI calls
 * (provider-agnostic: Groq primary, OpenAI rollback).
 *
 * Logs one structured line per AI call in development:
 *   workflow, provider, model, input/output/total tokens (from the
 *   provider's `usage` field — never manually estimated), duration,
 *   and success.
 *
 * NEVER logs API keys, cookies, auth tokens, or prompt/response content.
 * Not exposed to end users in any way (server console only, dev only).
 */

/** Shape shared by all OpenAI-compatible completion responses. */
interface HasUsage {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
  model?: string;
}

export interface AiTokenUsageLog {
  workflow: string;
  provider: string;
  usage?: HasUsage["usage"];
  model?: string;
  durationMs: number;
  ok: boolean;
}

export function logAiTokenUsage(log: AiTokenUsageLog): void {
  // Development metrics only — never emitted in production.
  if (process.env.NODE_ENV === "production") return;

  const { workflow, provider, usage, model, durationMs, ok } = log;
  console.log(
    `[ai-tokens] workflow=${workflow} provider=${provider} model=${model ?? "?"}` +
      ` input=${usage?.prompt_tokens ?? "?"}` +
      ` output=${usage?.completion_tokens ?? "?"}` +
      ` total=${usage?.total_tokens ?? "?"}` +
      ` duration_ms=${durationMs} ok=${ok}`
  );
}

/**
 * Run a single AI completion call with token metrics attached.
 * Re-throws the original error after logging the failure — this helper
 * never swallows errors and never changes call semantics.
 */
export async function callWithTokenMetrics<T extends HasUsage>(
  workflow: string,
  provider: string,
  configuredModel: string,
  call: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await call();
    logAiTokenUsage({
      workflow,
      provider,
      usage: result.usage ?? null,
      model: result.model ?? configuredModel,
      durationMs: Date.now() - startedAt,
      ok: true,
    });
    return result;
  } catch (err) {
    logAiTokenUsage({
      workflow,
      provider,
      model: configuredModel,
      usage: null,
      durationMs: Date.now() - startedAt,
      ok: false,
    });
    throw err;
  }
}
