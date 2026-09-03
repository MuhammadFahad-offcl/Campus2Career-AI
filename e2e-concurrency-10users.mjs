// E2E concurrency load test — 10 simultaneous anonymous users run the full
// journey (upload → AI profile → job analysis → match → rewrite → skill
// bridge → dashboard) against the running production build.
//
// Target from the pre-launch hardening brief:
//   10 users → same app → concurrent requests →
//   no crash, no data leakage, no corrupted state,
//   no duplicate generation, no unhandled fatal errors.
//
// Each user uploads a DISTINCT resume (unique name/email/phone) and pastes
// the SAME job description — this also stress-tests the owner-scoped
// JobTarget reuse lookup under concurrency (10 sessions, identical
// description: every session must still get its own row, never another
// session's).
//
// After the journeys, DB integrity is verified with the service-role key:
// exactly 1 resume / 1 job_target / 1 analysis / 1 rewrite / 1 skill_bridge
// per session, each profile paired with the correct owner's name, no
// duplicates, no cross-session rows, no user_id set.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3000";
const USER_COUNT = 10;
const STAGGER_MS = 2000;

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

// ─────────────────────────────────────────────
// Distinct resume fixtures — same hand-rolled PDF builder as
// make-test-resume.mjs, parameterized per user (unique name/email/phone so
// any cross-session leakage is visible in the UI and verifiable in the DB).
// ─────────────────────────────────────────────
function buildResumePdf(user) {
  const lines = [
    user.name,
    "Computer Science Student",
    `Email: ${user.email} | Phone: +880 1700 000${user.num} | Location: Dhaka, Bangladesh`,
    "",
    "EDUCATION",
    "BSc in Computer Science and Engineering, University of Dhaka, Dhaka, Bangladesh",
    "Expected graduation: May 2027 | GPA: 3.78 / 4.00",
    "",
    "TECHNICAL SKILLS",
    "Programming languages: Python, JavaScript, C",
    "Libraries and frameworks: React, pandas, NumPy, matplotlib",
    "Tools: Git, GitHub, VS Code, Jupyter Notebook, Figma",
    "",
    "PROJECTS",
    `Study App ${user.num} - React Frontend (January 2026 - March 2026)`,
    "- Built a responsive front-end with React featuring dynamic content views.",
    "- Implemented component state with React hooks and client-side routing.",
    "",
    `Sales Data Study ${user.num} (September 2025 - December 2025)`,
    "- Analyzed a dataset using Python and pandas.",
    "- Cleaned missing values and visualized trends with matplotlib.",
    "",
    "ACHIEVEMENTS",
    "Dean's List, Fall 2025 semester",
    "",
    "LANGUAGES",
    "English (fluent), Bengali (native)",
  ];

  let content = "BT\n/F1 10 Tf\n13 TL\n72 740 Td\n";
  for (const line of lines) {
    const escaped = line
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
    content += `(${escaped}) Tj\nT*\n`;
  }
  content += "ET\n";

  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    null,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    if (i === 3) {
      pdf += `4 0 obj<</Length ${Buffer.byteLength(content)}>>\nstream\n${content}endstream\nendobj\n`;
    } else {
      pdf += `${i + 1} 0 obj${objects[i]}endobj\n`;
    }
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<</Root 1 0 R/Size ${objects.length + 1}>>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

const users = Array.from({ length: USER_COUNT }, (_, i) => {
  const num = String(i + 1).padStart(2, "0");
  return {
    num,
    name: `Load User ${num}`,
    email: `load.user${num}@example.com`,
    pdfPath: fileURLToPath(new URL(`./e2e-load-u${num}.pdf`, import.meta.url)),
    sessionId: null,
    resumeId: null,
    ok: false,
    error: null,
    durationMs: null,
  };
});

const report = {
  checks: [],
  pageErrors: [],
  http5xx: [],
  consoleErrors: [],
  check(user, name, pass, detail = "") {
    this.checks.push({ user, name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"} | ${user} | ${name}${detail ? ` | ${detail}` : ""}`);
  },
};

/** Regex matching every OTHER user's name — any hit = cross-session leakage. */
function otherUsersPattern(user) {
  const others = users.filter((u) => u.num !== user.num).map((u) => u.name.replace(/ /g, "\\s+"));
  return new RegExp(others.join("|"), "i");
}

async function runUser(browser, user) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on("pageerror", (err) => report.pageErrors.push(`u${user.num}: ${err.message.slice(0, 200)}`));
  page.on("response", (res) => {
    if (res.status() >= 500) report.http5xx.push(`u${user.num}: ${res.status()} ${res.url().slice(0, 120)}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("middleware")) {
      report.consoleErrors.push(`u${user.num}: ${m.text().slice(0, 200)}`);
    }
  });

  const started = Date.now();
  try {
    // ── 1. Upload + AI profile analysis ──
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "Analyze Your Resume" }).first().click();
    await page.waitForURL("**/analysis", { timeout: 30000 });
    await page.locator('input[type="file"]').first().setInputFiles(user.pdfPath);
    await page.getByRole("button", { name: "Upload & Process Resume" }).click();
    await page.getByText("Resume processed successfully").waitFor({ timeout: 120000 });

    await page.getByRole("link", { name: "Analyze Resume" }).click();
    await page.waitForURL(/\/analysis\?resume=/, { timeout: 30000 });
    await page.getByText("Candidate Overview").waitFor({ timeout: 120000 });
    user.resumeId = new URL(page.url()).searchParams.get("resume");

    const profileText = await page.locator("body").innerText();
    report.check(`u${user.num}`, "Profile generated with OWN name", profileText.includes(user.name), user.name);
    report.check(`u${user.num}`, "Profile page shows NO other user's name", !otherUsersPattern(user).test(profileText), "isolation");

    // ── 2. Job analysis + deterministic match ──
    await page.getByRole("link", { name: "Job Matcher" }).click();
    await page.waitForURL("**/job-matcher", { timeout: 30000 });
    await page.locator("textarea").first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(2000); // let the mount restore effect settle
    const matcherText = await page.locator("body").innerText();
    report.check(`u${user.num}`, "No restored job from another session", !matcherText.includes("Showing your most recently analyzed job"), "isolation");
    const textareaValue = await page.locator("textarea").first().inputValue();
    report.check(`u${user.num}`, "Job matcher textarea empty", textareaValue === "", `len=${textareaValue.length}`);

    await page.locator("textarea").first().fill(JOB_DESCRIPTION);
    await page.getByRole("button", { name: "Analyze Job" }).click();
    await page.getByText("Job description analyzed successfully").waitFor({ timeout: 120000 });

    await page.getByRole("button", { name: "Analyze My Match" }).click();
    await page.getByText("Match analysis complete").waitFor({ timeout: 120000 });
    const matchText = await page.locator("body").innerText();
    const score = Number((matchText.match(/(\d+)%/) || [])[1]);
    report.check(`u${user.num}`, "Match score computed (0-100)", Number.isFinite(score) && score >= 0 && score <= 100, `score=${score}%`);

    // ── 3. Rewrite ──
    await page.getByRole("link", { name: "Resume Rewrite" }).click();
    await page.waitForURL("**/resume", { timeout: 30000 });
    await page.getByRole("button", { name: "Generate Rewrite Suggestions" }).click();
    await page.getByRole("button", { name: /^Accept$/ }).first().waitFor({ timeout: 120000 });
    const suggestionCount = await page.getByRole("button", { name: /^Accept$/ }).count();
    report.check(`u${user.num}`, "Rewrite suggestions generated", suggestionCount > 0, `suggestions=${suggestionCount}`);

    // ── 4. Skill bridge ──
    await page.getByRole("link", { name: "Skill Bridge" }).click();
    await page.waitForURL("**/skill-bridge", { timeout: 30000 });
    await page.getByRole("button", { name: "Generate My 7-Day Plan" }).click();
    await page.getByText(/Day 7:/).waitFor({ timeout: 120000 });
    const dayCount = await page.getByText(/^Day \d+:/).count();
    report.check(`u${user.num}`, "Skill bridge: exactly 7 days", dayCount === 7, `days=${dayCount}`);

    // ── 5. Dashboard ──
    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.waitForURL("**/dashboard", { timeout: 30000 });
    await page.getByText("Match Score").first().waitFor({ timeout: 60000 });
    const dashText = await page.locator("body").innerText();
    report.check(`u${user.num}`, "Dashboard full state rendered", /skill gaps/i.test(dashText) && /next/i.test(dashText));
    report.check(`u${user.num}`, "Dashboard shows NO other user's name", !otherUsersPattern(user).test(dashText), "isolation");

    const cookies = await context.cookies();
    user.sessionId = cookies.find((c) => c.name === "s2c_anon_session")?.value ?? null;
    user.ok = true;
  } catch (err) {
    user.ok = false;
    user.error = String(err?.message ?? err).slice(0, 300);
    report.check(`u${user.num}`, "Journey completed without errors", false, user.error);
    try {
      const cookies = await context.cookies();
      user.sessionId = cookies.find((c) => c.name === "s2c_anon_session")?.value ?? null;
    } catch {
      // context already closed
    }
  } finally {
    user.durationMs = Date.now() - started;
    await context.close().catch(() => {});
  }
}

// ─────────────────────────────────────────────
// Generate fixtures + run all journeys (staggered starts)
// ─────────────────────────────────────────────
for (const user of users) {
  writeFileSync(user.pdfPath, buildResumePdf(user), "utf-8");
}

const browser = await chromium.launch({ headless: true });
const overallStart = Date.now();
try {
  await Promise.all(
    users.map((user, i) => (async () => {
      await new Promise((resolve) => setTimeout(resolve, i * STAGGER_MS));
      await runUser(browser, user);
    })())
  );
} finally {
  await browser.close().catch(() => {});
}
const totalMs = Date.now() - overallStart;

console.log("\n=== PER-USER RESULT ===");
for (const user of users) {
  console.log(
    `u${user.num} ${user.ok ? "OK  " : "FAIL"} ${((user.durationMs ?? 0) / 1000).toFixed(1)}s` +
      ` name=${user.name}${user.error ? ` error=${user.error}` : ""}`
  );
}

// ─────────────────────────────────────────────
// Global health checks
// ─────────────────────────────────────────────
report.check("global", `All ${USER_COUNT} users completed the full journey`, users.every((u) => u.ok), `ok=${users.filter((u) => u.ok).length}/${USER_COUNT}`);
report.check("global", "Zero HTTP 5xx responses across all users", report.http5xx.length === 0, report.http5xx.slice(0, 3).join(" | ") || "none");
report.check("global", "Zero uncaught page errors across all users", report.pageErrors.length === 0, report.pageErrors.slice(0, 3).join(" | ") || "none");

let alive = false;
try {
  const res = await fetch(BASE);
  alive = res.status === 200;
} catch {
  alive = false;
}
report.check("global", "Server still healthy after load (GET / → 200)", alive);

// ─────────────────────────────────────────────
// DB integrity (service role)
// ─────────────────────────────────────────────
const env = readFileSync(new URL("./.env.local", import.meta.url), "utf8");
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
};
const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));

const sessionIds = users.map((u) => u.sessionId).filter(Boolean);
const userBySession = new Map(users.filter((u) => u.sessionId).map((u) => [u.sessionId, u]));
report.check("db", `All ${USER_COUNT} anonymous session ids captured`, sessionIds.length === USER_COUNT, `captured=${sessionIds.length}`);

function countBySession(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.anonymous_session_id, (m.get(r.anonymous_session_id) ?? 0) + 1);
  return m;
}
const exactlyOnePerSession = (rows) =>
  rows.length === sessionIds.length && [...countBySession(rows).values()].every((v) => v === 1);

async function fetchRows(table, columns) {
  const { data, error } = await supabase.from(table).select(columns).in("anonymous_session_id", sessionIds);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

try {
  const rows = await fetchRows("resumes", "id, anonymous_session_id, extraction_status, analysis_status, candidate_profile, user_id");
  report.check("db", "resumes: exactly 1 row per session (no duplicates)", exactlyOnePerSession(rows), `rows=${rows.length}`);
  report.check(
    "db",
    "resumes: extraction + analysis completed for every session",
    rows.length === sessionIds.length &&
      rows.every((r) => r.extraction_status === "completed" && r.analysis_status === "completed" && r.candidate_profile != null),
    `${rows.filter((r) => r.extraction_status === "completed" && r.analysis_status === "completed").length}/${sessionIds.length} completed`
  );
  report.check(
    "db",
    "resumes: each profile pairs with the correct owner's name + UI resume id",
    rows.length === sessionIds.length &&
      rows.every((r) => {
        const u = userBySession.get(r.anonymous_session_id);
        return (
          u &&
          String(r.candidate_profile?.fullName ?? "").trim().toLowerCase() === u.name.toLowerCase() &&
          r.id === u.resumeId
        );
      }),
    "owner-name pairing verified"
  );
  report.check(
    "db",
    "resumes: no user_id set on anonymous rows",
    rows.every((r) => r.user_id == null),
    "anonymous owner scoping"
  );
} catch (err) {
  report.check("db", "resumes query", false, String(err?.message ?? err).slice(0, 200));
}

try {
  const rows = await fetchRows("job_targets", "id, anonymous_session_id, parsing_status, description, user_id");
  report.check("db", "job_targets: exactly 1 row per session (no duplicates)", exactlyOnePerSession(rows), `rows=${rows.length}`);
  report.check(
    "db",
    "job_targets: identical JD produced 10 owner-scoped rows (reuse never cross-matched)",
    rows.length === sessionIds.length &&
      rows.every((r) => r.parsing_status === "completed" && (r.description ?? "").trim() === JOB_DESCRIPTION.trim()),
    `${rows.length} rows`
  );
} catch (err) {
  report.check("db", "job_targets query", false, String(err?.message ?? err).slice(0, 200));
}

try {
  const rows = await fetchRows("analyses", "id, anonymous_session_id, score, user_id");
  report.check("db", "analyses: exactly 1 row per session (no duplicates)", exactlyOnePerSession(rows), `rows=${rows.length}`);
  report.check(
    "db",
    "analyses: numeric overall score persisted for every session",
    rows.length === sessionIds.length && rows.every((r) => typeof r.score?.overall === "number"),
    "score.overall present"
  );
} catch (err) {
  report.check("db", "analyses query", false, String(err?.message ?? err).slice(0, 200));
}

try {
  const rows = await fetchRows("rewrites", "id, anonymous_session_id, status, suggestions, user_id");
  report.check("db", "rewrites: exactly 1 row per session (no duplicate generation)", exactlyOnePerSession(rows), `rows=${rows.length}`);
  report.check(
    "db",
    "rewrites: completed with ≥1 suggestion for every session",
    rows.length === sessionIds.length &&
      rows.every((r) => r.status === "completed" && Array.isArray(r.suggestions) && r.suggestions.length > 0),
    "completed + suggestions present"
  );
} catch (err) {
  report.check("db", "rewrites query", false, String(err?.message ?? err).slice(0, 200));
}

try {
  const rows = await fetchRows("skill_bridges", "id, anonymous_session_id, days, user_id");
  report.check("db", "skill_bridges: exactly 1 row per session (no duplicate generation)", exactlyOnePerSession(rows), `rows=${rows.length}`);
  report.check(
    "db",
    "skill_bridges: 7-day plan persisted for every session",
    rows.length === sessionIds.length && rows.every((r) => Array.isArray(r.days) && r.days.length === 7),
    "7 days each"
  );
} catch (err) {
  report.check("db", "skill_bridges query", false, String(err?.message ?? err).slice(0, 200));
}

// ─────────────────────────────────────────────
// Final summary + fixture cleanup
// ─────────────────────────────────────────────
if (report.consoleErrors.length) {
  console.log(`\nConsole errors (informational, ${report.consoleErrors.length}):`);
  report.consoleErrors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
}

const failed = report.checks.filter((c) => !c.pass);
console.log(`\n=== 10-USER CONCURRENCY LOAD TEST: ${report.checks.length - failed.length}/${report.checks.length} checks passed ===`);
console.log(`Wall time: ${(totalMs / 1000).toFixed(1)}s for ${USER_COUNT} users (${STAGGER_MS}ms stagger, ~${USER_COUNT * 4} AI calls)`);
if (failed.length) {
  console.log("FAILED CHECKS:");
  failed.forEach((f) => console.log(` - [${f.user}] ${f.name}: ${f.detail}`));
}

for (const user of users) {
  try {
    rmSync(user.pdfPath);
  } catch {
    // fixture already gone
  }
}

// Exit non-zero only on failure — on success let Node tear down naturally
// (process.exit() races the Supabase client's closing sockets on Windows).
if (failed.length > 0) {
  process.exit(1);
}
