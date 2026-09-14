import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Campus2Career AI collects, uses, stores, and deletes your data.",
};

const CONTACT_EMAIL = "support@campus2career.ai";

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="September 14, 2026">
      <section>
        <h2>1. Overview</h2>
        <p>
          Campus2Career AI (&quot;we&quot;, &quot;us&quot;) provides AI-assisted
          resume analysis, resume rewriting, job matching, skill-gap
          identification, and mock interview practice. This policy explains
          what data we collect when you use the product, why we collect it,
          how long we keep it, and the choices you have.
        </p>
        <p>
          You can use the core features without creating an account. If you
          create an account, this policy also covers the account data we
          store.
        </p>
      </section>

      <section>
        <h2>2. What we collect</h2>
        <ul>
          <li>
            <strong>Resume content.</strong> The PDF or DOCX file you upload,
            plus the text and structured profile (skills, experience,
            education) our system extracts from it.
          </li>
          <li>
            <strong>Job descriptions and target roles</strong> you paste or
            enter for matching, analysis, and skill-gap comparisons.
          </li>
          <li>
            <strong>Generated outputs</strong>, including analysis scores,
            AI-rewritten resume content, skill-bridge recommendations, and
            mock interview questions, answers, and feedback you provide
            during a practice session.
          </li>
          <li>
            <strong>Account data</strong>, if you register: your email
            address and an encrypted password (handled entirely by our
            authentication provider — we never see or store your raw
            password).
          </li>
          <li>
            <strong>Technical data</strong>, including a temporary,
            randomly-generated session identifier stored in a cookie, and
            operational logs (error messages, rate-limit counters) used to
            keep the service reliable and secure.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Using the product without an account</h2>
        <p>
          By default, your activity is tied to an anonymous session
          identified by a temporary cookie rather than to your identity. That
          cookie expires after 24 hours. Anonymous data (uploaded resumes,
          analyses, and everything derived from them) is automatically and
          permanently deleted no later than 7 days after it was created,
          whether or not you return.
        </p>
        <p>
          If you create an account before that data is deleted, we transfer
          (&quot;claim&quot;) the resumes and results from your current
          anonymous session into your new account so you don&apos;t lose your
          work.
        </p>
      </section>

      <section>
        <h2>4. How we use your data</h2>
        <ul>
          <li>To extract, analyze, and score your resume content.</li>
          <li>
            To generate AI-assisted rewrites, skill-bridge plans, job-match
            scores, and mock interview questions and feedback.
          </li>
          <li>
            To operate your account, including sign-in, sign-out, and account
            deletion.
          </li>
          <li>
            To maintain security and reliability: rate-limiting abusive
            traffic, and logging errors so we can diagnose and fix problems.
          </li>
        </ul>
        <p>
          We do not sell your data, and we do not use your resume or job
          content to serve you advertising.
        </p>
      </section>

      <section>
        <h2>5. AI processing and third-party services</h2>
        <p>
          We rely on a small number of infrastructure providers to operate
          the service:
        </p>
        <ul>
          <li>
            <strong>Database, authentication, and file storage</strong> are
            provided by Supabase. Your resume files, extracted text, and
            account records are stored there.
          </li>
          <li>
            <strong>AI processing</strong> (resume analysis, rewriting,
            skill-bridge generation, and mock interview question/feedback
            generation) is performed by a third-party large language model
            provider (currently Groq, with OpenAI available as a fallback).
            The relevant resume or job text is sent to that provider solely
            to generate the requested output, subject to that provider&apos;s
            own data-handling terms.
          </li>
        </ul>
        <p>
          We do not use any third-party advertising or analytics trackers.
        </p>
      </section>

      <section>
        <h2>6. Cookies</h2>
        <p>
          We use only the cookies necessary for the product to function: an
          anonymous session cookie (if you&apos;re not signed in) and an
          authentication session cookie (if you are). We do not use
          advertising or cross-site tracking cookies.
        </p>
      </section>

      <section>
        <h2>7. Data retention and deletion</h2>
        <ul>
          <li>Anonymous data is deleted automatically within 7 days.</li>
          <li>
            If you have an account, your resumes, analyses, rewrites,
            skill-bridge plans, and mock interview sessions are kept until
            you delete them individually or delete your account.
          </li>
          <li>
            Deleting your account permanently removes your uploaded resume
            files, all derived data, and your account record. This action
            cannot be undone.
          </li>
          <li>
            Operational error logs are retained for a maximum of 30 days for
            debugging purposes only.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Your choices</h2>
        <ul>
          <li>Use the product anonymously and let your data expire automatically.</li>
          <li>Delete an individual resume (and everything derived from it) at any time from the My Resumes page.</li>
          <li>Delete your entire account and all associated data from Settings.</li>
        </ul>
      </section>

      <section>
        <h2>9. Changes to this policy</h2>
        <p>
          We may update this policy as the product evolves. We&apos;ll update
          the &quot;Last updated&quot; date above when we do.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          Questions about this policy or your data? Contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPageShell>
  );
}
