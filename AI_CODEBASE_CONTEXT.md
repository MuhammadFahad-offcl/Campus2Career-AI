# Campus2Career AI — AI Codebase Context

> **Purpose:** primary handoff for future engineering agents. It describes the current repository, not a desired architecture. When documents and code differ, code wins. Read the linked source before changing a high-risk area.

## 1. Product and current MVP

Campus2Career AI is a career-intelligence application for students, internship seekers, graduates, and early-career users. The implemented core journey is: upload a resume, extract it, create an evidence-aware candidate profile, parse a pasted job description, calculate a deterministic match, generate evidence-oriented rewrite suggestions and a 7-day skill plan, then summarize saved results on a dashboard.

**Implemented MVP:** resume PDF/DOCX ingestion; CandidateProfile analysis; JobTarget analysis; deterministic match/gaps; rewrite suggestions; SkillBridge plan/progress; dashboard aggregation.

**Not implemented / placeholders:** working account sign-in and registration, protected routes, settings persistence, templates, and a real My Resumes listing. See the route map.

## 2. Tech stack

Source: `package.json`.

| Area | Actual package/version or configuration |
|---|---|
| Framework | Next.js `16.3.2`, App Router, Server Actions |
| UI | React `19.2.8`, React DOM `19.2.8`, Tailwind CSS `^4`, shadcn `^4.19.0`, Base UI `^1.7.0`, Lucide React `^1.35.0` |
| Language | TypeScript `^5` |
| Data/auth/storage | `@supabase/supabase-js` `^2.112.4`, `@supabase/ssr` `^0.12.5` |
| AI | `openai` `^7.8.0` (SDK shared by both providers — Groq is OpenAI-compatible); primary model `openai/gpt-oss-20b` (Groq), rollback `gpt-4o-mini` (OpenAI) |
| Validation | Zod `^4.4.3` |
| Document parsing | `pdf-parse` `^2.4.5`, Mammoth `^1.12.2` |
| State | Zustand `^5.0.15` is installed; no current application usage was found. |
| Testing | Vitest `^4.1.11`; Playwright `^1.62.1` is installed and repository e2e `.mjs` scripts exist. |
| Deployment assumptions | `next build` uses Turbopack. Server Actions need Supabase and OpenAI environment variables. `next.config.ts` externalizes `pdf-parse` and sets Server Action upload body limit to 10 MB. |

`react-pdf` is **not** listed in `package.json`; do not describe it as implemented.

## 3. Repository structure

| Path | Purpose and key files |
|---|---|
| `app/` | Routes, layouts, error/loading pages, and all server actions under `app/actions/`. |
| `app/(dashboard)/` | Dashboard shell and feature routes: analysis, resume rewrite, job matcher, skill bridge, etc. |
| `app/(auth)/` | Presentational login/register placeholder routes. |
| `components/` | Client-side panels and shared/UI/layout components. Feature panels call Server Actions directly. |
| `lib/ai/` | Provider layer (`provider.ts`: Groq primary / OpenAI rollback + optional one-attempt fallback), four workflow services, prompts, profile cache, token metrics. |
| `lib/scoring/` | Pure deterministic matching engine and score labels. |
| `lib/document-processing/` | PDF/DOCX extraction and text cleaning. |
| `lib/supabase/` | Browser, SSR, and service-role clients plus configuration checks. |
| `lib/security/` | File-signature checks and in-memory rate limiter. |
| `lib/dashboard/`, `lib/rewrite/`, `lib/skill-bridge/` | Pure derivation/validation helpers. |
| `schemas/index.ts` and `types/domain.ts` | Runtime Zod contracts and shared domain types. These are core contracts. |
| `supabase/migrations/` | Seven SQL migrations, numbered `001`–`007`; apply in order. |
| `public/` | Static SVG assets only. |
| root `.mjs` scripts | E2E suite: `e2e-golden-journey`, `e2e-isolation`, `e2e-hallucination-test`, `e2e-jd-reuse`, `e2e-concurrency-10users`, `e2e-profile-output-audit`, plus the `make-test-resume` fixture generator; not package scripts. |
| tests | Tests are colocated with feature libraries/actions; there is no separate `tests/` directory. |

## 4. Golden user journey

| Step | Route/UI | Action/service | Data/persistence/AI |
|---|---|---|---|
| Landing | `/`, `app/page.tsx` | Navigation into dashboard journey | No AI or persistence. |
| Upload | `/analysis`, `ResumeUploader` / `UploadZone` | `uploadAndProcessResume` in `app/actions/upload-resume.ts` | File goes to private `resumes` storage and a `resumes` row. No AI. |
| Extraction | Same upload action | `extractText` → `extractPdfText` or `extractDocxText`, then `cleanExtractedText` | Saves `extracted_text`, page count and extraction status in `resumes`. |
| CandidateProfile | `/analysis`, `ResumeAnalysisPanel` | `analyzeResume` → `analyzeResumeText` | OpenAI creates profile; validated JSON is saved in `resumes.candidate_profile`. |
| Job description | `/job-matcher`, `JobAnalysisPanel` | `analyzeJob` → `analyzeJobDescriptionText` | OpenAI creates a normalized JobTarget; insert into `job_targets`. |
| Match | `/job-matcher`, `MatchResultsPanel` | `computeLatestMatch` / `computeMatchAction` → pure `computeMatch` | Saves a deterministic snapshot in `analyses`. No AI in scoring. |
| Rewrite | `/resume`, `RewritePanel` | `generateRewrite` → `rewriteResume` | OpenAI suggestions are validated and inserted in `rewrites`. Original resume is not overwritten. |
| Skill Bridge | `/skill-bridge`, `SkillBridgePanel` | `generateSkillBridgeAction` → `generateSkillBridge`; `updateDayStatusAction` | OpenAI seven-day plan upserts into `skill_bridges`; day status updates persist. |
| Dashboard | `/dashboard`, dashboard components | `getDashboardSummary` | Read-only aggregation of saved rows; deterministic; no AI. |

## 5. Domain model and canonical sources

### Resume — table `resumes`, primary key `id`

Defined in `supabase/migrations/001_create_resumes.sql`, extended in `002` and `003`. Key fields: owner (`user_id` or `anonymous_session_id`), `file_name`, `file_type`, `file_size`, `storage_path`, `extracted_text`, extraction state/error/page count, and CandidateProfile analysis state/model/timestamp. Created by `uploadAndProcessResume`; updated by that action and `analyzeResume`; read by all downstream flows.

### CandidateProfile — JSONB in `resumes.candidate_profile`, no separate table/id

Defined in `types/domain.ts` and `schemas/index.ts`. This is the canonical structured representation for a particular saved resume. `analyses.profile` is a snapshot copied at match time, not a second canonical profile. `analyzeResume` creates it; scoring, rewrite, SkillBridge, and dashboard read it.

### JobTarget — table `job_targets`, primary key `id`

Defined in `004_create_job_targets.sql`, type/schema in `types/domain.ts` / `schemas/index.ts`. It stores original `description`, parsed title/company/location/opportunity type, requirement arrays, parsing state/model/error, owner and timestamps. `analyzeJob` creates it; matching, rewrite, SkillBridge, and dashboard read it.

### Analysis — table `analyses`, primary key `id`

Defined in `005_create_analyses.sql`. Stores `resume_id`, `job_target_id`, owner, `profile` JSONB snapshot, `score`, `skill_gaps`, `strengths`, `weaknesses`, `recommendations`, and `analyzed_at`. Created by `computeMatchAction`; read by match restoration, rewrite, SkillBridge, dashboard. The SQL stores IDs but does not define foreign keys to related rows.

### Rewrite — table `rewrites`, primary key `id`

Defined in `006_create_rewrites.sql`. Stores `resume_id`, `job_target_id`, optional `analysis_id`, owner, `status`, JSONB `suggestions`, `model`, timestamps. Created by `generateRewrite`; restored by `getLatestRewrite`. User accept/reject/edit state is client-side review state; `getLatestRewrite` resets it to pending on a new visit.

### SkillBridge — table `skill_bridges`, primary key `id`

Defined in `007_create_skill_bridges.sql`. Stores required `resume_id`, `job_target_id`, `analysis_id`, owner, status, `priority_skills`, `days`, model and timestamps. `analysis_id` has a unique constraint, so generation upserts one active plan per analysis. Created/reused by SkillBridge actions; day status is updated by `updateDayStatusAction`.

### DashboardSummary — derived, not persisted

Defined in `types/domain.ts`; built by `getDashboardSummary` in `app/actions/dashboard.ts` using `lib/dashboard/summary-utils.ts`. It reads saved rows and derives readiness/next actions/metrics; it never invents metrics or runs AI.

## 6. Resume pipeline

1. `uploadAndProcessResume(file)` accepts only browser-declared PDF/DOCX MIME types, checks 5 MB maximum and zero bytes, then loads a buffer.
2. `assertMagicBytesMatch` in `lib/security/file-signatures.ts` verifies `%PDF-` for PDF or ZIP `PK` for DOCX. It verifies container type, not full DOCX structure.
3. The action resolves an authenticated owner or creates anonymous ownership, applies an upload rate limit, creates a UUID and storage path (`<userId>/<resumeId>/original` or `temporary/<anonymousSessionId>/<resumeId>/original`), and uploads to private Supabase Storage bucket `resumes`.
4. It inserts `resumes` with `extraction_status: uploaded`, marks it `processing`, calls `extractText`, then saves cleaned text/page count with `completed`; failures save `failed` plus an error.
5. PDF uses `PDFParse` in `lib/document-processing/pdf.ts`; its parser is always destroyed. DOCX uses Mammoth `extractRawText` in `docx.ts`. `cleanExtractedText` preserves section breaks but normalizes control chars and whitespace. Extraction rejects text shorter than 50 characters.
6. `analyzeResume` requires completed extracted text, rate-limits, marks analysis `analyzing`, invokes the AI service, and persists CandidateProfile/status/model/timestamp or failed state/error.

**Reuse:** `shouldReuseCandidateProfile` in `lib/ai/profile-cache.ts` reuses a completed profile only when `candidateProfileSchema.safeParse` succeeds and `force` is false.

**Historical PDF issue:** Day 1 log records `pdf.worker.mjs` failing to resolve in Next server bundling. Current code uses server-only `PDFParse`, destroys the parser, and `next.config.ts` lists `serverExternalPackages: ["pdf-parse"]` to keep it external. Do not casually remove that configuration.

## 7. CandidateProfile and evidence

`candidateProfileSchema` comprises contact/summary, `education`, `experience`, `projects`, three `Skill[]` collections (`skills`, `softSkills`, `technologies`), certifications, achievements, languages, links, reusable evidence, and potential issues.

- `CandidateEvidence`: `{ id, source, text, relatedEntityName?, confidence }`. Allowed sources are project, work experience, education, coursework, certification, achievement, and other resume section.
- `Skill`: name, category, `isMentioned`, `isDemonstrated`, support level, confidence, `evidenceIds`, and inline evidence.
- **Mentioned** means the skill appears in the profile/resume; plain-string skill output is coerced to mentioned/not demonstrated.
- **Demonstrated** is preserved only when `normalizeCandidateProfile` finds either a valid reusable evidence ID or non-empty inline evidence. It filters invalid IDs.
- A skill with evidence but not a valid demonstration becomes `weak_evidence`; a mentioned skill with no usable evidence remains `mentioned`. The normalizer adds `missing_evidence` potential issues for mentioned/not-demonstrated skills that have no valid evidence IDs.
- The model is instructed that a skills list alone is not proof. Actual validation/normalization happens in `normalizeCandidateProfile` in `lib/ai/resume-analyzer.ts`.

## 8. AI system

**Provider layer (Day 6):** `lib/ai/provider.ts` is the single source of truth for provider/model selection. `AI_PROVIDER=groq` (primary, model `openai/gpt-oss-20b`) or `AI_PROVIDER=openai` (rollback, model `gpt-4o-mini`); `AI_MODEL` optionally overrides; unset `AI_PROVIDER` defaults to openai. Groq runs on its OpenAI-compatible endpoint (`https://api.groq.com/openai/v1`) through the same `openai` SDK. `AI_FALLBACK_PROVIDER` optionally names a second provider used for exactly ONE retry attempt when the active provider fails transiently (HTTP 429, 413, 5xx, timeout, connection) — never for validation errors or other 4xx, and never a second attempt on the fallback. All four workflows call `runCompletion(workflow, request, { timeout })`, which injects the configured model and records token metrics per attempt.

**gpt-oss on Groq (critical):** gpt-oss is a reasoning model whose reasoning tokens count toward completion tokens. With the default "medium" effort the reasoning can consume the whole completion budget — empirically producing a structurally valid profile with ALL content arrays empty (completion capped at exactly 2048) or a 400 "Failed to validate JSON" from Groq's json_object mode. The provider layer therefore sends `reasoning_effort: "low"` (override: `GROQ_REASONING_EFFORT`) and `max_completion_tokens: 3072` for `openai/gpt-oss*` models on Groq — verified to restore full extraction quality. Groq's free tier also pre-flights `prompt_tokens + max_completion_tokens` against its 8K TPM limit (413 on violation), which is why the completion budget stays modest and 413 is fallback-eligible.

All workflows use `chat.completions.create` with `response_format: { type: "json_object" }`, not structured-output JSON Schema mode. JSON is manually parsed (including fenced JSON) and then Zod-validated. The Resume Analyzer retries once on validation failures only (JSON/Zod); no workflow retries network, rate-limit, or timeout errors — UI retry buttons re-invoke actions. All classify HTTP 429/rate-limit and abort/timeout errors identically on both providers.

**Token observability:** every AI call is wrapped by `callWithTokenMetrics` in `lib/ai/token-metrics.ts`, which logs `[ai-tokens] workflow=… provider=… model=… input=… output=… total=… duration_ms=… ok=…` from the provider `usage` field in development only (never in production, never any keys or user data). Fallback attempts log `[ai-fallback] workflow=… from=… to=… reason=…` in development.

**Token optimizations (Day 4):** prompts use compact markdown headers instead of heavy separator banners; the rewriter sends one deduplicated skills list and only evidence records not already shown in its Experience/Projects sections; the job analyzer no longer asks the model for `extractedRequirements` (derived deterministically in `normalizeJobTarget`); the resume analyzer returns `technologies: []` and the app derives that array from `skills` categories in `normalizeCandidateProfile`, and records evidence once in the top-level `evidence` array referenced by `evidenceIds`; the Skill Bridge prompt deduplicates skills/technologies. Zod schemas and all anti-hallucination validation are unchanged.

| Workflow | Entry and prompts | Input/output/schema | Timeout/persistence/reuse |
|---|---|---|---|
| Resume Analyzer | `analyzeResumeText`, `lib/ai/prompts/resume-analyzer.ts` | Clean resume text → CandidateProfile. Preprocesses nulls, skill strings/categories, URLs, duplicates; validates `candidateProfileSchema`. | 60s; saved to `resumes`; reuses valid completed profile unless forced. |
| Job Analyzer | `analyzeJobDescriptionText`, `prompts/job-analyzer.ts` | Pasted text → parsed/trimmed/deduped JobTarget; validates `jobAnalysisOutputSchema`; `extractedRequirements` is derived app-side, not by the model. | 45s; inserts a new `job_targets` row; `analyzeJob` reuses the owner's latest completed row for an identical trimmed description (no AI call). |
| Resume Rewriter | `rewriteResume`, `prompts/resume-rewriter.ts` | Profile + job + gaps + score → suggestions; validates `aiRewriteOutputSchema`, then evidence-text validator. | 60s; inserts `rewrites`; latest persisted rewrite can be restored but not reused to suppress explicit regeneration. |
| Skill Bridge | `generateSkillBridge`, `prompts/skill-bridge.ts` | Profile + job + gaps + strengths/weaknesses/score → priority skills + exactly 7 days; validates `aiSkillBridgeOutputSchema`. | 60s; upserts `skill_bridges` by analysis ID and reuses existing plan unless `regenerate: true`. |

## 9. Resume rewrite safety — actual defense chain

1. `RESUME_ANALYZER_SYSTEM_PROMPT` forbids invention when creating the source profile.
2. `normalizeCandidateProfile` filters invalid evidence IDs and marks weak evidence.
3. `RESUME_REWRITER_SYSTEM_PROMPT` explicitly prohibits invented technologies, metrics, years, companies, employment history, outcomes, certifications, and converting projects/coursework into employment. It says missing skills belong to SkillBridge.
4. `buildUserPrompt` in `lib/ai/resume-rewriter.ts` gives the model only candidate facts, explicit evidence text, JobTarget data, and analyzed gaps.
5. `aiRewriteOutputSchema` constrains suggestion shape and allowed sections.
6. `buildEvidenceTextSet` and `validateAllSuggestionEvidence` in `lib/rewrite/evidence-validator.ts` strip supporting-evidence strings not found exactly or by substring in profile evidence/content.
7. `normalizeRewriteOutput` drops unsupported non-stylistic suggestions with no remaining evidence. It permits short original-text suggestions as stylistic suggestions.
8. The UI makes suggestions reviewable; it does not mutate the original resume/profile.

**Important limitation:** code validates the `supportingEvidence` text array, but does not semantically parse every `suggestedText` to prove it contains no invented technology, metric, or employment claim. The prompt is a defense layer, not a complete programmatic proof. RewriteSuggestion has no evidence-ID field, so a fabricated rewrite evidence ID is not an applicable output shape.

## 10. Job matching — current implementation

`computeMatch` in `lib/scoring/index.ts` is pure: no AI, database, or network I/O.

- `normalize` lowercases/trims and removes most punctuation. Candidate skills come from all three Skill arrays; project and experience technology names form an extra set. Matching is direct normalized equality, then bidirectional substring fallback.
- Required skills and required technologies are `critical`; soft skills are `important`; preferred skills are `nice-to-have`; duplicates are deduped. Present + demonstrated = full; present but not demonstrated = partial; absent = missing.
- Per-group score: demonstrated 100, mentioned/present 60, missing 0. Skill dimension = critical 60%, important 25%, nice-to-have 15%; an empty group contributes 100.
- Experience: sums months from parseable formal Experience start/end dates; extracts first `N year`/`N yr` from job requirements. Missing/unparseable job requirement returns neutral 75. It does not handle overlap and does not count projects/coursework.
- Education: no job requirement = 75; no candidate education = 25; any token match between candidate degree/field and job requirement = 85; otherwise 50.
- Overall: `skillsMatch * .5 + experienceMatch * .3 + educationMatch * .2`, rounded/clamped.
- Strengths, weaknesses and up to six recommendations are deterministic from gaps.

**Role alignment is not a separate implemented dimension.** The PRD proposed a different hybrid formula; do not substitute it for code behavior.

## 11. Skill Bridge

`generateSkillBridgeAction` fetches the latest persisted scored analysis for the owner, validates its profile, fetches its JobTarget, reads gaps/score/strengths/weaknesses, and calls `generateSkillBridge`.

- Prompt: `lib/ai/prompts/skill-bridge.ts`. It directs the model to create evidence-building tasks around missing skills and reuse existing candidate projects when possible.
- Priority skills pass through `filterPrioritySkills`: each must exactly match a normalized missing SkillGap; otherwise the fallback is up to three actual missing gaps. No gaps produces `NO_GAPS`.
- `normalizeSkillBridgeOutput` sorts, deduplicates days, truncates to seven, rejects fewer than seven, then re-sequences them to 1–7 and assigns `pending` status. Each day requires title/task/reason/expected evidence and 15–480 estimated minutes.
- Existing plan is reused unless explicitly regenerated. Persistence is Supabase upsert on `analysis_id`; migration `007` provides the unique constraint.
- `updateDayStatusAction` validates day 1–7 and status, owner-fetches the plan, Zod-validates changed days, then persists JSONB `days`.
- `calculateProgress` and `isReadyToApply` in `lib/skill-bridge/plan-utils.ts` are deterministic. The ready state means all days are completed, not a hiring prediction.

## 12. Dashboard

Route `/dashboard` renders dashboard components and calls `getDashboardSummary`. The action resolves owner context, issues independent owner-filtered reads for latest resume, latest scored analysis, latest completed rewrite, latest bridge, recent analyses, and job targets. It makes one batched job title lookup for referenced job IDs.

`DashboardSummary` includes candidate name, workflow readiness flags, latest target role/match, gap snapshot, rewrite summary, bridge summary, next action, and five most-recent analyses. `buildSkillSnapshot`, `buildSkillBridgeSummary`, `deriveReadinessState`, and `deriveNextAction` are pure helpers. A missing piece produces a truthful empty/null substate. A new anonymous visitor gets an empty successful summary. No AI call or score recalculation occurs here.

## 13. Authentication and anonymous-first operation

### Auth

Supabase SSR server client reads cookies; `proxy.ts` (Next 16's replacement for the old `middleware.ts`) refreshes Supabase auth state with `getUser()` and lazily mints the anonymous session cookie for fresh visitors. Login and registration routes are presentational placeholders that link to `/dashboard`. Protected-route redirects remain deliberately disabled. Authentication is optional, not mandatory, for the MVP.

### Anonymous flow

`ANONYMOUS_SESSION_COOKIE` is exactly `s2c_anon_session`; its name, cookie options, and UUID validation live in the pure, edge-safe `lib/anonymous-session-shared.ts` and are re-exported by `lib/anonymous-session.ts`. `proxy.ts` lazily mints the cookie for every fresh visitor (`httpOnly`, `sameSite: "lax"`, path `/`, one-day `maxAge`, production-only `secure`) so direct page visits start with a valid session (DAY 3C BUG 2 fix); `getOrCreateAnonymousSessionId` remains as the upload action's fallback, and reads use `getAnonymousSessionId` with UUID shape validation.

Anonymous uploads use `temporary/<anonymousSessionId>/<resumeId>/original`; authenticated paths use `<userId>/<resumeId>/original`. The database supports `anonymous_session_id` on every core entity. Anonymous operations use the server-only admin client after reading the HttpOnly cookie, and action-local `applyOwnerFilter` functions constrain reads/updates by that session ID. That is why an anonymous user can complete all core MVP steps.

## 14. Security controls

- **Secrets:** `OPENAI_API_KEY` and `GROQ_API_KEY` stay server-side in `lib/ai/provider.ts` (never `NEXT_PUBLIC_`, never logged); `SUPABASE_SERVICE_ROLE_KEY` is used only in `lib/supabase/admin.ts` from Server Actions. Never import admin client into client code.
- **Configuration checks:** `lib/supabase/config.ts` rejects missing/placeholder configuration; `assertAIConfig` in `lib/ai/provider.ts` requires the active provider's API key.
- **RLS:** migrations enable RLS and authenticated policies for each core table. Anonymous access has no anon-role policy; service-role calls bypass RLS but are expected to be owner-filtered in trusted actions.
- **Storage:** bucket `resumes` is private. Migration `001` grants authenticated users folder-scoped policies. Anonymous storage flows use the service-role client and server action boundaries.
- **Input/file checks:** type, 5 MB size, emptiness, magic bytes, extraction validity, Zod parsing and server-side error mapping.
- **Rate limits:** `checkRateLimit` is an in-memory token bucket keyed by action + user/session identity. Limits: upload/analyze/analyzeJob/computeMatch 5/minute; rewrite/skillBridge 3/minute. It is explicitly single-process only and must be replaced for multi-instance production.
- **Double-submit guards:** every mutating panel handler (resume upload, job/match analysis, rewrite generate, skill-bridge generate, resume re-analyze) uses a synchronous `useRef` in-flight guard — rapid re-clicks on still-mounted Regenerate buttons cannot enqueue duplicate AI generations or duplicate rows.
- **Production logging:** all DEBUG/content-bearing logs are dev-gated (`NODE_ENV !== "production"`); production diagnostics log Zod issue paths and DB error codes only — never resume content, keys, or cookies. Verified empirically: the production server log stayed at startup-lines-only through the 10-user load test.
- **Concurrency (Day 5 hardening):** `e2e-concurrency-10users.mjs` runs 10 simultaneous anonymous sessions (distinct resumes, identical JD) through the full journey on a production build, then verifies DB integrity via the service-role key — exactly 1 row per table per session, correct owner-name pairing, no duplicates, no cross-session rows, zero 5xx, zero uncaught page errors.
- **Isolation risk:** every new admin-client query must preserve owner filtering. Missing a filter would bypass RLS for anonymous rows.

## 15. Database migrations and schema map

| Migration | Actual content and dependencies |
|---|---|
| `001_create_resumes.sql` | Creates enum `extraction_status` (`uploaded`, `processing`, `completed`, `failed`) and `resumes`: ID, required `user_id`, file metadata/path, extracted text/state/error/page count, timestamps. Indexes: user, user+status, created-at. Enables RLS with authenticated user CRUD policies. Adds `update_resumes_updated_at` trigger. Creates private `resumes` storage bucket plus authenticated folder-scoped insert/select/delete policies. Base migration. |
| `002_add_candidate_profile.sql` | Creates enum `analysis_status` (`not_started`, `analyzing`, `completed`, `failed`). Adds `candidate_profile JSONB`, analysis state/error/model/time to `resumes`; indexes user+analysis status and profile GIN. Requires `001`. |
| `003_enable_anonymous_mvp_sessions.sql` | Makes `resumes.user_id` nullable; adds `anonymous_session_id`; replaces owner constraint with `user_id IS NOT NULL OR anonymous_session_id IS NOT NULL`; adds anonymous session and anonymous-session+analysis-status indexes. Authenticated RLS policies remain; no anon-role policy. Requires `001`; the second index requires `002`. |
| `004_create_job_targets.sql` | Creates enums `opportunity_type` and `job_parsing_status`; creates `job_targets`: owner fields, title/company/location/source/description, all parsed requirement JSONB arrays, parsing state/model/error/timestamps. Adds owner check; indexes owner IDs, parsing state and created-at. Enables RLS with authenticated CRUD policies and adds `update_job_targets_updated_at`. |
| `005_create_analyses.sql` | Creates `analyses`: ID, `resume_id`, optional `job_target_id`, owner fields, profile JSONB, optional score JSONB, JSONB gaps/strengths/weaknesses/recommendations, timestamps. Adds owner check; indexes owner IDs, resume/job IDs and analyzed-at. Enables RLS with authenticated insert/select/delete policies. Uses IDs but no foreign keys. Logically depends on resume/job target. |
| `006_create_rewrites.sql` | Creates enum `rewrite_status`; creates `rewrites`: IDs for resume/job/optional analysis, owner fields, status, suggestions JSONB, model/timestamps. Adds owner check; indexes owner IDs, resume/job IDs and created-at. Enables authenticated CRUD RLS and adds `update_rewrites_updated_at`. Logical dependency: Resume/JobTarget/Analysis. |
| `007_create_skill_bridges.sql` | Creates enum `skill_bridge_status`; creates `skill_bridges`: IDs for resume/job/required analysis, owner fields, status, priority-skills/days JSONB, model/timestamps. Adds owner check and `UNIQUE (analysis_id)`; indexes owner IDs, resume/job IDs and created-at. Enables authenticated CRUD RLS and adds `update_skill_bridges_updated_at`. Logical dependency: Analysis and related rows. |

Current core tables: `resumes`, `job_targets`, `analyses`, `rewrites`, `skill_bridges`; plus Supabase `auth.users` and `storage` objects/buckets. There is no `candidate_profiles` table and no `skill_bridge` singular table.

**Foreign-key decision (DAY 3C audit, 2026-08-31):** Every table references `auth.users(id) ON DELETE CASCADE` for `user_id`. Cross-entity references (`analyses.resume_id/job_target_id`, `rewrites.resume_id/job_target_id/analysis_id`, `skill_bridges.resume_id/job_target_id/analysis_id`) intentionally have **no FK constraints** for the MVP: (1) rows are only written by trusted server actions that source these IDs from freshly fetched, owner-filtered rows, so orphans require a code bug, not user input; (2) the MVP has no delete flows, so cascade semantics would be untested dead schema; (3) adding `NOT VALID` FKs retroactively against live demo data buys little for a hackathon. Accepted risk: a bug could leave dangling rows, which are invisible to all owner-filtered queries. Post-MVP remediation: migration `008` adding `REFERENCES … ON DELETE CASCADE` (validate with `NOT VALID` + `VALIDATE CONSTRAINT`) once delete/cleanup flows exist and are tested.

## 16. Server action map

| Action | File | Input / validation | Ownership / AI / DB / result |
|---|---|---|---|
| `uploadAndProcessResume` | `app/actions/upload-resume.ts` | `File`; MIME, 5 MB, bytes, extraction | Auth/anon context; no AI; storage + `resumes`; typed success/error. |
| `analyzeResume` | `app/actions/analyze-resume.ts` | resume ID; completed extracted text; profile reuse | Owner-filtered resume; AI; updates `resumes`; typed result. |
| `analyzeJob` | `app/actions/analyze-job.ts` | job text min 50 chars | Owner context; AI; inserts `job_targets`; typed result. |
| `computeMatchAction` | `app/actions/compute-match.ts` | resume/job IDs; validates saved profile/job parsing status | Owner-filtered rows; deterministic; inserts `analyses`; typed result. |
| `computeLatestMatch` | same | job ID | Finds latest analyzed owner resume then delegates; deterministic/persisted. |
| `getLatestMatchContext` | same | none | Owner-filtered read restore; no AI/write. |
| `generateRewrite` | `app/actions/generate-rewrite.ts` | optional IDs / latest persisted context | Owner-filtered profile/job/analysis; AI; inserts `rewrites`; typed result. |
| `getLatestRewrite` | same | none | Owner-filtered restore; no AI/write. |
| `getSkillBridgeAction` | `app/actions/skill-bridge.ts` | none | Owner-filtered latest analysis/existing plan; no AI/write. |
| `generateSkillBridgeAction` | same | `regenerate?` | Owner-filtered analysis/job; AI; upserts `skill_bridges`; typed result. |
| `updateDayStatusAction` | same | bridge ID, integer day 1–7, approved status | Owner-filtered read/update; no AI; updates days JSONB. |
| `getDashboardSummary` | `app/actions/dashboard.ts` | none | Owner-filtered reads; no AI/write; typed dashboard result. |

All major actions map failures to typed error codes/messages and rate-limit expensive paths.

## 17. Route map

| Route | Purpose / status | Main component/data/actions |
|---|---|---|
| `/` | Landing — MVP COMPLETE navigation shell | `app/page.tsx` |
| `/analysis` | Upload, extraction, resume analysis — MVP COMPLETE | `ResumeUploader`, `ResumeAnalysisPanel`; upload/analyze actions |
| `/job-matcher` | Job parsing and match — MVP COMPLETE | `JobAnalysisPanel`, `MatchResultsPanel`; job/match actions |
| `/resume` | Rewrite suggestions — MVP COMPLETE | `RewritePanel`; rewrite actions |
| `/skill-bridge` | Seven-day plan/progress — MVP COMPLETE | `SkillBridgePanel`; bridge actions |
| `/dashboard` | Persisted summary — MVP COMPLETE | dashboard cards; dashboard action |
| `/resumes` | Resume management listing — PLACEHOLDER | static empty state |
| `/templates` | ATS templates — COMING SOON | static coming-soon state |
| `/settings` | User settings — PLACEHOLDER | hard-coded display content |
| `/login` | Sign-in — PLACEHOLDER | presentational page, no auth form/action |
| `/register` | Registration — PLACEHOLDER | presentational page, no auth form/action |

## 18. Testing

Run `npm test` (`vitest run`). At last verified run: **12 files, 217 tests passing**. `npm run lint` passed. Package scripts do not define a separate typecheck command; `npm run build` is the available TypeScript/build gate.

Current application test files (excluding dependency tests):

`app/actions/upload-resume.test.ts`; `lib/ai/job-analyzer.test.ts`; `lib/ai/resume-analyzer.preprocessing.test.ts`; `lib/ai/resume-analyzer.test.ts`; `lib/dashboard/dashboard.test.ts`; `lib/document-processing/pdf.integration.test.ts`; `lib/resume-ownership.test.ts`; `lib/rewrite/rewrite.test.ts`; `lib/scoring/scoring.test.ts`; `lib/security/file-signatures.test.ts`; `lib/security/rate-limit.test.ts`; `lib/skill-bridge/skill-bridge.test.ts`.

They cover upload action behavior; resume analyzer preprocessing/normalization; job analyzer; scoring; rewrite/evidence validation; SkillBridge normalization/progress; dashboard helpers; PDF extraction integration; ownership helpers; magic bytes; and rate limits. High-value missing/limited coverage visible from structure: live Supabase RLS/service-role behavior, full server-action ownership integration, end-to-end OpenAI failure handling, semantic rewrite-claim validation, and multi-instance rate-limit behavior.

## 19. Confirmed historical bugs

| Problem | Root cause / fix / lesson |
|---|---|
| Placeholder Supabase host/credentials | Day 1 log: local environment still used placeholders. Fix: configuration validation and real Supabase setup. Lesson: fail closed before data operations. Relevant: `lib/supabase/config.ts`. |
| PDF worker issue | Day 1 log: `pdf.worker.mjs` did not resolve in Next server bundle. Fix recorded as server-side extraction; current code externalizes `pdf-parse`. Lesson: preserve server-only PDF boundary and Next config. |
| AI/Zod validation failure | Day 1 log: model output did not fit CandidateProfile contract. Fix: alignment of parsing/validation and current preprocessing normalizer. Lesson: validate/normalize AI output before persistence. |
| Missing JobTarget migration | Day 2 log: `PGRST205` because `public.job_targets` did not exist remotely. Fix: apply `004_create_job_targets.sql`, then `005_create_analyses.sql`. Lesson: remote migration state is an operational dependency. |
| Rewrite persistence failure | **UNKNOWN — VERIFY IN CODE.** Current code persists rewrites, but the logs do not document a historical persistence bug. |
| SkillBridge generation failure | **UNKNOWN — VERIFY IN CODE.** No Day 3 development log is present; current code includes generation and persistence. |

## 20. Environment variables

| Name | Purpose / required | Boundary / locations |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL; required for Supabase clients | Public URL; `lib/supabase/{client,server,admin,config}.ts`, `proxy.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public Supabase anon key; required | Client/server proxy (`proxy.ts`); same public config locations |
| `SUPABASE_SERVICE_ROLE_KEY` | anonymous server action admin access; required for anon flows | Server-only; `lib/supabase/admin.ts`, `config.ts` |
| `OPENAI_API_KEY` | OpenAI provider credential; required when `AI_PROVIDER=openai` or fallback openai | Server-only; `lib/ai/provider.ts` |
| `GROQ_API_KEY` | Groq provider credential; required when `AI_PROVIDER=groq` or fallback groq | Server-only; `lib/ai/provider.ts` |
| `AI_PROVIDER` | `groq` (primary) or `openai` (rollback); default `openai` | Server-only; `lib/ai/provider.ts` |
| `AI_MODEL` | Optional model override for the active provider | Server-only; `lib/ai/provider.ts` |
| `AI_FALLBACK_PROVIDER` | Optional second provider for one transient-failure retry attempt; unset = disabled | Server-only; `lib/ai/provider.ts` |
| `GROQ_REASONING_EFFORT` | Optional gpt-oss reasoning effort on Groq (low\|medium\|high); default low | Server-only; `lib/ai/provider.ts` |
| `NODE_ENV` | production checks for secure cookie/debug logging | runtime; actions, AI modules, anonymous session |

Never put real values in this document, logs, browser code, or client props.

## 21. Important files

### P0 — critical

| File | Purpose / key functions | Risk |
|---|---|---|
| `schemas/index.ts` | Runtime contracts for profile, job, analysis, rewrite, SkillBridge | Contract drift can break every workflow/persisted record. |
| `types/domain.ts` | Shared domain semantics | Downstream type and business-contract breakage. |
| `app/actions/upload-resume.ts` | Upload/storage/extraction orchestration | Privacy, storage, and ingestion failures. |
| `app/actions/analyze-resume.ts` | Profile persistence/reuse | Candidate source-of-truth corruption. |
| `app/actions/compute-match.ts` + `lib/scoring/index.ts` | Analysis persistence + deterministic score | Score consistency and business behavior. |
| `app/actions/generate-rewrite.ts` + `lib/ai/resume-rewriter.ts` | Rewrite workflow and safety normalization | Hallucinated qualification risk. |
| `app/actions/skill-bridge.ts` + `lib/ai/skill-bridge-generator.ts` | Plan lifecycle/progress | Plan uniqueness, data integrity and AI output risk. |
| `lib/anonymous-session.ts`, `lib/supabase/admin.ts` | Anonymous identity/service-role boundary | Cross-user access or secret exposure. |
| `supabase/migrations/001`–`007` | Production schema/security assumptions | Runtime database failures and RLS regressions. |

### P1 — important

| File | Purpose / risk |
|---|---|
| `app/actions/analyze-job.ts`, `lib/ai/job-analyzer.ts` | Canonical job parsing/persistence; changes alter scoring input. |
| `lib/rewrite/evidence-validator.ts` | Evidence-text guard for rewrites; weakening it harms trust. |
| `app/actions/dashboard.ts`, `lib/dashboard/summary-utils.ts` | Truthful aggregate/readiness display; avoid recalculating or fabricating. |
| `lib/document-processing/{extract,pdf,docx,clean}.ts` | Upload robustness and PDF bundling boundary. |
| `lib/security/{file-signatures,rate-limit}.ts` | Abuse/file-type controls; limiter has scale limitation. |
| `proxy.ts` | Auth session refresh + lazy anonymous session mint (DAY 3C BUG 2 fix); protected route behavior is deliberately inactive. |
| `next.config.ts` | PDF parser externalization and Server Action payload configuration. |

## 22. Code contracts

1. Valid `resumes.candidate_profile` is canonical for its resume; analysis profile is a snapshot.
2. JobTarget requirement arrays are canonical input to deterministic matching.
3. Analysis connects one saved profile snapshot and one JobTarget through IDs and stores derived match results.
4. Original resume file/extracted text/profile are not rewritten by user suggestion acceptance.
5. AI outputs must pass parsing and Zod validation before persistence.
6. Mentioned is not demonstrated; matching must keep partial versus demonstrated behavior.
7. Anonymous data must be scoped to `s2c_anon_session`; service-role use needs owner filters.
8. Match/dashboard/readiness/progress calculations remain deterministic.
9. A SkillBridge plan must remain exactly seven normalized days and unique by analysis ID.
10. Missing skills belong in gap/SkillBridge workflows, not resume claims.

# DO NOT BREAK

- Do not remove `pdf-parse` from `serverExternalPackages` without reproducing PDF ingestion in production build/runtime.
- Do not introduce a separate CandidateProfile table or silently change JSON schema without a migration/backfill strategy.
- Do not query with `createAdminClient()` without an owner filter.
- Do not make client components import server admin/OpenAI code.
- Do not replace deterministic match score with AI-generated score.
- Do not relax rewrite evidence validation or claim it proves suggested text semantically.
- Do not remove the unique `skill_bridges.analysis_id` constraint while retaining upsert semantics.
- Do not enable protected routes until a working login/signup/auth flow exists.

## 23. Safe change guide

### Resume Analyzer
Inspect `schemas/index.ts`, `resume-analyzer.ts`, prompt, `analyze-resume.ts`, and preprocessing tests first. Preserve profile/evidence semantics and cache behavior. Run `npm test`, `npm run lint`, `npm run build`. Common failures: model shape drift, malformed URLs/nulls, stale migrations, or PDF server bundling.

### Job Matcher
Inspect job schema/analyzer, `compute-match.ts`, `lib/scoring/index.ts`, scoring tests. Preserve normalized dedupe/classification and deterministic dimensions. Related breakage: rewrite, SkillBridge and dashboard expect Analysis fields.

### Resume Rewrite
Inspect prompt, schema, rewriter, evidence validator, rewrite action/tests. Preserve source-only truth, supporting-evidence filtering and review-not-overwrite behavior. Test adversarial model output; do not assume prompt compliance is sufficient.

### Skill Bridge
Inspect bridge action/generator/prompt/schema/plan utils/tests. Preserve missing-gap-only priorities, exact seven-day normalization, upsert key and ownership before day updates. Related breakage: dashboard progress/readiness.

### Dashboard
Inspect `dashboard.ts`, summary utils, domain types and dashboard components/tests. Use persisted data only; do not invoke AI or silently recompute saved score. Confirm empty and partial states remain truthful.

### Authentication
Inspect `proxy.ts` (Next 16 replacement for middleware), Supabase SSR client, auth routes, anonymous session. Auth is optional now; enabling it requires a real session UI and testing both authenticated and anonymous paths.

### Database
Inspect every dependent migration/action/schema before SQL edits. Apply migrations in numerical order remotely. Preserve RLS and owner constraints; test both user and anonymous access after changes.

## 24. QA priorities

**P0:** anonymous owner isolation across all actions; remote migration parity; upload magic-byte/extraction failure behavior; adversarial rewrite claims; profile evidence ID handling.

**P1:** scoring date/overlap/substrings/duplicate requirements; malformed AI JSON/schema error paths; SkillBridge reuse/regenerate/upsert and day updates; dashboard consistency after reload/multiple analyses.

**P2:** placeholder navigation/auth messaging; in-memory rate limiting under multi-instance deployment; full browser e2e script maintenance.

## 25. Commands

From repository root:

```powershell
npm run dev
npm test
npm run lint
npm run build
```

There is no `typecheck` package script. Use `npm run build` as the configured build/type gate. `npm start` runs the built app.

## 26. Current status

**DAY 1:** implemented and documented in `Documents/Skill2Career_AI_Day_1_Development_Log.docx`: foundations, anonymous resume ingestion, extraction, CandidateProfile analysis.

**DAY 2:** implemented and documented in `Documents/Skill2Career_AI_Day_2_Development_Log.docx`: JobTarget, deterministic matching, Analysis persistence and rewrite safety.

**DAY 3:** current repository contains SkillBridge and dashboard implementation. A Day 3 log is not present. **UNKNOWN — VERIFY IN CODE** for historical Day 3 completion claims.

**MVP:** READY for the anonymous core journey in code, subject to configured Supabase/OpenAI environment and all migrations applied. Not production-complete authentication/account management.

**Known limitations:** optional/placeholder auth; inactive protected routes; no real resume-management page; templates/settings are placeholders; README is sparse; no explicit AI retry loop; in-memory rate limiting; rewrite evidence checking does not semantically prove all suggested text; relational IDs lack database foreign keys; no documented Day 3 history.
