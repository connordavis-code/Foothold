import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Foothold',
  description: 'Privacy practices for Foothold personal finance tool.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-6 py-16">
      <article className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Foothold
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: May 1, 2026
          </p>
        </header>

        <section className="space-y-3 text-base leading-relaxed">
          <h2 className="text-xl font-semibold pt-4">Scope</h2>
          <p>
            Foothold is a single-user, self-hosted personal finance dashboard.
            The only person whose financial data this application stores is
            the application operator. No accounts are created for, used by,
            or accessible to any third party.
          </p>

          <h2 className="text-xl font-semibold pt-4">Data we collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Account &amp; transaction data</strong> retrieved from
              connected financial institutions via Plaid: balances,
              transactions, holdings, investment activity, and recurring
              streams.
            </li>
            <li>
              <strong>Authentication data</strong>: email address, used solely
              for magic-link sign-in via Resend.
            </li>
          </ul>

          <h2 className="text-xl font-semibold pt-4">How data is stored</h2>
          <p>
            All data is stored in a Supabase Postgres database with
            encryption at rest (AES-256). Plaid access tokens are
            additionally encrypted at the application layer with AES-256-GCM
            before being written to the database. All data in transit uses
            TLS 1.2 or later.
          </p>

          <h2 className="text-xl font-semibold pt-4">How data is used</h2>
          <p>
            Data is used exclusively to render the application&apos;s
            dashboards, insights, and goal tracking for the single operator.
            Anonymized weekly summaries may be sent to Anthropic&apos;s API
            to generate natural-language insights; no personally identifying
            information is included in those requests.
          </p>

          <h2 className="text-xl font-semibold pt-4">Sharing</h2>
          <p>
            Data is not sold, shared, advertised against, or used for any
            purpose beyond the application&apos;s own dashboards. Service
            providers used to operate the application (Plaid for institution
            connectivity, Resend for email delivery, Supabase for database
            hosting, Anthropic for narrative generation, Vercel for hosting)
            each have their own privacy policies.
          </p>

          <h2 className="text-xl font-semibold pt-4">Retention &amp; deletion</h2>
          <p>
            Because this is a single-user tool, data retention is at the sole
            discretion of the operator. Disconnecting an institution removes
            its access token; deleting the underlying database row cascades
            to all derived records (accounts, transactions, holdings,
            recurring streams).
          </p>

          <h2 className="text-xl font-semibold pt-4">Plaid</h2>
          <p>
            When connecting a financial institution, you are redirected
            through Plaid&apos;s flow. Plaid&apos;s handling of credentials
            and institution data is governed by Plaid&apos;s own{' '}
            <a
              href="https://plaid.com/legal/#end-user-privacy-policy"
              className="underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              End User Privacy Policy
            </a>
            .
          </p>

          <h2 className="text-xl font-semibold pt-4">Contact</h2>
          <p>
            Questions: <a className="underline underline-offset-4" href="mailto:davis.connor208@gmail.com">davis.connor208@gmail.com</a>.
          </p>
        </section>

        <footer className="pt-8 border-t border-border">
          <Link
            href="/"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            ← Back home
          </Link>
        </footer>
      </article>
    </main>
  );
}
