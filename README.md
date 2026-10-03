# Campus2Career AI

**AI career intelligence for students, internship seekers, fresh graduates and early-career professionals.**

> Understand your gap. Fix your application. Become more job-ready.

Upload a resume and paste a target job or internship description. Campus2Career AI shows how well the resume fits that job, what is missing, and what to do next. It then helps you improve the resume, close the gaps in seven days, and practise the interview.

**Design principle: AI interprets, rules decide.** The language model reads resumes and job descriptions and writes suggestions. Scores, permissions, progress and safety checks are ordinary application code, so results are repeatable and can be explained.

---

## Contents

- [What is built](#what-is-built)
- [Product flow](#product-flow)
- [How the scores work](#how-the-scores-work)
- [How invented claims are kept out](#how-invented-claims-are-kept-out)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Security and data handling](#security-and-data-handling)
- [Scope and known limitations](#scope-and-known-limitations)
- [Product philosophy](#product-philosophy)
- [License](#license)

---

## What is built

| # | Capability | What the user gets | Engine |
| --- | --- | --- | --- |
| 1 | **Resume Analyzer** | Upload a PDF or DOCX. Get a structured profile where every skill is marked Demonstrated, Weak evidence or Mentioned only. | AI + rules |
| 2 | **ATS Compatibility Score** | A 0 to 100 score across seven weighted categories, with what works and what to improve. | Rules |
| 3 | **Job Matcher and Skill Gap** | Paste a job description. Get a match score split into skills, experience and education, plus every gap. | AI + rules |
| 4 | **Resume Rewrite** | Job-specific suggestions, each with its supporting evidence. Accept, reject or edit each one. | AI + rules |
| 5 | **Full rewritten resume** | Approved changes applied to the whole resume. Download as Word (.docx) or text (.txt). | Rules |
| 6 | **7-Day Skill Bridge** | A seven-day plan built around the skills that are really missing, with daily progress tracking. | AI + rules |
| 7 | **AI Mock Interviewer** | A typed practice interview for the target role, with follow-up questions and a readiness report. | AI + rules |
| 8 | **Explainable Dashboard** | Where am I, what is missing, and what to do next, on one page. | Rules |
| 9 | **Accounts and data control** | Works with no sign-up. Create an account to keep the work. Delete one resume or the whole account. | Rules |

"Rules" means ordinary TypeScript that makes no AI call and always gives the same output for the same input.

---

## Product flow

```text
Understand → Compare → Improve → Build → Apply → Practice
```

| Stage | The user | The product | Page |
| --- | --- | --- | --- |
| 1 Understand | Uploads a resume | Extracts the text, builds the evidence-aware profile, and offers the ATS score | `/analysis` |
| 2 Compare | Pastes a job description | Structures the requirements, then computes the match and the gaps | `/job-matcher` |
| 3 Improve | Reviews suggestions | Proposes evidence-backed rewrites and builds the full rewritten resume | `/resume` |
| 4 Build | Works through seven daily tasks | Plans tasks that create real evidence for the missing skills | `/skill-bridge` |
| 5 Apply | Checks readiness | Shows status, gaps, progress and the next step | `/dashboard` |
| 6 Practice | Answers interview questions | Runs a personalised mock interview and reports the result | `/mock-interview` |

---

## How the scores work

All three scoring engines are pure functions. They make no AI call.

### Job match (`lib/scoring/index.ts`)

```text
Overall = 0.5 × Skills + 0.3 × Experience + 0.2 × Education
```

| Part | Rule |
| --- | --- |
| Skill points | Demonstrated 100, mentioned 60, missing 0 |
| Skill importance | Critical 60%, important 25%, nice-to-have 15% |
| Experience | Months of work history against the years the job asks for. No stated requirement scores 75 |
| Education | Matching degree or field 85, no match 50, no education listed 25. No stated requirement scores 75 |
| Labels | 80+ Strong Match, 60+ Good Match, 40+ Moderate Match, 20+ Weak Match, below 20 Low Match |

### ATS compatibility (`lib/ats/scoring.ts`)

The ATS score looks at the resume alone, with no job description. It is an estimate and does not guarantee passing any specific applicant tracking system.

| Category | Weight |
| --- | --- |
| Structure | 15% |
| Formatting | 15% |
| Keyword Optimization | 20% |
| Skills Coverage | 15% |
| Experience Quality | 15% |
| Readability | 10% |
| ATS Parsing Risks | 10% |

### Mock interview (`lib/interview/session-utils.ts`)

- Interview types: Technical, Behavioral, HR or Mixed. Difficulty: Beginner, Intermediate or Advanced. Length: 5, 10 or 15 main questions.
- The AI rates each typed answer on six dimensions: relevance, clarity, technical accuracy, depth, communication and evidence.
- Code computes the overall score (the average of all six scores across every evaluated answer) and a five-part breakdown: Technical Knowledge, Communication, Relevance, Problem Solving and Behavioral Responses.
- Code also enforces the question cap, prevents two follow-ups in a row, and checks each question's category and target skill.

---

## How invented claims are kept out

The product treats made-up qualifications as its most serious risk.

1. **Conservative profile.** The analyser prompt forbids invented facts. A skill counts as "demonstrated" only when a project, job, course, certificate or achievement in the same resume supports it.
2. **Profile normaliser.** Code removes evidence references that do not exist. A skill without usable evidence cannot stay "demonstrated".
3. **Truth rule in the rewrite prompt.** Never add companies, technologies, metrics, years or certifications. Missing skills go to the Skill Bridge, not into the resume.
4. **Zod validation.** A response with the wrong structure is rejected before anything is saved.
5. **Evidence validator** (`lib/rewrite/evidence-validator.ts`). Each piece of supporting evidence must pass one of three tests against the candidate's own profile: an exact match, a whole-word quote, or every significant word present in the profile.
6. **The candidate decides.** Every suggestion is accepted, rejected or edited by the user. The original resume and profile are never overwritten.

---

## Architecture

```text
Browser (anonymous visitor or signed-in user, HttpOnly session cookie)
        ↓
proxy.ts  — refreshes the Supabase auth session, creates the anonymous session cookie
        ↓
Next.js 16 App Router  — 14 pages
        ↓
26 Server Actions  +  1 scheduled cleanup route
        ↓
lib/
 ├── ai/                   one provider module, six AI workflows, prompts, Zod checks
 ├── scoring/ ats/ interview/   three rule-based engines
 ├── rewrite/              evidence validator, suggestion applier, Word and text export
 ├── document-processing/  PDF and DOCX text extraction and cleaning
 └── security/ auth/ observability/   file signatures, rate limiter, account claim, error log
        ↓                                   ↓
Supabase                              AI providers
 PostgreSQL (8 tables, RLS)            Groq  openai/gpt-oss-20b  (primary)
 Storage (private resume bucket)       OpenAI  gpt-4o-mini  (optional fallback)
 Auth (email and password)
```

The browser never reads or writes the database directly. All data access goes through Server Actions, which resolve the owner first and then read records through an owner filter.

### AI workflows

All six workflows go through one function in `lib/ai/provider.ts`, ask for a JSON object, and are validated in code before anything is saved.

| Workflow | Purpose | Temperature | Timeout |
| --- | --- | --- | --- |
| `resume-analyzer` | Resume text to candidate profile | 0.1 | 45 s |
| `job-analyzer` | Job text to job target | 0.1 | 45 s |
| `resume-rewriter` | Rewrite suggestions | 0.3 | 60 s |
| `skill-bridge` | Seven-day plan | 0.4 | 60 s |
| `mock-interview-turn` | Evaluate an answer and ask the next question | 0.5 | 45 s |
| `mock-interview-report` | Closing feedback text | 0.4 | 45 s |

- The provider and model come from environment variables (`AI_PROVIDER`, `AI_MODEL`), so no workflow names a model in its own code.
- When `AI_FALLBACK_PROVIDER` is set, the second provider is tried once, and only for temporary failures: HTTP 429, 413, 5xx, timeouts and connection errors.
- Saved results are reused. A completed profile, an identical job description and an existing 7-day plan cause no new AI call.

---

## Technology stack

Versions are taken from `package.json` and the lock file.

| Layer | Technology | Version |
| --- | --- | --- |
| Language | TypeScript (strict mode) | 5.9.3 |
| Framework | Next.js (App Router, Server Actions, `proxy.ts`) | 16.3.5 |
| UI runtime | React and React DOM | 19.2.8 |
| Styling | Tailwind CSS | 4.3.3 |
| Components | shadcn/ui on Base UI | 4.19.0, 1.7.0 |
| Icons | Lucide React | 1.35.0 |
| Database, storage, auth | Supabase JS, Supabase SSR | 2.112.4, 0.12.5 |
| AI SDK | `openai` (one client for both providers) | 7.8.0 |
| Validation | Zod | 4.4.3 |
| PDF text | pdfjs-dist (installed through pdf-parse 2.4.5) | 5.4.296 |
| DOCX text | Mammoth | 1.12.2 |
| Word export | docx | 9.7.1 |
| Unit tests | Vitest | 4.1.11 |
| Browser tests | Playwright | 1.62.1 |
| Lint | ESLint with eslint-config-next | 9.39.5 |
| Hosting | Vercel, with one daily scheduled job | |

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/MuhammadFahad-offcl/Campus2Career-AI.git
cd Campus2Career-AI
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the values listed under [Environment variables](#environment-variables).

> **Never commit `.env.local` or any file containing real credentials.**

### 3. Apply the database migrations

In the Supabase SQL editor, run the nine files in `supabase/migrations/` in order, from `001` to `009`.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the development server |
| `npm run build` | Builds for production |
| `npm start` | Runs the production build |
| `npm run lint` | Runs ESLint |
| `npm test` | Runs the Vitest tests |
| `npx tsc --noEmit` | Type-checks the project |

---

## Environment variables

| Variable | Purpose | Visibility |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Base URL used for metadata, sitemap and robots | Public |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin client: anonymous sessions, rate limiter, error log, cleanup, account deletion | Server only |
| `AI_PROVIDER` | `groq` or `openai`. The template sets `groq`. The code uses `openai` if the variable is missing | Server only |
| `GROQ_API_KEY` | Needed when Groq is the active or fallback provider | Server only |
| `OPENAI_API_KEY` | Needed when OpenAI is the active or fallback provider | Server only |
| `AI_MODEL` | Optional. Overrides the provider's default model | Server only |
| `AI_FALLBACK_PROVIDER` | Optional. Second provider used for one retry on temporary failure | Server only |
| `GROQ_REASONING_EFFORT` | Optional. `low`, `medium` or `high`. Default `low` | Server only |
| `CRON_SECRET` | Bearer token the cleanup route requires | Server only |

---

## Project structure

```text
app/
├── (auth)/                 login, register
├── (dashboard)/            analysis, job-matcher, resume, skill-bridge,
│                           mock-interview, dashboard, resumes, settings, templates
├── actions/                12 files holding the 26 server actions
├── api/cron/cleanup/       scheduled cleanup route
├── privacy/  terms/        legal pages
├── layout.tsx
└── page.tsx                landing page

components/
├── auth/ dashboard/ layout/ legal/ providers/ resumes/ settings/ shared/
├── ui/                     UI primitives (shadcn)
└── *.tsx                   feature panels: analysis, ATS score, match, rewrite,
                            rewritten resume, skill bridge, mock interview

lib/
├── ai/                     provider module, workflow modules, prompts, token metrics
├── scoring/                job match engine
├── ats/                    ATS score engine
├── interview/              interview scoring and session rules
├── rewrite/                evidence validator, suggestion applier, text and Word formatters
├── skill-bridge/           plan progress helpers
├── dashboard/              dashboard derivation
├── document-processing/    PDF and DOCX extraction, text cleaning
├── security/               file signatures, rate limiter
├── auth/                   claims anonymous work into an account
├── observability/          error logging
└── supabase/               browser, server and admin clients

schemas/                    Zod run-time contracts
types/                      shared domain types
supabase/migrations/        nine SQL migrations, 001 to 009
proxy.ts                    request entry: session refresh and anonymous cookie
ci.yml                      lint, type-check, test and build sequence (Node.js 22)
vercel.json                 daily schedule for /api/cron/cleanup
```

### Database

Eight tables, all with Row Level Security enabled: `resumes`, `job_targets`, `analyses`, `rewrites`, `skill_bridges`, `interview_sessions`, `rate_limit_buckets` and `error_logs`. Resume files are kept in one private storage bucket named `resumes`.

---

## Testing

```bash
npm test          # 352 tests in 19 files
npx tsc --noEmit  # type-check
npm run lint      # ESLint
```

The unit tests sit next to the code they check.

| Promise to the user | How it is tested |
| --- | --- |
| No invented qualifications | Evidence that names an employer, a duration or a technology the profile lacks is stripped, including when one real word is hidden inside an invented sentence |
| The same input gives the same score | The match and ATS engines are tested as pure functions, including weights, labels and edge cases |
| Students are treated fairly | Dedicated tests cover resumes with projects and no work history |
| A 7-day plan is always seven days | Plans with fewer than seven days are rejected. Extra, repeated or out-of-order days are repaired |
| The interview stays within its limits | The question cap, the follow-up rule, category checks and target-skill checks are each tested |
| Only real files are accepted | A file whose bytes do not match its declared type is rejected |
| Each visitor gets an isolated session | The proxy test confirms a valid session cookie is created once and reused |

### Browser end-to-end scripts

The repository root also holds Playwright scripts that drive the running app in a real browser. They need the dev server on `http://localhost:3000`, a live database and AI keys in `.env.local`, so they are run by hand and are not part of `npm test`.

```bash
node make-test-resume.mjs      # creates the sample student resume
node e2e-golden-journey.mjs
```

| Script | What it does |
| --- | --- |
| `e2e-golden-journey.mjs` | Runs the full anonymous journey: upload, profile, job, match, rewrite, Skill Bridge and dashboard |
| `e2e-isolation.mjs` | Opens a second anonymous session and confirms it sees none of the first session's data |
| `e2e-hallucination-test.mjs` | Uses a student resume with Python and React only against a job that asks for Docker, AWS, FastAPI and PostgreSQL, and checks that no suggestion claims them |
| `e2e-concurrency-10users.mjs` | Runs ten anonymous users at the same time, then checks the database for one row per table per session |
| `e2e-jd-reuse.mjs` | Analyses the same job description twice and confirms there is no second AI call and no second row |
| `e2e-rollback-check.mjs` | Confirms that `AI_PROVIDER=openai` switches the whole AI layer with no code change |
| `e2e-profile-output-audit.mjs` | Measures how much of the AI's profile output is duplicated evidence text |
| `groq-compat-probe.mjs` | Checks Groq's behaviour for the exact request shapes the app uses |

---

## Security and data handling

| Control | Implementation |
| --- | --- |
| Secrets | AI keys and the service-role key are read only on the server. None uses the `NEXT_PUBLIC_` prefix |
| Data isolation | Each server action resolves the owner first, then reads records through a filter on `user_id` or `anonymous_session_id` |
| Row Level Security | Enabled on all eight tables. Signed-in users reach only their own rows |
| Private files | The `resumes` storage bucket is private |
| Session cookie | HttpOnly, SameSite=Lax, Secure in production, random UUID, 24-hour lifetime |
| Upload checks | PDF or DOCX only, 5 MB maximum, empty-file check, and a file-signature check |
| Input validation | Zod schemas on AI output and on data sent back from the browser |
| Rate limiting | A token bucket in PostgreSQL shared by all server instances, with an in-memory fallback |
| Response headers | Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy and Strict-Transport-Security |
| Scheduled cleanup | Runs daily. Deletes anonymous data older than 7 days, error logs older than 30 days and rate-limit buckets unused for 24 hours. Refuses any request without the `CRON_SECRET` bearer token |

Rate limits per user per minute: upload 5, resume analysis 5, job analysis 5, match 5, rewrite 3, Skill Bridge 3, interview start 3, interview answer 20.

**Accounts.** Everything works without signing up. Creating an account or signing in moves the anonymous session's resumes, job targets, analyses, rewrites, plans and interview sessions into the account. My Resumes deletes one resume with everything derived from it. Settings deletes the whole account.

---

## Scope and known limitations

### Built

- Resume upload, text extraction and evidence-aware profile
- ATS compatibility score
- Job analysis, match score and skill gaps
- Rewrite suggestions with accept, reject and edit
- Full rewritten resume with Word and text download
- 7-day Skill Bridge with progress tracking
- AI mock interviewer with report
- Dashboard with readiness and next step
- Anonymous use, accounts, My Resumes and account deletion
- Privacy Policy and Terms of Service pages
- Rate limiting, error logging and scheduled cleanup

### Not built

- Resume templates. The Templates page shows "Templates Coming Soon"
- Notifications. Settings marks them "Coming soon"
- Voice answers in the mock interview. Answers are typed
- PDF export of the rewritten resume. Exports are Word and text
- Job discovery or job-board scraping. The user pastes the job description
- Semantic search with embeddings
- Recruiter or employer features

### Known limitations

| Limitation | Detail |
| --- | --- |
| Review decisions are not saved | Accept, reject and edit choices live in the browser and reset on the next visit |
| ATS score is not stored | It is calculated each time it is requested |
| Text-based resumes only | Scanned or image-only PDFs produce no text. There is no OCR |
| Latin-script text only | Text cleaning removes characters outside the Latin range |
| No foreign keys between result tables | Links are stored as IDs. Deletion order is handled by application code |
| Rate-limiter fallback is per instance | If the database limiter is unreachable, limits apply inside one server instance only |

---

## Product philosophy

| Principle | Meaning |
| --- | --- |
| **Evidence over hype** | Every claim is supported by candidate evidence |
| **Action over information** | Every analysis leads to a useful next step |
| **Specific over generic** | Recommendations are tied to the target opportunity |
| **Explainable by default** | Users understand why a result was produced |
| **Simple surface, strong engine** | Clean interface backed by powerful analysis |

---

## License

MIT. See [LICENSE](./LICENSE).
