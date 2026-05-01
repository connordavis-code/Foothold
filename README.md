# Personal Finance Tool

Standalone web app for tracking income, expenses, subscriptions, and brokerage
investments (via Plaid). Goal-oriented coaching, recurring expense detection,
and predictive cash-flow forecasting.

**Stack:** Next.js 14 · TypeScript · Tailwind · shadcn/ui · Drizzle ORM ·
Supabase Postgres · Auth.js · Plaid (Transactions + Investments) · Anthropic
API (optional) · Recharts · Vercel

---

## Phase 0 — Account Setup

Before the app can do anything useful you need four (technically three) accounts.
All have free tiers sufficient for personal use.

### 1. Plaid (financial data) — required

1. Go to <https://dashboard.plaid.com/signup> and create an account.
2. In the dashboard:
   - **Team Settings → Keys** — copy your `client_id` and **Sandbox** `secret`.
     (Sandbox = fake test data. Development comes later, gives you 100 real-bank items.)
   - **Team Settings → Products** — make sure **Transactions** AND
     **Investments** are both enabled.
3. Save the keys for later — they go into `.env.local`.

### 2. Supabase (database) — required

1. Go to <https://supabase.com> and create an account / project.
2. Pick the region closest to where you'll deploy (e.g. `us-east-1` for Vercel
   default).
3. After it provisions, go to **Project Settings → Database** and copy:
   - The **Transaction pooler** connection string → `DATABASE_URL`
   - The **direct** connection string (port 5432) → `DIRECT_DATABASE_URL`
4. The free tier is 500 MB — fine for years of personal data.

### 3. Vercel (hosting) — required

1. Sign up at <https://vercel.com> with your GitHub account.
2. We'll connect a repo to it in Phase 5; for now, just having an account is
   enough.

### 4. Anthropic API (Phase 3 coaching) — optional, can defer

1. Sign up at <https://console.anthropic.com>.
2. Add a payment method and create an API key.
3. Personal use will run ~$5–15/month.
4. **Skip this for now** if you want — the AI coaching layer comes online in
   Phase 3; until then nothing in the app uses it.

### 5. Resend (auth magic-link emails) — required for Phase 1

1. Sign up at <https://resend.com>.
2. Free tier = 3,000 emails/month.
3. Get your API key for Auth.js email magic-links.

---

## Local development setup

Once you have the accounts above:

```bash
# 1. Install dependencies
npm install

# 2. Copy the env file
cp .env.example .env.local

# 3. Open .env.local and fill in:
#    - DATABASE_URL + DIRECT_DATABASE_URL (from Supabase)
#    - AUTH_SECRET (run: openssl rand -base64 32)
#    - AUTH_RESEND_KEY + AUTH_EMAIL_FROM (from Resend)
#    - PLAID_CLIENT_ID + PLAID_SECRET (from Plaid)
#    - ANTHROPIC_API_KEY (optional, leave blank for now)

# 4. Run dev server
npm run dev

# 5. (Phase 1+) Run database migrations
npm run db:push
```

Open <http://localhost:3000> — you should see the Phase 0 landing page.

---

## Production deploy (later, Phase 5)

```bash
# Push to GitHub, then in Vercel:
# 1. Import the repo
# 2. Add the same env vars from .env.local under Project Settings → Env Vars
# 3. Deploy
```

A daily Plaid sync runs via Vercel Cron — config arrives in Phase 5.

---

## Project structure

```
finance-tool/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout (fonts, html)
│   │   ├── page.tsx            # Landing page
│   │   └── globals.css         # Tailwind + theme tokens
│   ├── components/
│   │   └── ui/                 # shadcn/ui primitives (added in Phase 1)
│   └── lib/
│       └── utils.ts            # cn(), formatCurrency(), formatPercent()
├── drizzle/                    # Generated SQL migrations (Phase 1+)
├── .env.example                # All env vars documented
├── drizzle.config.ts
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Roadmap

- **Phase 0** — scaffold, accounts ✅
- **Phase 1.A** ← *you are here* — auth, schema, magic-link login, protected layout
- **Phase 1.B** — Plaid Link, sync endpoints, initial backfill
- **Phase 1.C** — dashboard + investments page with real data, auto-categorization
- **Phase 2** — recurring expense detection, goals, contribution velocity
- **Phase 3** — AI coaching layer (weekly insights, drift detection)
- **Phase 4** — predictive layer (forecasts, what-if simulator)
- **Phase 5** — production deploy, cron jobs, Plaid Production access

---

## Phase 1.A — what you do after extracting the new tarball

```bash
# 1. Extract over the existing folder (your .env.local stays untouched)
tar -xzf finance-tool-phase1a.tar.gz

# 2. Stop the old dev server if it's running (Ctrl+C in the terminal)

# 3. Install (no new top-level deps but lockfile may update)
npm install

# 4. Push the schema to your Supabase database
#    This creates the user / session / plaid_item / financial_account /
#    transaction / security / holding / etc. tables.
npm run db:push

# 5. Run the dev server again
npm run dev

# 6. In your browser:
#    - Visit http://localhost:3000  →  middleware redirects to /login
#    - Enter the email you used to sign up to Resend
#    - Click "Send magic link"
#    - Check your inbox, click the link
#    - You should land on /dashboard with "Welcome" + your email shown
```

If `db:push` fails: usually means `DIRECT_DATABASE_URL` is wrong. Drizzle-kit
needs the **direct** (non-pooler) connection string for migrations. Open
`.env.local` and verify it points at port `5432`, not `6543`.

If the magic-link email doesn't arrive: check Resend's logs at
<https://resend.com/emails>. Remember the sandbox sender (`onboarding@resend.dev`)
will only deliver to the email you signed up to Resend with.

---

## Why these choices?

- **Next.js + Vercel** — same vendor, zero-config deploys, server actions
  eliminate API boilerplate.
- **Supabase** — managed Postgres with free tier and built-in row-level security
  (RLS) — important when storing financial data.
- **Drizzle (over Prisma)** — lighter, no codegen step, type-safe SQL.
- **Plaid** — industry standard, supports Fidelity Investments out of the box.
- **shadcn/ui** — copy-paste components you own, easy to customize.
- **Auth.js with magic-link** — no passwords to manage, single-user friendly.
