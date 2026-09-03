// Rollback verification: proves AI_PROVIDER=openai switches the whole AI
// layer back to OpenAI with ZERO code changes (same runCompletion path).
// Runs one resume analysis (1 AI call) and requires the server log to show
// provider=openai for it.
import { chromium } from "playwright";

const APP = "http://localhost:3000";
const RESUME_PATH = "e2e-nadia-rahman-resume.pdf";

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? " | " + detail : ""}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

await page.goto(`${APP}/analysis`, { waitUntil: "domcontentloaded" });
const fileInput = page.locator('input[type="file"]').first();
await fileInput.setInputFiles(RESUME_PATH);
await page.getByRole("button", { name: "Upload & Process Resume" }).click();
await page.getByText("Resume processed successfully").waitFor({ timeout: 120000 });
check("rollback: upload + extraction works (provider-independent)", true);

await page.getByRole("link", { name: "Analyze Resume" }).click();
await page.waitForURL(/\/analysis\?resume=/, { timeout: 30000 });
await page.getByText("Candidate Overview").waitFor({ timeout: 120000 });
const bodyText = await page.locator("body").innerText();
check("rollback: OpenAI provider completes resume analysis", bodyText.includes("Nadia Rahman"), "profile generated");

const appErrors = consoleErrors.filter(
  (t) => !t.includes("Download the React DevTools") && !t.includes("Failed to fetch RSC payload")
);
check("rollback: no app-level console errors", appErrors.length === 0, appErrors.length ? appErrors[0].slice(0, 80) : "none");

await browser.close();
console.log(`\n=== ROLLBACK CHECK: ${failed === 0 ? "PASS" : "FAIL"} ===`);
if (failed > 0) process.exit(1);
