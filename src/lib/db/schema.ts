import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AdapterAccount } from 'next-auth/adapters';
import type { MonthlyProjection, ScenarioOverrides } from '@/lib/forecast/types';

/**
 * Convention for this file:
 *   - All timestamp columns use `timestamp with time zone` (`withTimezone: true`)
 *     so cross-tz Plaid data and DST boundaries don't silently drift.
 *   - `date(...)` is used for calendar dates (transaction date, price-as-of)
 *     where time-of-day is irrelevant.
 *   - `mode: 'date'` keeps the JS-side type as `Date` rather than string.
 */
const ts = (name: string) =>
  timestamp(name, { mode: 'date', withTimezone: true });

// =============================================================================
// Auth.js tables (managed by @auth/drizzle-adapter)
// =============================================================================
// These follow the exact shape Auth.js expects. Renaming is risky — leave them.

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique().notNull(),
  emailVerified: ts('email_verified'),
  image: text('image'),
  createdAt: ts('created_at').defaultNow().notNull(),
});

export const authAccounts = pgTable(
  'auth_account',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccount['type']>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    pk: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const sessions = pgTable('session', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: ts('expires').notNull(),
});

export const verificationTokens = pgTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: ts('expires').notNull(),
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

// =============================================================================
// Plaid + financial data
// =============================================================================

/**
 * Provider-agnostic external connection (Plaid bank/credit, SnapTrade
 * brokerage, etc.). One row per institution connection per provider.
 * `provider` is the discriminator that drives sync orchestration.
 *
 * Per-provider mutable state (Plaid /transactions/sync cursor, SnapTrade
 * brokerage authorization metadata, etc.) lives in `providerState` JSONB
 * so the row shape stays stable as new providers are added.
 *
 * `secret` carries whatever long-lived encrypted credential the provider
 * requires. Plaid → access_token. SnapTrade → userSecret. AES-256-GCM via
 * [src/lib/crypto.ts]; encrypt at write in the connect handler, decrypt at
 * read in the provider's sync orchestrator (single boundary).
 */
export const externalItems = pgTable('external_item', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // 'plaid' | 'snaptrade'
  provider: text('provider').notNull(),
  // Provider's identifier for this connection. Plaid → item_id.
  // SnapTrade → brokerageAuthorizationId. UUIDs from SnapTrade and
  // Plaid-namespaced ids from Plaid don't collide.
  providerItemId: text('provider_item_id').unique().notNull(),
  // Plaid → ins_*. SnapTrade → brokerage slug. Optional (some providers
  // don't surface a stable institution id).
  providerInstitutionId: text('provider_institution_id'),
  institutionName: text('institution_name'),
  // Encrypted long-lived credential. See header comment.
  // Nullable: SnapTrade rows leave this NULL because their per-user
  // `userSecret` lives on `snaptrade_user` (1:1 with users.id) — the
  // credential isn't per-connection there. Plaid rows always set it
  // (per-item access_token).
  secret: text('secret'),
  // Per-provider mutable state. Plaid carries `transactionsCursor` here.
  // Always non-null (defaults to empty object) so readers can index in
  // without a null guard.
  providerState: jsonb('provider_state').notNull().default({}),
  // 'active' | 'login_required' | 'pending_expiration' | 'permission_revoked'
  // | 'error'. Driven by provider webhooks; surfaces the reauth banner.
  // Sync dispatcher only runs on 'active' rows.
  status: text('status').notNull().default('active'),
  createdAt: ts('created_at').defaultNow().notNull(),
  lastSyncedAt: ts('last_synced_at'),
});

/**
 * Plaid's "accounts" — checking, savings, credit cards, brokerages, 401k, etc.
 * One Plaid item can expose many accounts.
 */
export const financialAccounts = pgTable('financial_account', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  itemId: text('item_id')
    .notNull()
    .references(() => externalItems.id, { onDelete: 'cascade' }),
  providerAccountId: text('provider_account_id').unique().notNull(),
  name: text('name').notNull(),
  officialName: text('official_name'),
  mask: text('mask'),
  // depository | credit | investment | loan | other
  type: text('type').notNull(),
  // checking | savings | credit_card | brokerage | 401k | ira | etc.
  subtype: text('subtype'),
  currentBalance: numeric('current_balance', { precision: 14, scale: 2 }),
  availableBalance: numeric('available_balance', { precision: 14, scale: 2 }),
  isoCurrencyCode: text('iso_currency_code').default('USD'),
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at').defaultNow().notNull(),
});

/**
 * User-defined categories (overlay on top of Plaid PFC). System categories
 * (userId IS NULL) seeded from Plaid PFC taxonomy in Phase 1.C.
 *
 * Declared above `transactions` so the FK on `categoryOverrideId` resolves
 * at module evaluation time. `parentCategoryId` self-references via the
 * AnyPgColumn workaround for forward references.
 */
export const categories = pgTable('category', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  color: text('color'),
  budgetMonthly: numeric('budget_monthly', { precision: 14, scale: 2 }),
  isDiscretionary: boolean('is_discretionary').notNull().default(false),
  parentCategoryId: text('parent_category_id').references(
    (): AnyPgColumn => categories.id,
    { onDelete: 'set null' },
  ),
  createdAt: ts('created_at').defaultNow().notNull(),
});

/**
 * Bank/credit transactions. Investment transactions live in their own table.
 */
export const transactions = pgTable(
  'transaction',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text('account_id')
      .notNull()
      .references(() => financialAccounts.id, { onDelete: 'cascade' }),
    plaidTransactionId: text('plaid_transaction_id').unique().notNull(),
    // Plaid: positive = money OUT (debit), negative = money IN (credit).
    // We store as Plaid reports it; we'll flip the sign for display.
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    isoCurrencyCode: text('iso_currency_code').default('USD'),
    date: date('date').notNull(),
    authorizedDate: date('authorized_date'),
    name: text('name').notNull(),
    merchantName: text('merchant_name'),
    pending: boolean('pending').notNull().default(false),
    // Plaid Personal Finance Category (PFC)
    primaryCategory: text('primary_category'),
    detailedCategory: text('detailed_category'),
    // User-overridden category (FK to categories table)
    categoryOverrideId: text('category_override_id').references(
      () => categories.id,
      { onDelete: 'set null' },
    ),
    paymentChannel: text('payment_channel'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index('transaction_account_idx').on(t.accountId),
    dateIdx: index('transaction_date_idx').on(t.date),
  }),
);

/**
 * Master list of securities (stocks, ETFs, mutual funds, bonds, cash, crypto).
 * Shared across users — populated from Plaid as we encounter them in holdings.
 */
export const securities = pgTable('security', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  providerSecurityId: text('provider_security_id').unique().notNull(),
  ticker: text('ticker'),
  name: text('name'),
  // equity | etf | mutual_fund | fixed_income | cash | crypto | derivative | other
  type: text('type'),
  cusip: text('cusip'),
  isin: text('isin'),
  closePrice: numeric('close_price', { precision: 14, scale: 4 }),
  closePriceAsOf: date('close_price_as_of'),
  isoCurrencyCode: text('iso_currency_code').default('USD'),
  updatedAt: ts('updated_at').defaultNow().notNull(),
});

/**
 * Current positions per investment account. Updated on each /investments
 * sync — Plaid returns the full snapshot, we upsert.
 */
export const holdings = pgTable(
  'holding',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text('account_id')
      .notNull()
      .references(() => financialAccounts.id, { onDelete: 'cascade' }),
    securityId: text('security_id')
      .notNull()
      .references(() => securities.id, { onDelete: 'cascade' }),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    // INVARIANT: total cost basis for the position (price-paid * units),
    // NOT the per-share average. Plaid reports it as a total directly;
    // SnapTrade reports `average_purchase_price` per-share, so the
    // SnapTrade sync multiplies by units before writing here.
    // /investments computes (institutionValue − costBasis) / costBasis
    // for the % return; mismatched units produce 1000%+ nonsense.
    costBasis: numeric('cost_basis', { precision: 14, scale: 2 }),
    institutionValue: numeric('institution_value', {
      precision: 14,
      scale: 2,
    }),
    institutionPrice: numeric('institution_price', {
      precision: 14,
      scale: 4,
    }),
    institutionPriceAsOf: date('institution_price_as_of'),
    isoCurrencyCode: text('iso_currency_code').default('USD'),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (h) => ({
    accountSecurityUnique: uniqueIndex('holding_account_security_idx').on(
      h.accountId,
      h.securityId,
    ),
  }),
);

// =============================================================================
// Goals
// =============================================================================

/**
 * User-defined goals. Two underlying types cover the common cases:
 *
 *   - `savings`: accumulate to `target_amount` across `account_ids`.
 *     Examples: emergency fund, investing target, skill-building budget.
 *
 *   - `spend_cap`: keep monthly spend in `category_filter` (and optionally
 *     in `account_ids`) under `monthly_amount`. Discretionary cap.
 *
 * Type-specific columns are nullable; the page-level form decides which
 * to render based on `type`.
 */
export const goals = pgTable('goal', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // 'savings' | 'spend_cap'
  type: text('type').notNull(),
  // For savings goals: dollar amount to accumulate
  targetAmount: numeric('target_amount', { precision: 14, scale: 2 }),
  // For spend_cap goals: monthly limit
  monthlyAmount: numeric('monthly_amount', { precision: 14, scale: 2 }),
  // For savings: which financial_account.id values count toward progress.
  // For spend_cap: optional account scope. Stored as text[]; we don't FK
  // these at the row level because Postgres can't FK array elements.
  // Stale ids are filtered out when computing progress.
  accountIds: text('account_ids').array(),
  // For spend_cap: optional Plaid PFC primary_category filter (e.g.,
  // ['FOOD_AND_DRINK', 'ENTERTAINMENT'] for a "fun money" cap). NULL
  // means "all categories".
  categoryFilter: text('category_filter').array(),
  // Optional "by when" date for savings goals
  targetDate: date('target_date'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at').defaultNow().notNull(),
});

/**
 * Recurring transaction streams detected by Plaid (subscriptions, payroll,
 * rent, etc.). Populated from /transactions/recurring/get.
 *
 * Plaid emits two kinds of streams: "inflow" (income / refunds) and
 * "outflow" (subscriptions / bills). Both are stored here, distinguished
 * by the `direction` column.
 *
 * `status` reflects Plaid's confidence: MATURE (proven recurring),
 * EARLY_DETECTION (likely but not confirmed), TOMBSTONED (cancelled).
 */
export const recurringStreams = pgTable('recurring_stream', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  itemId: text('item_id')
    .notNull()
    .references(() => externalItems.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => financialAccounts.id, { onDelete: 'cascade' }),
  plaidStreamId: text('plaid_stream_id').unique().notNull(),
  // 'inflow' | 'outflow'
  direction: text('direction').notNull(),
  description: text('description'),
  merchantName: text('merchant_name'),
  // WEEKLY | BIWEEKLY | SEMI_MONTHLY | MONTHLY | ANNUALLY | UNKNOWN
  frequency: text('frequency').notNull(),
  // Plaid: positive = money OUT (outflow stream's natural sign).
  averageAmount: numeric('average_amount', { precision: 14, scale: 2 }),
  lastAmount: numeric('last_amount', { precision: 14, scale: 2 }),
  firstDate: date('first_date'),
  lastDate: date('last_date'),
  predictedNextDate: date('predicted_next_date'),
  isActive: boolean('is_active').notNull().default(true),
  // MATURE | EARLY_DETECTION | TOMBSTONED
  status: text('status').notNull(),
  primaryCategory: text('primary_category'),
  detailedCategory: text('detailed_category'),
  isoCurrencyCode: text('iso_currency_code').default('USD'),
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at').defaultNow().notNull(),
});

/**
 * Buys, sells, dividends, fees, transfers — anything that hits an investment
 * account. Plaid /investments/transactions returns these.
 */
export const investmentTransactions = pgTable(
  'investment_transaction',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text('account_id')
      .notNull()
      .references(() => financialAccounts.id, { onDelete: 'cascade' }),
    securityId: text('security_id').references(() => securities.id, {
      onDelete: 'set null',
    }),
    providerInvestmentTransactionId: text('provider_investment_transaction_id')
      .unique()
      .notNull(),
    // Plaid: positive = cash OUT of account, negative = cash IN.
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 6 }),
    price: numeric('price', { precision: 14, scale: 4 }),
    fees: numeric('fees', { precision: 14, scale: 2 }),
    date: date('date').notNull(),
    name: text('name'),
    // buy | sell | cash | transfer | fee | tax | cancel
    type: text('type'),
    // dividend | qualified | non-qualified | etc.
    subtype: text('subtype'),
    isoCurrencyCode: text('iso_currency_code').default('USD'),
    createdAt: ts('created_at').defaultNow().notNull(),
  },
  (it) => ({
    accountIdx: index('investment_transaction_account_idx').on(it.accountId),
    dateIdx: index('investment_transaction_date_idx').on(it.date),
  }),
);

/**
 * AI-generated weekly insights. One row per (user, week_start) — the unique
 * index is the natural cache key. The "Generate insights" button always
 * upserts (ON CONFLICT DO UPDATE), so the row reflects the most recent
 * generation for that week. Page load reads the row directly.
 */
export const insights = pgTable(
  'insight',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekStart: date('week_start').notNull(),
    weekEnd: date('week_end').notNull(),
    narrative: text('narrative').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    generatedAt: ts('generated_at').notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at').defaultNow().notNull(),
  },
  (i) => ({
    userWeekUnique: uniqueIndex('insight_user_week_idx').on(
      i.userId,
      i.weekStart,
    ),
  }),
);

// =============================================================================
// Operational telemetry (Phase 5: cron + monitoring)
// =============================================================================

/**
 * Cross-cutting log table. Two row shapes share the schema:
 *   - level='error': failures from sync, webhooks, plaid actions, cron jobs
 *   - level='info':  cron run summaries — so the digest can distinguish
 *                    "all clear" from "the cron didn't run at all"
 *
 * Daily Resend digest scans the last 24h. We index on occurred_at desc since
 * every read is "what happened recently."
 *
 * `external_item_id` uses ON DELETE SET NULL because losing an item shouldn't
 * blow away its error history — operators may want to audit why an item
 * was disconnected after the fact.
 */
export const errorLog = pgTable(
  'error_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    occurredAt: ts('occurred_at').defaultNow().notNull(),
    // 'error' | 'info'
    level: text('level').notNull(),
    // e.g. 'cron.nightly_sync', 'webhook.transactions', 'sync.investments'
    op: text('op').notNull(),
    externalItemId: text('external_item_id').references(() => externalItems.id, {
      onDelete: 'set null',
    }),
    message: text('message').notNull(),
    // For errors: { stack, plaid_error_code, ... }
    // For run summaries: { duration_ms, items_synced, txns_added, ... }
    context: jsonb('context'),
  },
  (e) => ({
    occurredAtIdx: index('error_log_occurred_at_idx').on(e.occurredAt),
    // Phase 3 sync-health query reads "last success/failure per item per
    // op" via predicates of the shape `WHERE external_item_id = ? AND
    // op = ? AND level = ? ORDER BY occurred_at DESC LIMIT 1`. The
    // composite leading on (external_item_id, op) gives an index seek
    // straight to the relevant rows; trailing occurred_at supports the
    // DESC LIMIT 1 without a separate sort.
    itemOpOccurredIdx: index('error_log_item_op_occurred_idx').on(
      e.externalItemId,
      e.op,
      e.occurredAt,
    ),
  }),
);

/**
 * Named what-if scenarios for the cash forecast simulator (Phase 4).
 *
 * Each scenario is a persistent override bag — a JSON object that the
 * forecast engine layers on top of the user's baseline projection.
 * Baseline = absence of overrides (no `is_baseline` flag, intentional).
 * The user can save and reload scenarios to compare decisions over time.
 */
export const scenarios = pgTable(
  'scenario',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    overrides: jsonb('overrides').$type<ScenarioOverrides>().notNull().default({}),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    userUpdatedIdx: index('scenario_user_updated_at_idx').on(t.userId, t.updatedAt.desc()),
  }),
);

export type Scenario = typeof scenarios.$inferSelect;
export type ScenarioInsert = typeof scenarios.$inferInsert;

/**
 * AI-generated coaching narrative cache for forecast scenarios (Phase 4).
 *
 * `inputHash` is a SHA-256 of the prompt input (serialized overrides +
 * a history fingerprint truncated to today's date). Re-rendering the same
 * scenario on the same day → cache hit. Editing overrides or new
 * transactions syncing → hash changes → cache miss → regenerate.
 *
 * Unique on (scenarioId, inputHash). Cascade-deletes with the scenario.
 */
export const forecastNarratives = pgTable(
  'forecast_narrative',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scenarioId: text('scenario_id')
      .notNull()
      .references(() => scenarios.id, { onDelete: 'cascade' }),
    inputHash: text('input_hash').notNull(),
    narrative: text('narrative').notNull(),
    generatedAt: ts('generated_at').notNull().defaultNow(),
  },
  (t) => ({
    scenarioHashIdx: uniqueIndex('forecast_narrative_scenario_hash_idx').on(t.scenarioId, t.inputHash),
  }),
);

export type ForecastNarrative = typeof forecastNarratives.$inferSelect;
export type ForecastNarrativeInsert = typeof forecastNarratives.$inferInsert;

/**
 * Daily snapshot of each user's BASELINE forecast projection (no overrides).
 * Phase 1 simulator reorientation, PR 2 of 5.
 *
 * Two consumers planned:
 *   - **Backtest accuracy** — "30 days ago we predicted $X for today;
 *     actual is $Y; variance Z%." Compares row[idx_for_today].endCash from
 *     a 30-day-old snapshot against today's net worth. Calendar-gated:
 *     UI ships ~30 days after this table starts accumulating rows.
 *   - **Dashboard trajectory line** — 90 days back from `forecastSnapshots`
 *     (each row's `baselineProjection[0].endCash` is that day's start cash)
 *     plus 90 days forward from a fresh `projectCash()` call.
 *
 * Storage shape: full `MonthlyProjection[]` rather than just
 * `{month, endCash}[]`. JSONB cost is trivial (24 rows × ~5 fields per row),
 * and storing the full projection means future analyses (per-category
 * spend trajectory, inflow/outflow shape) don't require a schema migration.
 * `goalImpacts` is excluded because it cross-references `goal.id` which
 * may not exist at backtest time.
 *
 * Unique on (userId, snapshotDate) — at most one row per user per day.
 * The cron upserts so re-runs within the same day overwrite (idempotent).
 *
 * `snapshotDate` is a calendar `date` derived in UTC at cron-run time.
 * Vercel crons run in UTC, so this is the natural anchor.
 */
export const forecastSnapshots = pgTable(
  'forecast_snapshot',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    baselineProjection: jsonb('baseline_projection')
      .$type<MonthlyProjection[]>()
      .notNull(),
    generatedAt: ts('generated_at').notNull().defaultNow(),
  },
  (t) => ({
    userDateUnique: uniqueIndex('forecast_snapshot_user_date_idx').on(
      t.userId,
      t.snapshotDate,
    ),
  }),
);

export type ForecastSnapshot = typeof forecastSnapshots.$inferSelect;
export type ForecastSnapshotInsert = typeof forecastSnapshots.$inferInsert;

/**
 * SnapTrade per-user credential. SnapTrade's auth model is per-USER
 * (one userSecret per Foothold user), not per-connection like Plaid's
 * access_token. So the credential lives here, 1:1 with users.id, and
 * external_item rows for SnapTrade leave .secret NULL.
 *
 * `snaptrade_user_id` is the immutable id we hand SnapTrade at register
 * time — we use users.id directly (already a UUID and immutable). Stored
 * here for clarity and so SnapTrade SDK calls don't have to re-derive it.
 *
 * `snaptrade_user_secret` is the long-lived credential SnapTrade returns
 * on registration. AES-256-GCM encrypted at rest via [src/lib/crypto.ts]
 * (same shared key as Plaid access_tokens — rotation forces reconnects
 * across both providers).
 */
export const snaptradeUsers = pgTable('snaptrade_user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  snaptradeUserId: text('snaptrade_user_id').notNull(),
  snaptradeUserSecret: text('snaptrade_user_secret').notNull(),
  createdAt: ts('created_at').defaultNow().notNull(),
});

// =============================================================================
// Type exports — convenient for queries
// =============================================================================

export type User = typeof users.$inferSelect;
export type ExternalItem = typeof externalItems.$inferSelect;
export type SnaptradeUser = typeof snaptradeUsers.$inferSelect;
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Security = typeof securities.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type InvestmentTransaction = typeof investmentTransactions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type RecurringStream = typeof recurringStreams.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type ErrorLog = typeof errorLog.$inferSelect;
