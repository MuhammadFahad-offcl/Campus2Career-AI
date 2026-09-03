import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the OpenAI SDK — the provider layer must be testable without any
// network access. Both Groq and OpenAI run on this SDK client.
const { createMock, ctorMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  ctorMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createMock } };

    constructor(config: Record<string, unknown>) {
      ctorMock(config);
    }
  },
}));

import {
  assertAIConfig,
  getActiveAIProvider,
  getFallbackAIProvider,
  runCompletion,
} from "./provider";

function fakeCompletion(model: string) {
  return {
    model,
    choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

const REQUEST = {
  temperature: 0.1,
  response_format: { type: "json_object" as const },
  messages: [{ role: "system" as const, content: "system prompt" }],
};

beforeEach(() => {
  createMock.mockReset();
  ctorMock.mockClear();
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubEnv("GROQ_API_KEY", "test-groq-key");
  delete process.env.AI_PROVIDER;
  delete process.env.AI_MODEL;
  delete process.env.AI_FALLBACK_PROVIDER;
  delete process.env.GROQ_REASONING_EFFORT;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ──────────────────────────────────────────────
// Provider resolution
// ──────────────────────────────────────────────

describe("provider resolution", () => {
  it("defaults to openai when AI_PROVIDER is unset (rollback-compatible)", () => {
    const handle = getActiveAIProvider();
    expect(handle.provider).toBe("openai");
    expect(handle.model).toBe("gpt-4o-mini");
  });

  it("resolves AI_PROVIDER=groq with the gpt-oss-20b default model", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    const handle = getActiveAIProvider();
    expect(handle.provider).toBe("groq");
    expect(handle.model).toBe("openai/gpt-oss-20b");
  });

  it("treats an unknown AI_PROVIDER value as unset (safe default)", () => {
    vi.stubEnv("AI_PROVIDER", "not-a-provider");
    const handle = getActiveAIProvider();
    expect(handle.provider).toBe("openai");
  });

  it("AI_MODEL overrides the provider default model", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_MODEL", "openai/gpt-oss-120b");
    const handle = getActiveAIProvider();
    expect(handle.model).toBe("openai/gpt-oss-120b");
  });

  it("configures the Groq client with the OpenAI-compatible base URL", async () => {
    vi.resetModules();
    vi.stubEnv("AI_PROVIDER", "groq");
    const { getActiveAIProvider: freshGetActive } = await import("./provider");
    freshGetActive();
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-groq-key",
        baseURL: "https://api.groq.com/openai/v1",
      })
    );
  });

  it("configures the OpenAI client without a baseURL override", async () => {
    vi.resetModules();
    const { getActiveAIProvider: freshGetActive } = await import("./provider");
    freshGetActive();
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "test-openai-key" })
    );
    const config = ctorMock.mock.calls[ctorMock.mock.calls.length - 1][0];
    expect(config).not.toHaveProperty("baseURL");
  });
});

// ──────────────────────────────────────────────
// Configuration assertions
// ──────────────────────────────────────────────

describe("assertAIConfig", () => {
  it("throws a clear error when the active provider key is missing", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    delete process.env.GROQ_API_KEY;
    expect(() => assertAIConfig()).toThrow("GROQ_API_KEY is not configured.");
  });

  it("throws for a missing OpenAI key when openai is active", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => assertAIConfig()).toThrow("OPENAI_API_KEY is not configured.");
  });

  it("does not throw when only the fallback provider is unconfigured", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "openai");
    delete process.env.OPENAI_API_KEY;
    expect(() => assertAIConfig()).not.toThrow();
  });
});

// ──────────────────────────────────────────────
// Fallback resolution
// ──────────────────────────────────────────────

describe("getFallbackAIProvider", () => {
  it("returns null when AI_FALLBACK_PROVIDER is unset", () => {
    expect(getFallbackAIProvider()).toBeNull();
  });

  it("returns null when the fallback equals the active provider", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "groq");
    expect(getFallbackAIProvider()).toBeNull();
  });

  it("resolves a configured, keyed fallback provider", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "openai");
    const fallback = getFallbackAIProvider();
    expect(fallback?.provider).toBe("openai");
    expect(fallback?.model).toBe("gpt-4o-mini");
  });

  it("returns null when the fallback provider has no API key", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "openai");
    delete process.env.OPENAI_API_KEY;
    expect(getFallbackAIProvider()).toBeNull();
  });
});

// ──────────────────────────────────────────────
// runCompletion — active provider, model injection, timeouts
// ──────────────────────────────────────────────

describe("runCompletion", () => {
  it("sends the configured model and request through the active provider", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    createMock.mockResolvedValueOnce(fakeCompletion("openai/gpt-oss-20b"));

    const completion = await runCompletion("resume-analyzer", REQUEST, {
      timeout: 45_000,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const [params, options] = createMock.mock.calls[0];
    expect(params.model).toBe("openai/gpt-oss-20b");
    expect(params.temperature).toBe(0.1);
    expect(params.response_format).toEqual({ type: "json_object" });
    expect(params.messages).toEqual(REQUEST.messages);
    expect(options).toEqual({ timeout: 45_000 });
    expect(completion.choices[0]?.message?.content).toBe("{\"ok\":true}");
  });

  it("injects low reasoning effort + completion budget for gpt-oss on Groq", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    createMock.mockResolvedValueOnce(fakeCompletion("openai/gpt-oss-20b"));

    await runCompletion("resume-analyzer", REQUEST, { timeout: 45_000 });

    const params = createMock.mock.calls[0][0];
    expect(params.reasoning_effort).toBe("low");
    expect(params.max_completion_tokens).toBe(3072);
  });

  it("honors GROQ_REASONING_EFFORT override for gpt-oss on Groq", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("GROQ_REASONING_EFFORT", "medium");
    createMock.mockResolvedValueOnce(fakeCompletion("openai/gpt-oss-20b"));

    await runCompletion("resume-analyzer", REQUEST, { timeout: 45_000 });

    expect(createMock.mock.calls[0][0].reasoning_effort).toBe("medium");
  });

  it("adds NO extra params for non-gpt-oss Groq models", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_MODEL", "llama-3.3-70b-versatile");
    createMock.mockResolvedValueOnce(fakeCompletion("llama-3.3-70b-versatile"));

    await runCompletion("resume-analyzer", REQUEST, { timeout: 45_000 });

    const params = createMock.mock.calls[0][0];
    expect(params).not.toHaveProperty("reasoning_effort");
    expect(params).not.toHaveProperty("max_completion_tokens");
  });

  it("adds NO extra params for OpenAI (request shape unchanged)", async () => {
    createMock.mockResolvedValueOnce(fakeCompletion("gpt-4o-mini"));

    await runCompletion("resume-analyzer", REQUEST, { timeout: 45_000 });

    const params = createMock.mock.calls[0][0];
    expect(params).not.toHaveProperty("reasoning_effort");
    expect(params).not.toHaveProperty("max_completion_tokens");
  });

  it("falls back on 413 (request too large for the provider's limits)", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "openai");
    const tooLarge = Object.assign(new Error("too large"), { status: 413 });
    createMock
      .mockRejectedValueOnce(tooLarge)
      .mockResolvedValueOnce(fakeCompletion("gpt-4o-mini"));

    const completion = await runCompletion("resume-rewriter", REQUEST, {
      timeout: 60_000,
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(completion.model).toBe("gpt-4o-mini");
  });

  it("falls back exactly once on a 429 rate limit", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "openai");
    const rateLimit = Object.assign(new Error("rate limited"), { status: 429 });
    createMock
      .mockRejectedValueOnce(rateLimit)
      .mockResolvedValueOnce(fakeCompletion("gpt-4o-mini"));

    const completion = await runCompletion("job-analyzer", REQUEST, {
      timeout: 45_000,
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0][0].model).toBe("openai/gpt-oss-20b");
    expect(createMock.mock.calls[1][0].model).toBe("gpt-4o-mini");
    expect(completion.model).toBe("gpt-4o-mini");
  });

  it("falls back on 5xx provider errors and timeouts", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "openai");

    const outage = Object.assign(new Error("upstream"), { status: 503 });
    createMock
      .mockRejectedValueOnce(outage)
      .mockResolvedValueOnce(fakeCompletion("gpt-4o-mini"));
    await runCompletion("skill-bridge", REQUEST, { timeout: 60_000 });

    const timeout = Object.assign(new Error("timed out"), { name: "AbortError" });
    createMock
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(fakeCompletion("gpt-4o-mini"));
    await runCompletion("skill-bridge", REQUEST, { timeout: 60_000 });

    expect(createMock).toHaveBeenCalledTimes(4);
  });

  it("does NOT fall back on non-transient errors (400 bad request)", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "openai");
    const badRequest = Object.assign(new Error("bad request"), { status: 400 });
    createMock.mockRejectedValueOnce(badRequest);

    await expect(
      runCompletion("resume-analyzer", REQUEST, { timeout: 45_000 })
    ).rejects.toThrow("bad request");

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("rethrows the original error when no fallback is configured", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    const rateLimit = Object.assign(new Error("rate limited"), { status: 429 });
    createMock.mockRejectedValueOnce(rateLimit);

    await expect(
      runCompletion("resume-analyzer", REQUEST, { timeout: 45_000 })
    ).rejects.toThrow("rate limited");

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("throws when both providers fail — no third attempt, no storm", async () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_FALLBACK_PROVIDER", "openai");
    const rateLimit = Object.assign(new Error("groq 429"), { status: 429 });
    const second = Object.assign(new Error("openai 429"), { status: 429 });
    createMock.mockRejectedValueOnce(rateLimit).mockRejectedValueOnce(second);

    await expect(
      runCompletion("resume-rewriter", REQUEST, { timeout: 60_000 })
    ).rejects.toThrow("openai 429");

    expect(createMock).toHaveBeenCalledTimes(2);
  });
});
