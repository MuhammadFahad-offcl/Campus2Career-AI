import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/legal-page-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Campus2Career AI.",
};

const CONTACT_EMAIL = "support@campus2career.ai";

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" lastUpdated="September 14, 2026">
      <section>
        <h2>1. Agreement</h2>
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of
          Campus2Career AI (the &quot;Service&quot;). By using the Service,
          you agree to these Terms. If you don&apos;t agree, please
          don&apos;t use the Service.
        </p>
      </section>

      <section>
        <h2>2. What the Service does</h2>
        <p>
          Campus2Career AI provides AI-generated resume analysis, resume
          rewriting suggestions, job-match scoring, skill-gap
          recommendations, and mock interview practice. Outputs are
          generated automatically by machine learning models and are
          provided for informational and educational purposes only.
        </p>
      </section>

      <section>
        <h2>3. Not professional advice</h2>
        <p>
          The Service does not provide career counseling, legal, or
          professional advice, and its AI-generated feedback can be
          incomplete, inaccurate, or unsuitable for your specific
          circumstances. You are solely responsible for reviewing,
          verifying, and deciding whether to use any suggestion, rewrite, or
          score the Service produces before relying on it — for example, in
          a real job application or interview.
        </p>
      </section>

      <section>
        <h2>4. Accounts</h2>
        <p>
          You may use core features without an account. If you create one,
          you&apos;re responsible for maintaining the confidentiality of your
          credentials and for all activity under your account. You must
          provide accurate information and may not share your account with
          others.
        </p>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Upload content you don&apos;t have the right to upload, or that infringes someone else&apos;s rights.</li>
          <li>Use the Service to generate misleading, fraudulent, or deceptive application materials intended to misrepresent your identity or qualifications to a third party.</li>
          <li>Attempt to disrupt, overload, or circumvent rate limits or security controls on the Service.</li>
          <li>Use automated means to scrape or extract data from the Service beyond normal use.</li>
          <li>Upload malicious files or attempt to compromise the Service&apos;s infrastructure.</li>
        </ul>
        <p>
          We may suspend or terminate access for accounts that violate these
          Terms.
        </p>
      </section>

      <section>
        <h2>6. Your content</h2>
        <p>
          You retain ownership of the resumes, job descriptions, and other
          content you submit. By submitting content, you grant us a limited
          license to process it solely to provide the Service to you
          (including sending relevant text to the AI providers described in
          our{" "}
          <a href="/privacy">Privacy Policy</a>). We don&apos;t claim
          ownership of your content and don&apos;t use it to train our own
          models.
        </p>
      </section>

      <section>
        <h2>7. Data retention</h2>
        <p>
          Data handling, including automatic deletion of anonymous sessions
          and how to delete your account or individual resumes, is described
          in our <a href="/privacy">Privacy Policy</a>, which is part of
          these Terms.
        </p>
      </section>

      <section>
        <h2>8. Service availability</h2>
        <p>
          The Service is provided on an &quot;as is&quot; and &quot;as
          available&quot; basis, without warranties of any kind, express or
          implied. We don&apos;t guarantee the Service will be uninterrupted,
          error-free, or that AI-generated outputs will be accurate or fit
          for any particular purpose. We may modify, suspend, or discontinue
          any part of the Service at any time.
        </p>
      </section>

      <section>
        <h2>9. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, Campus2Career AI and its
          operators will not be liable for any indirect, incidental,
          special, or consequential damages, or for any loss of data,
          opportunities, or employment outcomes, arising from your use of
          the Service, including reliance on AI-generated content.
        </p>
      </section>

      <section>
        <h2>10. Changes to these Terms</h2>
        <p>
          We may update these Terms as the Service evolves. Continued use of
          the Service after an update constitutes acceptance of the revised
          Terms. We&apos;ll update the &quot;Last updated&quot; date above
          when changes are made.
        </p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>
          Questions about these Terms? Contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPageShell>
  );
}
