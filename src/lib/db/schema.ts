import { sql } from 'drizzle-orm';
import {
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
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
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
  // Plaid access_token — sensitive. Phase 5 will encrypt at rest.
  accessToken: text('access_token').notNull(),
  // Cursor for /transactions/sync incremental sync.
  transactionsCursor: text('transactions_cursor'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastSyncedAt: timestamp('last_synced_at'),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
    categoryOverrideId: text('category_override_id'),
    paymentChannel: text('payment_channel'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (h) => ({
    accountSecurityUnique: uniqueIndex('holding_account_security_idx').on(
      h.accountId,
      h.securityId,
    ),
  }),
);

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
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (it) => ({
    accountIdx: index('investment_transaction_account_idx').on(it.accountId),
    dateIdx: index('investment_transaction_date_idx').on(it.date),
  }),
);

/**
 * User-defined categories (overlay on top of Plaid PFC). System categories
 * (userId IS NULL) seeded from Plaid PFC taxonomy in Phase 1.C.
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
  parentCategoryId: text('parent_category_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
