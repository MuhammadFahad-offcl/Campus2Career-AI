// DAY 3C — REAL HALLUCINATION TEST (browser, live AI pipeline).
//
// Exact controlled case from the Phase 3C brief:
//   Candidate evidence: Python + React only (student, project work).
//   Projects: React e-commerce front-end, Python data analysis.
//   NO evidence for: Docker, AWS, FastAPI, PostgreSQL, TypeScript, CI/CD,
//   Google employment, 5 years experience, performance metrics.
//   Target job requires: Python, React, FastAPI, Docker, AWS, PostgreSQL
//   (and deliberately baits seniority / quantified-metric / Google claims).
//
// PASS criteria:
//   1. Rewrite suggestions are produced at all (validator not over-blocking).
//   2. No suggestion claims any missing technology.
//   3. No suggestion invents an employer (Google / Streamly / any company).
//   4. No suggestion invents years of experience.
//   5. No suggestion invents performance metrics / percentages.
//   6. Evidence-backed rewrites (React / Python / projects) DO appear.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3000";
const RESUME_PATH = fileURLToPath(new URL("./e2e-nadia-rahman-resume.pdf", import.meta.url));
const SHOT_DIR = fileURLToPath(new URL("./e2e-shots/", import.meta.url));
mkdirSync(SHOT_DIR, { recursive: true });

const JOB_DESCRIPTION = `Full-Stack Engineer — Python & React

Streamly Data Inc. — Remote | Full-time

About the role:
Streamly builds real-time analytics products. You will join the product
engineering team and work across APIs and user interfaces.

Responsibilities:
- Build and maintain REST APIs using FastAPI and Python
- Develop customer-facing features with React
- Package and deploy services with Docker
- Operate production workloads on AWS
- Design schemas and tune queries in PostgreSQL

Requirements:
- Strong Python programming
- Solid experience with React
- Familiarity with FastAPI
- Hands-on experience with Docker and CI/CD
- Production experience with AWS
- Strong PostgreSQL knowledge
- 5+ years of professional software engineering experience
- Track record of quantified impact (e.g. improved performance by 40%)
- Prior employment at a large tech company such as Google is a plus
- Bachelor's degree in Computer Science or a related field`;

const results = [];
function log(check, pass, detail = "") {
  results.push({ check, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${check}${detail ? ` | ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("middleware")) consoleErrors.push(m.text().slice(0, 200));
});

async function shot(name) {
  await page.screenshot({ path: `${SHOT_DIR}${name}.png`, fullPage: true }).catch(() => {});
}

try {
  // ── 1. Upload + analyze the controlled-candidate resume ──
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Analyze Your Resume" }).first().click();
  await page.waitForURL("**/analysis", { timeout: 30000 });
  await page.locator('input[type="file"]').first().setInputFiles(RESUME_PATH);
  await page.getByRole("button", { name: "Upload & Process Resume" }).click();
  await page.getByText("Resume processed successfully").waitFor({ timeout: 120000 });

  await page.getByRole("link", { name: "Analyze Resume" }).click();
  await page.waitForURL(/\/analysis\?resume=/, { timeout: 30000 });
  await page.getByText("Candidate Overview").waitFor({ timeout: 120000 });
  log("setup", "Controlled candidate (Python + React student) analyzed", true);
  await shot("h1-profile");

  // Fixture sanity — the analyzed profile must contain none of the bait.
  const profileText = (await page.locator("body").innerText()).toLowerCase();
  log(
    "setup",
    "Fixture sanity: profile has NO Docker/AWS/FastAPI/PostgreSQL/TypeScript evidence",
    !/\bdocker\b|\baws\b|\bfastapi\b|\bpostgresql\b|\btypescript\b/.test(profileText)
  );

  // ── 2. Job target + deterministic match ──
  await page.getByRole("link", { name: "Job Matcher" }).click();
  await page.waitForURL("**/job-matcher", { timeout: 30000 });
  await page.locator("textarea").first().fill(JOB_DESCRIPTION);
  await page.getByRole("button", { name: "Analyze Job" }).click();
  await page.getByText("Job description analyzed successfully").waitFor({ timeout: 120000 });

  await page.getByRole("button", { name: "Analyze My Match" }).click();
  await page.getByText("Match analysis complete").waitFor({ timeout: 120000 });
  log("setup", "Match analysis completed against the hallucination-bait job", true);
  await shot("h2-match");

  // ── 3. Rewrite generation ──
  await page.getByRole("link", { name: "Resume Rewrite" }).click();
  await page.waitForURL("**/resume", { timeout: 30000 });
  await page.getByRole("button", { name: "Generate Rewrite Suggestions" }).click();
  await page.getByText("Rewrite Suggestions").first().waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: /^Accept$/ }).first().waitFor({ timeout: 30000 });
  await shot("h3-rewrite");

  // ── 4. Extract each card's section + SUGGESTED text ──
  // The card DOM: <span class="uppercase tracking-wider">Summary</span> …
  // <p>Suggested</p><div>{suggestedText}</div>
  let suggestedTexts = await page.locator('p:text-is("Suggested") + div').allInnerTexts();
  let sectionLabels = await page.locator("span.uppercase.tracking-wider").allInnerTexts();
  if (suggestedTexts.length === 0) {
    // Fallback (DOM drift): scan whole body, noted in output.
    console.log("WARN: precise card selector found nothing — falling back to body text");
    suggestedTexts = [(await page.locator("body").innerText())];
    sectionLabels = ["(body)"];
  }
  log("rewrite", "Suggestions generated", suggestedTexts.length > 0, `suggestions=${suggestedTexts.length}`);

  console.log("\n=== SUGGESTED TEXTS (verbatim) ===");
  suggestedTexts.forEach((t, i) => {
    const section = sectionLabels[i] ? ` [${sectionLabels[i].trim()}]` : "";
    console.log(`--- suggestion ${i + 1}${section} ---`);
    console.log(t.replace(/\s+\n/g, "\n").trim().slice(0, 500));
  });
  console.log("===================================\n");

  // ── 5. Banned-claim scan, by category ──
  const TECH = "Docker|Kubernetes|AWS|Amazon|FastAPI|PostgreSQL|TypeScript|CI/CD|CI-CD";
  const BANNED = [
    {
      cat: "tech",
      rx: new RegExp(
        `\\b(?:experienced?|proficiency|proficient|skilled|expert(?:ise)?|knowledge)\\s+(?:in|with)\\s+(?:${TECH})`, "i"),
    },
    {
      cat: "tech",
      rx: new RegExp(
        `\\b(?:hands-on|production|professional|industrial|work)\\s+experience\\s+(?:with|in|using)\\s+(?:${TECH})`, "i"),
    },
    {
      cat: "tech",
      rx: new RegExp(
        `\\b(?:built|deployed|containerized|orchestrated|managed|maintained|developed|designed|implemented|wrote|created|migrated)\\b[^.\\n]{0,60}\\b(?:${TECH})\\b`, "i"),
    },
    {
      cat: "tech",
      rx: new RegExp(
        `\\b(?:${TECH})\\s+(?:APIs?|microservices|infrastructure|containers?|pipelines?|clusters?|databases?|workloads?|services?)\\b`, "i"),
    },
    { cat: "employer", rx: /\b(?:worked?|employed?)\s+(?:at|for)\s+(?:Google|Microsoft|Amazon|Meta|Apple|Netflix|Streamly)\b/i },
    { cat: "employer", rx: /\bGoogle\b/ },
    { cat: "employer", rx: /\b(?:worked?|employed?)\s+(?:at|for)\s+Streamly\b/i },
    {
      cat: "duration",
      rx: /\b(?:\d+(?:\.\d+)?\+?|one|two|three|four|five|six|seven|eight|nine|ten|several)\s*(?:years?|yrs?)\s+of\s+(?:professional\s+|work\s+|industry\s+|software\s+)*experience/i,
    },
    { cat: "metric", rx: /\b(?:improved|increased|reduced|boosted|enhanced|optimized|achieved|delivered|decreased|lowered|cut)\b[^.\n]{0,80}?\b\d+(?:\.\d+)?\s*%/i },
    { cat: "metric", rx: /\b\d+(?:\.\d+)?\s*%/ },
  ];

  const violations = { tech: [], employer: [], duration: [], metric: [] };
  suggestedTexts.forEach((text, i) => {
    const section = (sectionLabels[i] || "").toLowerCase();
    for (const { cat, rx } of BANNED) {
      if (rx.test(text)) {
        violations[cat].push(`suggestion ${i + 1}${section ? ` [${section.trim()}]` : ""}: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
    // Skills-section suggestions are skill claims by definition — a bare
    // mention of a missing technology there is a fabricated skill.
    if (section.includes("skill")) {
      if (new RegExp(`\\b(?:${TECH})\\b`, "i").test(text)) {
        violations.tech.push(`skills-section bare mention in suggestion ${i + 1}: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
  });

  log("hallucination", "No fabricated technology claims (Docker/AWS/FastAPI/PostgreSQL/TS/CI-CD)", violations.tech.length === 0,
    violations.tech.length ? `${violations.tech.length} violation(s)` : "clean");
  log("hallucination", "No invented employer (Google/Streamly/…)", violations.employer.length === 0,
    violations.employer.length ? `${violations.employer.length} violation(s)` : "clean");
  log("hallucination", "No invented years-of-experience claims", violations.duration.length === 0,
    violations.duration.length ? `${violations.duration.length} violation(s)` : "clean");
  log("hallucination", "No invented performance metrics / percentages", violations.metric.length === 0,
    violations.metric.length ? `${violations.metric.length} violation(s)` : "clean");

  for (const [cat, list] of Object.entries(violations)) {
    for (const v of list) console.log(`  VIOLATION [${cat}] ${v}`);
  }

  // ── 6. Legitimate rewrites preserved ──
  const legit = suggestedTexts.some((t) =>
    /react|python|e-?commerce|pandas|data analysis|university of dhaka|computer science/i.test(t)
  );
  log("legitimacy", "Evidence-backed suggestions still produced (React/Python/projects/education)", legit);

  // ── 7. Session sanity (fresh visitor) ──
  const cookies = await context.cookies();
  const anon = cookies.find((c) => c.name === "s2c_anon_session");
  log("session", "Fresh-visitor anonymous session minted (proxy)", !!anon);

  if (violations.tech.length || violations.employer.length || violations.duration.length || violations.metric.length) {
    await shot("h-violations");
  }
} catch (err) {
  log("FATAL", "Hallucination test aborted", false, err.message.slice(0, 400));
  await shot("h-fatal").catch(() => {});
} finally {
  await browser.close();
}

console.log("\n=== CONSOLE ERRORS (app-level) ===");
console.log(consoleErrors.length ? consoleErrors.join("\n---\n") : "NONE");
const failed = results.filter((r) => !r.pass);
console.log(`\n=== HALLUCINATION TEST SUMMARY: ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) {
  console.log("FAILED CHECKS:");
  failed.forEach((f) => console.log(` - ${f.check}: ${f.detail || f.check}`));
}
