/**
 * AI provider layer — the single source of truth for provider and model
 * selection across all four AI workflows (resume analyzer, job analyzer,
 * resume rewriter, skill bridge).
 *
 *   AI workflow services
 *     ↓ runCompletion()
 *   active provider (Groq primary, OpenAI rollback — both speak the
 *   OpenAI-compatible chat-completions API on the same OpenAI SDK client)
 *     ↓ optional: ONE fallback attempt on transient provider failure
 *
 * Switching providers is configuration-only:
 *   AI_PROVIDER=groq   → Groq primary (requires GROQ_API_KEY)
 *   AI_PROVIDER=openai → OpenAI primary (rollback / debugging)
 *
 * Environment variables (server-side only — never NEXT_PUBLIC_):
 *   AI_PROVIDER          "groq" | "openai". Default "openai" so existing
 *                        deployments keep working unchanged.
 *   AI_MODEL             optional model override for the active provider.
 *   AI_FALLBACK_PROVIDER optional second provider used ONLY when the
 *                        active provider fails transiently (rate limit,
 *                        5xx, timeout, connection). Never for validation
 *                        errors or client-side request problems; exactly
 *                        one attempt — no retry storms, no double billing.
 *   GROQ_API_KEY         required when groq is active or fallback.
 *   OPENAI_API_KEY       required when openai is active or fallback.
 *
 * NEVER log API keys or request/response content from this module.
 */

import OpenAI from "openai";
import { callWithTokenMetrics } from "./token-metrics";

export type AIProviderName = "groq" | "openai";

interface ProviderSpec {
  name: AIProviderName;
  apiKeyEnv: "GROQ_API_KEY" | "OPENAI_API_KEY";
  /** OpenAI-compatible base URL (Groq); undefined = OpenAI default. */
  baseURL?: string;
  defaultModel: string;
}

/**
 * Provider registry. Groq runs on its OpenAI-compatible endpoint
 * (https://api.groq.com/openai/v1), so both providers share the
 * existing OpenAI SDK client — provider selection is only
 * apiKey + baseURL + model.
 */
const PROVIDERS: Record<AIProviderName, ProviderSpec> = {
  groq: {
    name: "groq",
    apiKeyEnv: "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-20b",
  },
  openai: {
    name: "openai",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
  },
};

/** Resolved, ready-to-use provider handle. */
export interface AIProviderHandle {
  provider: AIProviderName;
  model: string;
  client: OpenAI;
}

/** Request shape shared by all four AI workflows. */
export interface AICompletionRequest {
  temperature: number;
  response_format?: { type: "json_object" };
  messages: { role: "system" | "user"; content: string }[];
}

// One SDK client per provider per server process.
const cachedClients = new Map<AIProviderName, OpenAI>();

function parseProviderName(raw: string | undefined): AIProviderName | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (value === "groq" || value === "openai") return value;
  return null;
}

function activeProviderName(): AIProviderName {
  return parseProviderName(process.env.AI_PROVIDER) ?? "openai";
}

function buildProviderHandle(name: AIProviderName): AIProviderHandle {
  const spec = PROVIDERS[name];
  const apiKey = process.env[spec.apiKeyEnv];

  if (!apiKey) {
    throw new Error(`${spec.apiKeyEnv} is not configured.`);
  }

  let client = cachedClients.get(name);
  if (!client) {
    client = new OpenAI({
      apiKey,
      ...(spec.baseURL ? { baseURL: spec.baseURL } : {}),
    });
    cachedClients.set(name, client);

    if (process.env.NODE_ENV !== "production") {
      const modelOverride = process.env.AI_MODEL?.trim();
      console.log(
        `[ai-provider] initialized provider=${name}` +
          ` model=${modelOverride || spec.defaultModel}` +
          (spec.baseURL ? ` baseURL=${spec.baseURL}` : "")
      );
    }
  }

  const modelOverride = process.env.AI_MODEL?.trim();
  return {
    provider: name,
    model: modelOverride || spec.defaultModel,
    client,
  };
}

/** The provider all AI workflows call by default. */
export function getActiveAIProvider(): AIProviderHandle {
  return buildProviderHandle(activeProviderName());
}

/**
 * Optional fallback provider (AI_FALLBACK_PROVIDER). Returns null when
 * disabled, identical to the active provider, or missing its API key —
 * a fallback must never become a second call to the same provider or
 * take the app down.
 */
export function getFallbackAIProvider(): AIProviderHandle | null {
  const fallbackName = parseProviderName(process.env.AI_FALLBACK_PROVIDER);
  if (!fallbackName || fallbackName === activeProviderName()) return null;

  try {
    return buildProviderHandle(fallbackName);
  } catch {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[ai-provider] AI_FALLBACK_PROVIDER="${process.env.AI_FALLBACK_PROVIDER}" is configured but unusable — fallback disabled.`
      );
    }
    return null;
  }
}

/**
 * Fail-fast configuration check. Throws when the ACTIVE provider is
 * missing its API key; an unusable fallback only warns (the app keeps
 * running on the active provider).
 */
export function assertAIConfig(): void {
  buildProviderHandle(activeProviderName());

  const fallbackName = parseProviderName(process.env.AI_FALLBACK_PROVIDER);
  if (fallbackName && fallbackName !== activeProviderName()) {
    try {
      buildProviderHandle(fallbackName);
    } catch {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[ai-provider] fallback provider "${fallbackName}" is not configured — fallback disabled.`
        );
      }
    }
  }
}

/**
 * Transient provider failures where a single fallback attempt is
 * appropriate. Deliberately EXCLUDES other 4xx (bad request, invalid
 * key — application/config problems) and validation errors, which are
 * classified downstream in the workflow services. 413 is included
 * because Groq's free tier pre-flights prompt+max_completion against
 * the TPM limit — a request too large for Groq can still succeed on
 * the fallback provider.
 */
function isTransientProviderError(err: unknown): boolean {
  const maybeError = err as { status?: number; name?: string; code?: string };

  if (maybeError.status === 429) return true; // provider rate limit
  if (maybeError.status === 413) return true; // request too large for this provider's limits
  if (typeof maybeError.status === "number" && maybeError.status >= 500) {
    return true; // provider outage
  }

  const name = maybeError.name ?? "";
  if (
    name === "AbortError" ||
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError" ||
    maybeError.code === "ETIMEDOUT"
  ) {
    return true; // request timeout / network failure
  }

  return false;
}

/**
 * Provider/model-specific request parameters.
 *
 * gpt-oss models on Groq are reasoning models whose reasoning tokens count
 * toward completion tokens. With the default "medium" effort the reasoning
 * can consume the entire completion budget and starve the JSON content
 * (empirically verified: a structurally valid profile with ALL content
 * arrays empty, completion capped at exactly 2048) or fail Groq's
 * server-side JSON validation outright (400 "Failed to validate JSON").
 * Low reasoning effort is correct for structured extraction and keeps
 * prompt+completion inside the free-tier 8K TPM pre-flight limit
 * (Groq rejects requests where prompt_tokens + max_completion_tokens
 * exceeds the TPM limit, so this budget must stay modest).
 */
function providerRequestParams(
  provider: AIProviderName,
  model: string
): Record<string, unknown> {
  if (provider === "groq" && model.startsWith("openai/gpt-oss")) {
    return {
      reasoning_effort: process.env.GROQ_REASONING_EFFORT?.trim() || "low",
      max_completion_tokens: 3072,
    };
  }

  // Other providers/models keep the exact request shape the workflows
  // define — no extra parameters.
  return {};
}

async function createCompletion(
  handle: AIProviderHandle,
  request: AICompletionRequest,
  timeout: number
) {
  return handle.client.chat.completions.create(
    {
      ...request,
      model: handle.model,
      ...providerRequestParams(handle.provider, handle.model),
    },
    { timeout }
  );
}

export type AICompletionResult = Awaited<ReturnType<typeof createCompletion>>;

/**
 * Run one chat completion on the active provider, with an optional
 * single fallback attempt on transient provider failure.
 *
 * The model always comes from the provider configuration — services
 * never hard-code model names. Token metrics are recorded per attempt
 * (provider + model) via the existing token-metrics layer.
 */
export async function runCompletion(
  workflow: string,
  request: AICompletionRequest,
  options: { timeout: number }
): Promise<AICompletionResult> {
  const active = getActiveAIProvider();

  try {
    return await callWithTokenMetrics(
      workflow,
      active.provider,
      active.model,
      () => createCompletion(active, request, options.timeout)
    );
  } catch (err) {
    const fallback = getFallbackAIProvider();
    if (!fallback || !isTransientProviderError(err)) throw err;

    if (process.env.NODE_ENV !== "production") {
      const maybeError = err as { status?: number; name?: string };
      const reason = maybeError.status ?? maybeError.name ?? "unknown";
      console.log(
        `[ai-fallback] workflow=${workflow} from=${active.provider}` +
          ` to=${fallback.provider} reason=${reason}`
      );
    }

    return await callWithTokenMetrics(
      workflow,
      fallback.provider,
      fallback.model,
      () => createCompletion(fallback, request, options.timeout)
    );
  }
}
