// E2E golden journey — Phase 3C final MVP QA.
// Drives the complete anonymous flow with a fresh Playwright context.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3000";
const RESUME_PATH = fileURLToPath(new URL("./e2e-nadia-rahman-resume.pdf", import.meta.url));
const SHOT_DIR = fileURLToPath(new URL("./e2e-shots/", import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const JOB_DESCRIPTION = `AI / Full-Stack Developer Intern

TechNova Solutions - Dhaka / Remote | Internship | 6 months

About the role: We are looking for an enthusiastic AI / Full-Stack Developer Intern to join our product engineering team. You will help build and ship features across our AI-powered hiring platform, working with modern web technologies and cloud infrastructure.

Responsibilities:
- Build and maintain REST APIs using FastAPI and Python
- Develop responsive front-end features with React and TypeScript
- Write and maintain unit and integration tests
- Containerize services with Docker and assist with CI/CD pipelines
- Work with PostgreSQL databases, writing queries and basic migrations
- Deploy and monitor services on AWS (EC2, S3, Lambda)
- Participate in code reviews and agile ceremonies

Requirements:
- Currently pursuing or recently completed a degree in Computer Science or a related field
- Strong foundation in Python programming
- Hands-on experience with React for building user interfaces
- Familiarity with Git and collaborative development workflows
- Understanding of REST APIs and client-server architecture
- Eagerness to learn cloud technologies (AWS) and containerization (Docker)

Preferred qualifications:
- Experience with FastAPI, Django, or Flask
- Experience with PostgreSQL or other SQL databases
- Knowledge of TypeScript
- Exposure to Docker, CI/CD pipelines, or AWS services
- Interest in AI/ML applications

What we offer: Mentorship from senior engineers, flexible working hours, remote-friendly culture, and potential for a full-time offer after the internship.`;

const results = [];
const consoleErrors = [];
function log(stage, check, pass, detail = "") {
  const entry = { stage, check, pass, detail };
  results.push(entry);
  console.log(`${pass ? "PASS" : "FAIL"} | ${stage} | ${check}${detail ? ` | ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("middleware")) {
    consoleErrors.push(msg.text().slice(0, 300));
  }
});
page.on("pageerror", (err) => consoleErrors.push(`PAGEERROR: ${err.message.slice(0, 300)}`));

async function shot(name) {
  await page.screenshot({ path: `${SHOT_DIR}${name}.png`, fullPage: true }).catch(() => {});
}

try {
  // ── STAGE 1: Landing + resume upload ─────────────────────────
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const heroOk = await page.getByRole("link", { name: "Analyze Your Resume" }).first().isVisible().catch(() => false);
  log("S1-landing", "Hero CTA renders", heroOk);
  const comingSoon = await page.getByText("Coming Soon").count();
  log("S1-landing", "No 'Coming Soon' badges on implemented features", comingSoon === 0, `found=${comingSoon}`);

  await page.getByRole("link", { name: "Analyze Your Resume" }).first().click();
  await page.waitForURL("**/analysis", { timeout: 30000 });
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(RESUME_PATH);

  // The uploader requires an explicit confirm click after file selection.
  await page.getByRole("button", { name: "Upload & Process Resume" }).click();
  await page.getByText("Resume processed successfully").waitFor({ timeout: 120000 });
  log("S1-upload", "Resume upload + text extraction succeeded", true);

  // Extraction done — now trigger the AI profile analysis.
  await page.getByRole("link", { name: "Analyze Resume" }).click();
  await page.waitForURL(/\/analysis\?resume=/, { timeout: 30000 });

  // Wait for the real AI profile ("Candidate Overview" only renders from the
  // profile card — "Nadia Rahman" also matches the extracted-text preview).
  await page.getByText("Candidate Overview").waitFor({ timeout: 120000 });
  const profileText = await page.locator("body").innerText();
  log("S1-profile", "CandidateProfile generated", profileText.includes("Nadia Rahman"), "name visible");
  log("S1-profile", "Email extracted", profileText.includes("nadia.rahman@student.edu"));
  log("S1-profile", "Education extracted", profileText.includes("University of Dhaka"));
  await shot("01-profile");

  // Refresh → cached profile
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Candidate Overview").waitFor({ timeout: 60000 });
  const cachedBanner = await page.getByText("Using previously analyzed profile").count();
  log("S1-refresh", "Profile persists after refresh (cached, no re-analysis)", cachedBanner > 0, `"Using previously analyzed profile" banner=${cachedBanner > 0}`);

  // ── STAGE 2: Job target + match ──────────────────────────────
  await page.getByRole("link", { name: "Job Matcher" }).click();
  await page.waitForURL("**/job-matcher", { timeout: 30000 });
  await page.locator("textarea").first().waitFor({ timeout: 30000 });
  await page.locator("textarea").first().fill(JOB_DESCRIPTION);
  await page.getByRole("button", { name: "Analyze Job" }).click();
  await page.getByText("Job description analyzed successfully").waitFor({ timeout: 120000 });
  const jobText = await page.locator("body").innerText();
  log("S2-job", "JobTarget generated", jobText.includes("AI / Full-Stack Developer Intern"), "title visible");
  log("S2-job", "Company extracted", jobText.includes("TechNova Solutions"));
  log("S2-job", "Internship badge", /internship/i.test(jobText));
  const reqSkillsMatch = jobText.match(/required skills \((\d+)\)/i);
  const reqTechMatch = jobText.match(/required technologies \((\d+)\)/i);
  log("S2-job", "Required skills extracted", !!reqSkillsMatch, `count=${reqSkillsMatch?.[1]}`);
  log("S2-job", "Required technologies extracted", !!reqTechMatch, `count=${reqTechMatch?.[1]}`);
  await shot("02-job-target");

  await page.getByRole("button", { name: "Analyze My Match" }).click();
  await page.getByText("Match analysis complete").waitFor({ timeout: 120000 });
  const matchText = await page.locator("body").innerText();
  const scoreMatches = [...matchText.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
  const overall = scoreMatches[0];
  const summaryMatch = matchText.match(/(\d+) of (\d+) requirements matched/);
  log("S2-match", "Match analysis generated", overall !== undefined, `overall=${overall}%`);
  log("S2-match", "Requirements summary present", !!summaryMatch, summaryMatch?.[0]);
  log("S2-match", "Score within 0-100", overall >= 0 && overall <= 100, `score=${overall}`);
  // Gap groups render conditionally (Critical/Important/Nice to Have headings
  // only appear for buckets with entries) — require the section plus at least
  // one populated group, not every bucket.
  log("S2-match", "Skill gap sections present", matchText.includes("Skill Gap Analysis") && (/critical \(/i.test(matchText) || /important \(/i.test(matchText) || /nice to have \(/i.test(matchText)));
  log("S2-match", "Strengths & recommendations present", matchText.includes("Strengths") && matchText.includes("Recommendations"));
  await shot("03-match");

  // Refresh → restored job + analysis
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Showing your most recently analyzed job").waitFor({ timeout: 60000 });
  await page.getByText("Showing your most recent match analysis").waitFor({ timeout: 60000 });
  const refreshedMatchText = await page.locator("body").innerText();
  const refreshedOverall = [...refreshedMatchText.matchAll(/(\d+)%/g)].map((m) => Number(m[1]))[0];
  log("S2-refresh", "Job target + analysis restored after refresh (no re-analysis)", true, "restore banners visible");
  log("S2-refresh", "Score identical after refresh", refreshedOverall === overall, `before=${overall}% after=${refreshedOverall}%`);
  await shot("04-match-restored");

  // ── STAGE 3: Rewrite ─────────────────────────────────────────
  await page.getByRole("link", { name: "Resume Rewrite" }).click();
  await page.waitForURL("**/resume", { timeout: 30000 });
  // Groq's free tier enforces a rolling tokens-per-minute limit (~8K). Three
  // large calls back-to-back can exhaust it — empirically the rewriter 429s
  // when it follows the job analyzer too quickly. Pause so the previous
  // call's usage leaves the window before the largest call of the journey.
  await page.waitForTimeout(65000);
  await page.getByRole("button", { name: "Generate Rewrite Suggestions" }).click();
  // Wait for the real completion signal (Accept buttons), NOT the section
  // heading — Playwright's substring match hits the loading text "Generating
  // rewrite suggestions…" immediately. Groq free-tier latency for the rewriter
  // can exceed 60s (a failed evidence validation adds a second AI call), so
  // allow up to 3 minutes.
  await page.getByRole("button", { name: /^Accept$/ }).first().waitFor({ timeout: 180000 });
  const rewriteText = await page.locator("body").innerText();
  const suggestionCount = await page.getByRole("button", { name: /^Accept$/ }).count();
  log("S3-rewrite", "Rewrite suggestions generated", suggestionCount > 0, `suggestions=${suggestionCount}`);
  log("S3-rewrite", "Job context shown in header", rewriteText.includes("AI / Full-Stack Developer Intern") && /%\s*match|match/.test(rewriteText));

  // Hallucination check: collect all suggested texts
  const suggestedTexts = await page.locator("body").getByText(/./, { exact: false }).allInnerTexts().catch(() => []);
  const fullText = suggestedTexts.join("\n") + "\n" + rewriteText;
  const bannedPhrases = [
    /experienced? (?:in|with) Docker/i,
    /experienced? (?:in|with) AWS/i,
    /proficient (?:in|with) Docker/i,
    /proficient (?:in|with) AWS/i,
    /hands-on experience with (?:Docker|AWS|FastAPI|PostgreSQL|TypeScript|CI\/CD)/i,
    /\b(?:built|deployed|containerized|orchestrated) (?:with |using )?(?:Docker|Kubernetes|AWS|FastAPI|PostgreSQL)/i,
    /(?:professional|industrial|work) experience (?:with|in) (?:Docker|AWS|FastAPI|PostgreSQL)/i,
  ];
  const violations = bannedPhrases.filter((rx) => rx.test(fullText));
  log("S3-hallucination", "No suggestions claim missing skills (Docker/AWS/FastAPI/PostgreSQL/TS/CI-CD)", violations.length === 0, violations.length ? `VIOLATIONS: ${violations.map((v) => v.source).join("; ")}` : "clean");
  await shot("05-rewrite");

  // Accept first, reject second
  const acceptButtons = page.getByRole("button", { name: /^Accept$/ });
  await acceptButtons.first().click();
  await page.getByRole("button", { name: /^Reject$/ }).first().click();
  await page.waitForTimeout(500);
  const counterText = await page.locator("body").innerText();
  const counterMatch = counterText.match(/(\d+) accepted · (\d+) rejected · (\d+) pending/);
  log("S3-review", "Accept/reject updates counter", !!counterMatch, counterMatch ? counterMatch[0] : "counter not found");
  await shot("06-rewrite-reviewed");

  // Refresh → restored suggestions
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Showing your most recently generated suggestions").waitFor({ timeout: 60000 });
  const restoredCount = await page.getByRole("button", { name: /^Accept$/ }).count();
  log("S3-refresh", "Rewrite suggestions restored after refresh (no regeneration)", restoredCount === suggestionCount, `before=${suggestionCount} after=${restoredCount}`);
  await shot("07-rewrite-restored");

  // ── STAGE 4: Skill bridge ────────────────────────────────────
  await page.getByRole("link", { name: "Skill Bridge" }).click();
  await page.waitForURL("**/skill-bridge", { timeout: 30000 });
  // Same free-tier pacing as the rewrite stage: let the rewriter's usage
  // clear the tokens-per-minute window before the 7-day plan call.
  await page.waitForTimeout(65000);
  await page.getByRole("button", { name: "Generate My 7-Day Plan" }).click();
  await page.getByText(/Day 7:/).waitFor({ timeout: 180000 });
  const dayCount = await page.getByText(/^Day \d+:/).count();
  log("S4-bridge", "Exactly 7 day cards", dayCount === 7, `days=${dayCount}`);
  const bridgeText = await page.locator("body").innerText();
  const day1Match = bridgeText.match(/Day 1: ([^\n]+)/);
  log("S4-bridge", "Day 1 task present", !!day1Match, day1Match?.[1]?.slice(0, 80));
  const gapKeywords = ["Docker", "AWS", "FastAPI", "PostgreSQL", "TypeScript", "CI/CD", "CI"];
  const targetsGaps = gapKeywords.some((k) => bridgeText.includes(k));
  log("S4-bridge", "Tasks target actual priority gaps", targetsGaps);
  await shot("08-skill-bridge");

  // Complete Day 1
  const day1Card = page.locator("div", { hasText: /^Day 1:/ }).filter({ has: page.getByRole("button", { name: "Mark Complete" }) }).first();
  await day1Card.getByRole("button", { name: "Mark Complete" }).click();
  await page.getByRole("button", { name: "Reopen" }).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  const afterCompleteText = await page.locator("body").innerText();
  const progressMatch = afterCompleteText.match(/(\d+)\s*of\s*7|(\d+)%/);
  log("S4-bridge", "Day 1 marked complete", true, `progress≈${progressMatch?.[0]}`);
  await shot("09-day1-complete");

  // Refresh → completion persists
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Reopen" }).first().waitFor({ timeout: 60000 });
  const persistedDays = await page.getByText(/Day \d+:/).count();
  log("S4-refresh", "Day 1 completion persists after refresh", true, `days still=${persistedDays}`);
  await shot("10-bridge-restored");

  // ── STAGE 5: Dashboard ───────────────────────────────────────
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await page.getByText("Match Score").first().waitFor({ timeout: 60000 });
  const dashText = await page.locator("body").innerText();
  const dashScore = Number((dashText.match(/(\d+)%/) || [])[1]);
  log("S5-dashboard", "Dashboard renders full state", dashText.includes("AI / Full-Stack Developer Intern"));
  log("S5-dashboard", "Match % consistent with analysis", dashScore === overall, `dashboard=${dashScore}% analysis=${overall}%`);
  const skillsMetric = dashText.match(/(\d+)\s*\/\s*(\d+)\s*(?:Skills|skills)/);
  log("S5-dashboard", "Skills metric present", !!skillsMetric, skillsMetric?.[0]);
  const bridgeMetric = dashText.match(/(\d)\s*\/\s*7/);
  log("S5-dashboard", "Skill bridge shows 1/7 after Day 1", bridgeMetric?.[1] === "1", bridgeMetric?.[0]);
  const rewriteMetric = dashText.match(/(\d+) evidence-validated suggestions?/);
  log("S5-dashboard", "Rewrite count matches generated", rewriteMetric && Number(rewriteMetric[1]) === suggestionCount, rewriteMetric?.[0]);
  log("S5-dashboard", "Next step banner present", /recommended next step/i.test(dashText));
  log("S5-dashboard", "Answers WHERE AM I / WHAT IS MISSING / WHAT NEXT", /skill gaps/i.test(dashText) && /skill bridge/i.test(dashText) && /next/i.test(dashText));
  await shot("11-dashboard");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Match Score").first().waitFor({ timeout: 60000 });
  const dashAfter = (await page.locator("body").innerText()).slice(0, 2000);
  const dashScoreAfter = Number((dashAfter.match(/(\d+)%/) || [])[1]);
  log("S5-refresh", "Dashboard identical after refresh", dashScoreAfter === dashScore, `before=${dashScore}% after=${dashScoreAfter}%`);

  // ── STAGE 6: Navigation ──────────────────────────────────────
  await page.goBack().catch(() => {});
  await page.goBack().catch(() => {});
  await page.goForward().catch(() => {});
  await page.goForward().catch(() => {});
  await page.waitForTimeout(1500);
  const navOk =
    !(await page.getByText("Application error").count()) &&
    !(await page.getByText("404").count());
  log("S6-nav", "Back/forward navigation without errors", navOk, `url=${page.url()}`);
  await page.goto(`${BASE}/skill-bridge`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Day 7:/).waitFor({ timeout: 60000 });
  log("S6-nav", "Direct URL to /skill-bridge restores plan", true);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByText("Match Score").first().waitFor({ timeout: 60000 });
  log("S6-nav", "Direct URL to /dashboard restores full state", true);

  // ── STAGE 7: Responsive ──────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByText("Match Score").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1000);
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  log("S7-responsive", "No horizontal overflow at 390px on dashboard", !overflowX, `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)} clientWidth=${await page.evaluate(() => document.documentElement.clientWidth)}`);
  await shot("12-dashboard-mobile");
  await page.setViewportSize({ width: 1280, height: 800 });

  // Cookie check — anonymous session cookie exists, no auth cookies forced
  const cookies = await context.cookies();
  const anonCookie = cookies.find((c) => c.name === "s2c_anon_session");
  log("S6-anon", "Anonymous session cookie maintained", !!anonCookie, anonCookie ? `cookie set, httpOnly=${anonCookie.httpOnly}` : "MISSING");
  log("S6-anon", "No login wall encountered during journey", true, "all stages completed without auth");
} catch (err) {
  log("FATAL", "Journey aborted", false, err.message.slice(0, 400));
  await shot("fatal").catch(() => {});
} finally {
  await browser.close();
}

console.log("\n=== CONSOLE ERRORS (app-level, middleware warning excluded) ===");
console.log(consoleErrors.length ? consoleErrors.join("\n---\n") : "NONE");
const failed = results.filter((r) => !r.pass);
console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} checks passed ===`);
if (failed.length) {
  console.log("FAILED CHECKS:");
  failed.forEach((f) => console.log(` - [${f.stage}] ${f.check}: ${f.detail}`));
}
