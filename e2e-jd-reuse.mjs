// E2E: JobTarget reuse — analyzing an IDENTICAL job description twice within
// one anonymous session must NOT trigger a second OpenAI call (cache/reuse
// path in app/actions/analyze-job.ts). The no-AI-call part is verified via
// the dev-server log ([ai-tokens] lines / reuse marker); a DB check verifies
// the reuse did not insert a second job_targets row for the session.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";

const JOB_DESCRIPTION = `Backend Engineering Intern

Streamline Analytics - Berlin / Remote | Internship

About the role: Join our platform team to build data ingestion services and internal tooling.

Responsibilities:
- Build REST APIs with Node.js and Express
- Write automated tests for services
- Assist with PostgreSQL schema migrations
- Support deployment automation on GCP

Requirements:
- Studying Computer Science or a related field
- Solid JavaScript/Node.js fundamentals
- Familiarity with Git
- Willingness to learn cloud deployment (GCP)

Preferred:
- TypeScript
- Docker
- Exposure to CI/CD pipelines`;

const results = [];
function log(check, pass, detail = "") {
  results.push({ check, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${check}${detail ? ` | ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("middleware")) {
    consoleErrors.push(msg.text().slice(0, 300));
  }
});

let sessionId = null;

try {
  // Fresh anonymous session — first analysis is a genuine AI call.
  await page.goto(`${BASE}/job-matcher`, { waitUntil: "domcontentloaded" });
  await page.locator("textarea").first().waitFor({ timeout: 30000 });

  await page.locator("textarea").first().fill(JOB_DESCRIPTION);
  await page.getByRole("button", { name: "Analyze Job" }).click();
  await page.getByText("Job description analyzed successfully").waitFor({ timeout: 120000 });
  const firstText = await page.locator("body").innerText();
  log("First analysis succeeds (AI call)", firstText.includes("Backend Engineering Intern"));
  console.log("MARKER: FIRST_ANALYSIS_DONE");

  // Reset the form and re-analyze the IDENTICAL description.
  await page.getByRole("button", { name: "New Analysis" }).click();
  await page.locator("textarea").first().waitFor({ timeout: 30000 });
  await page.locator("textarea").first().fill(JOB_DESCRIPTION);
  await page.getByRole("button", { name: "Analyze Job" }).click();

  // Reuse skips the AI round-trip entirely — it should resolve fast.
  await page.getByText("Job description analyzed successfully").waitFor({ timeout: 30000 });
  const secondText = await page.locator("body").innerText();
  log("Second analysis of identical JD succeeds", secondText.includes("Backend Engineering Intern"));
  log("JobTarget fields render (required skills card)", /required skills \(\d+\)/i.test(secondText));
  console.log("MARKER: SECOND_ANALYSIS_DONE");

  const cookies = await context.cookies();
  sessionId = cookies.find((c) => c.name === "s2c_anon_session")?.value ?? null;

  // No job-analyzer token line should appear between the two markers in the
  // server log; asserted from the shell after this script exits.
} catch (err) {
  log("Journey completed without unexpected errors", false, err.message.slice(0, 300));
} finally {
  await browser.close();
}

// ── DB check: the identical re-analysis must NOT have inserted a second
// job_targets row for this session (works in production mode too).
if (sessionId) {
  const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
  const getEnv = (key) => {
    const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
  };
  const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: jtRows, error: jtError } = await supabase
    .from("job_targets")
    .select("id, description, parsing_status")
    .eq("anonymous_session_id", sessionId);
  if (jtError) {
    log("DB check: job_targets query", false, jtError.message);
  } else {
    const matching = jtRows.filter((r) => (r.description ?? "").trim() === JOB_DESCRIPTION.trim());
    log("DB check: exactly 1 job_target row for the identical JD (no duplicate insert)", matching.length === 1, `rows=${matching.length}`);
  }
}

const failed = results.filter((r) => !r.pass).length;
console.log(`=== SUMMARY: ${results.length - failed}/${results.length} checks passed ===`);
// Exit non-zero only on failure — on success let Node tear down naturally
// (process.exit() races the Supabase client's closing sockets on Windows).
if (failed > 0) {
  process.exit(1);
}
