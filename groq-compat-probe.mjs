// Groq API compatibility probe — verifies the ACTUAL Groq API behavior for
// the exact request shapes the app uses, before trusting the migration.
//
// Checks (against https://api.groq.com/openai/v1, model openai/gpt-oss-20b):
//   1. Model availability      — openai/gpt-oss-20b appears in models.list()
//   2. JSON mode               — response_format {type:"json_object"} works
//   3. Usage reporting         — prompt/completion/total tokens present
//   4. Error format            — invalid model surfaces a typed error with status
//   5. Timeout behavior        — 1ms timeout aborts quickly with a known name
//
// Requires GROQ_API_KEY in .env.local. One-off verification script —
// not part of the app or the e2e suite.
import { readFileSync } from "node:fs";
import OpenAI from "openai";

const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
};

const GROQ_API_KEY = getEnv("GROQ_API_KEY");
const MODEL = "openai/gpt-oss-20b";

if (!GROQ_API_KEY) {
  console.log("FAIL: GROQ_API_KEY is not set in .env.local");
  process.exit(1);
}

const groq = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
};

// ── 1. Model availability ────────────────────────────
try {
  const models = await groq.models.list();
  const ids = models.data.map((m) => m.id);
  check("openai/gpt-oss-20b is available", ids.includes(MODEL), `${ids.length} models visible`);
} catch (err) {
  check("openai/gpt-oss-20b is available", false, err.message);
}

// ── 2 + 3. JSON mode + usage reporting ───────────────
try {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return JSON only. Shape: {\"name\": string, \"skills\": string[]}" },
      { role: "user", content: "Extract: Jane Doe knows Python and SQL." },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "";
  let parsed = null;
  try {
    parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1"));
  } catch {
    parsed = null;
  }

  check("JSON mode returns parseable JSON", parsed !== null, `content_len=${content.length}`);
  check(
    "usage reports prompt/completion/total tokens",
    typeof completion.usage?.prompt_tokens === "number" &&
      typeof completion.usage?.completion_tokens === "number" &&
      typeof completion.usage?.total_tokens === "number",
    `prompt=${completion.usage?.prompt_tokens} completion=${completion.usage?.completion_tokens} total=${completion.usage?.total_tokens}`
  );
  check("model is echoed back", typeof completion.model === "string" && completion.model.length > 0, completion.model);
} catch (err) {
  check("JSON mode returns parseable JSON", false, err.message);
  check("usage reports prompt/completion/total tokens", false);
  check("model is echoed back", false);
}

// ── 4. Error format (invalid model → expect 4xx with status) ──
try {
  await groq.chat.completions.create({
    model: "not-a-real-model",
    messages: [{ role: "user", content: "hi" }],
  });
  check("invalid model returns a typed error with HTTP status", false, "no error thrown");
} catch (err) {
  check(
    "invalid model returns a typed error with HTTP status",
    typeof err.status === "number" && err.status >= 400 && err.status < 500,
    `status=${err.status} name=${err.name} code=${err.code ?? "n/a"}`
  );
}

// ── 5. Timeout behavior (1ms budget → fast abort) ────
const timeoutStartedAt = Date.now();
try {
  await groq.chat.completions.create(
    { model: MODEL, messages: [{ role: "user", content: "hi" }] },
    { timeout: 1 }
  );
  check("request timeout aborts quickly", false, "no error thrown");
} catch (err) {
  const elapsedMs = Date.now() - timeoutStartedAt;
  check(
    "request timeout aborts with a recognizable error name",
    elapsedMs < 60_000 && typeof err.name === "string" && err.name.length > 0,
    `name=${err.name} code=${err.code ?? "n/a"} elapsed_ms=${elapsedMs}`
  );
}

console.log(failed === 0 ? "\nALL PROBES PASSED" : `\n${failed} PROBE(S) FAILED`);
if (failed > 0) process.exit(1);
