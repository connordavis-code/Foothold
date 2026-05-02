import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AdapterAccount } from 'next-auth/adapters';

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
 * One row per institution connection. A user can have multiple items
 * (e.g., one for Chase, one for Fidelity, etc.).
 */
export const plaidItems = pgTable('plaid_item', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  plaidItemId: text('plaid_item_id').unique().notNull(),
  plaidInstitutionId: text('plaid_institution_id'),
  institutionName: text('institution_name'),
  // Plaid access_token, encrypted at rest with AES-256-GCM. See
  // [src/lib/crypto.ts]. Encrypted at write in `exchangePublicToken`,
  // decrypted at read in `syncItem` (single boundary).
  accessToken: text('access_token').notNull(),
  // Cursor for /transactions/sync incremental sync.
  transactionsCursor: text('transactions_cursor'),
  // 'active' | 'login_required' | 'pending_expiration' | 'permission_revoked'
  // | 'error'. Driven by Plaid ITEM webhooks; surfaces the reauth banner.
  // syncItem only runs on 'active' rows.
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
    .references(() => plaidItems.id, { onDelete: 'cascade' }),
  plaidAccountId: text('plaid_account_id').unique().notNull(),
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
  plaidSecurityId: text('plaid_security_id').unique().notNull(),
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
    .references(() => plaidItems.id, { onDelete: 'cascade' }),
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
    plaidInvestmentTransactionId: text('plaid_investment_transaction_id')
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
// Type exports — convenient for queries
// =============================================================================

export type User = typeof users.$inferSelect;
export type PlaidItem = typeof plaidItems.$inferSelect;
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Security = typeof securities.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type InvestmentTransaction = typeof investmentTransactions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type RecurringStream = typeof recurringStreams.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Insight = typeof insights.$inferSelect;
