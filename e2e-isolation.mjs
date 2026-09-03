// Test 6 (part 2) — Ownership isolation: a second anonymous session must see
// NONE of Session A's data (resume, profile, job target, analysis, rewrite,
// skill bridge, dashboard), and direct access to A's resume id must be denied.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3000";

// ── Find Session A's latest resume via the service role (test harness only) ──
const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
};
const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
const { data: latest } = await supabase
  .from("resumes")
  .select("id, file_name, anonymous_session_id, analysis_status")
  .order("created_at", { ascending: false })
  .limit(1)
  .single();
if (!latest) {
  console.log("FATAL: no Session A resume found in DB");
  process.exit(1);
}
console.log(`Session A resume: ${latest.id} (${latest.file_name}, analysis=${latest.analysis_status})`);

const results = [];
function log(check, pass, detail = "") {
  results.push({ check, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${check}${detail ? ` | ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

try {
  // ── 1. Dashboard: welcome state, no Session A data ──
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByText("Welcome to Campus2Career").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500); // let any (incorrect) restore finish
  const dashText = await page.locator("body").innerText();
  log("B-dashboard shows welcome state (no resume)", dashText.includes("No resume yet"));
  log("B-dashboard has NO Session A name", !dashText.includes("Nadia Rahman"), "no 'Nadia Rahman'");
  log("B-dashboard has NO Session A job", !dashText.includes("TechNova"), "no 'TechNova'");
  log("B-dashboard has NO fabricated match score", !/\d+%\s*|\d+\/\d+/.test(dashText.split("History")[0] || "") || dashText.includes("—"), "no invented metrics");

  // ── 2. Job matcher: empty, no restore ──
  await page.goto(`${BASE}/job-matcher`, { waitUntil: "domcontentloaded" });
  await page.locator("textarea").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000); // restore effect must resolve to empty
  const jobText = await page.locator("body").innerText();
  const textareaValue = await page.locator("textarea").first().inputValue();
  log("B-job-matcher textarea empty", textareaValue === "", `value=${JSON.stringify(textareaValue.slice(0, 40))}`);
  log("B-job-matcher NO restored job banner", !jobText.includes("Showing your most recently analyzed job"));
  log("B-job-matcher NO Session A job title", !jobText.includes("AI / Full-Stack Developer Intern"));

  // ── 3. Rewrite: idle, no restored suggestions ──
  await page.goto(`${BASE}/resume`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000); // restore effect must resolve to idle
  const rewriteText = await page.locator("body").innerText();
  const genBtn = await page.getByRole("button", { name: "Generate Rewrite Suggestions" }).count();
  log("B-rewrite idle with generate CTA", genBtn > 0);
  log("B-rewrite NO restored suggestions banner", !rewriteText.includes("Showing your most recently generated suggestions"));
  log("B-rewrite NO Session A suggestions", !(await page.getByRole("button", { name: /^Accept$/ }).count()));

  // ── 4. Skill bridge: no plan ──
  await page.goto(`${BASE}/skill-bridge`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const planBtn = await page.getByRole("button", { name: "Generate My 7-Day Plan" }).count();
  log("B-skill-bridge shows generate CTA (no plan)", planBtn > 0);
  log("B-skill-bridge NO day cards", !(await page.getByText(/^Day \d+:/).count()));

  // ── 5. Direct URL to Session A's resume → access denied ──
  await page.goto(`${BASE}/analysis?resume=${latest.id}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Analysis failed").waitFor({ timeout: 30000 });
  const deniedText = await page.locator("body").innerText();
  log("B-analysis?resume=<A's id> DENIED", deniedText.includes("not found or you do not have access"), "ownership filter blocks cross-session read");
  log("B-analysis NO Session A profile rendered", !deniedText.includes("Candidate Overview"));

  // ── 6. Session B has its own anonymous session cookie ──
  const cookies = await context.cookies();
  const anon = cookies.find((c) => c.name === "s2c_anon_session");
  const differentSession = anon && anon.value !== latest.anonymous_session_id;
  log("B-anon cookie present and differs from Session A", !!differentSession, anon ? `httpOnly=${anon.httpOnly}` : "MISSING");
} catch (err) {
  log("FATAL", false, err.message.slice(0, 300));
  await page.screenshot({ path: fileURLToPath(new URL("./e2e-shots/isolation-fatal.png", import.meta.url)), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n=== ISOLATION SUMMARY: ${results.length - failed.length}/${results.length} passed ===`);
failed.forEach((f) => console.log(` - ${f.check}: ${f.detail}`));
