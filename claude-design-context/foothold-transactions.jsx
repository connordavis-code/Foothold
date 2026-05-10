/* global React, Icon */
const { useState: useTxState, useMemo: useTxMemo } = React;

// ============================================================
// Transactions — every charge, every credit.
// Grouped by date. Inline category chip. Account column.
// ============================================================

const TX_DATA = [
  { d: 'May 11', day: 'Sun', desc: 'Trader Joe\'s',         raw: 'TRADER JOES #532',     cat: 'Groceries',       acct: 'Chase ··4221', amt: -67.42 },
  { d: 'May 11', day: 'Sun', desc: 'Sweetgreen',            raw: 'SWEETGREEN BACK BAY',  cat: 'Food and Drink',  acct: 'Amex ··1009',  amt: -16.85 },
  { d: 'May 10', day: 'Sat', desc: 'Mass Audubon',          raw: 'MASS AUDUBON',         cat: 'Donations',       acct: 'Chase ··4221', amt: -50.00 },
  { d: 'May 10', day: 'Sat', desc: 'Star Market',           raw: 'STAR MARKET #142',     cat: 'Groceries',       acct: 'Chase ··4221', amt: -94.18 },
  { d: 'May 09', day: 'Fri', desc: 'Mobile Payment',        raw: 'AMEX MOBILE PMT',      cat: 'Loan Payments',   acct: 'Chase ··4221', amt: 148.77, kind: 'transfer' },
  { d: 'May 08', day: 'Thu', desc: 'PADDLECOM',             raw: 'PADDLE.COM',           cat: 'General Services',acct: 'Amex ··1009',  amt: -100.00, flagged: true },
  { d: 'May 08', day: 'Thu', desc: 'Chipotle',              raw: 'CHIPOTLE 0834',        cat: 'Food and Drink',  acct: 'Amex ··1009',  amt: -15.83 },
  { d: 'May 08', day: 'Thu', desc: 'CVS',                   raw: 'CVS PHARMACY',         cat: 'Medical',         acct: 'Amex ··1009',  amt: -22.40 },
  { d: 'May 07', day: 'Wed', desc: 'Target',                raw: 'TARGET 00001234',      cat: 'General Merchandise', acct: 'Chase ··4221', amt: -48.76 },
  { d: 'May 07', day: 'Wed', desc: 'Digital Dreams',        raw: 'DIGITAL DREAMS PAYROLL', cat: 'Income',        acct: 'Chase ··4221', amt: 2075.99, income: true },
  { d: 'May 06', day: 'Tue', desc: 'Kaiser',                raw: 'KAISER PERMANENTE',    cat: 'Medical',         acct: 'Chase ··4221', amt: -338.69 },
  { d: 'May 06', day: 'Tue', desc: 'Spotify',               raw: 'SPOTIFY USA',          cat: 'Subscription',    acct: 'Amex ··1009',  amt: -16.99, recurring: true },
  { d: 'May 05', day: 'Mon', desc: 'Blue Bottle',           raw: 'BLUE BOTTLE COFFEE',   cat: 'Food and Drink',  acct: 'Amex ··1009',  amt: -7.25 },
  { d: 'May 05', day: 'Mon', desc: 'Lyft',                  raw: 'LYFT *RIDE TUE',       cat: 'Transportation',  acct: 'Amex ··1009',  amt: -18.40 },
  { d: 'May 04', day: 'Sun', desc: 'Whole Foods',           raw: 'WHOLE FOODS MKT',      cat: 'Groceries',       acct: 'Chase ··4221', amt: -112.06 },
  { d: 'May 04', day: 'Sun', desc: 'Wealthfront',           raw: 'WEALTHFRONT TRANSFER', cat: 'Transfer',        acct: 'Chase ··4221', amt: -500.00, kind: 'transfer' },
  { d: 'May 03', day: 'Sat', desc: 'REI',                   raw: 'REI #91',              cat: 'General Merchandise', acct: 'Chase ··4221', amt: -84.99 },
  { d: 'May 02', day: 'Fri', desc: 'Eversource',            raw: 'EVERSOURCE PMT',       cat: 'Utilities',       acct: 'Chase ··4221', amt: -142.00, recurring: true },
  { d: 'May 02', day: 'Fri', desc: 'Patreon',               raw: 'PATREON.COM',          cat: 'Subscription',    acct: 'Amex ··1009',  amt: -12.00, recurring: true },
  { d: 'May 01', day: 'Thu', desc: 'Rent · 412 Beacon',     raw: 'BEACON HILL PROP',     cat: 'Housing',         acct: 'Chase ··4221', amt: -2400.00, recurring: true },
];

const CATEGORIES = ['All', 'Groceries', 'Food and Drink', 'Housing', 'Subscription', 'Utilities', 'Medical', 'Transportation', 'Income', 'Transfer'];
const ACCOUNTS = ['All accounts', 'Chase ··4221', 'Amex ··1009'];

function CategoryChip({ name }) {
  // Color hash to a small palette so categories are quickly recognizable but quiet
  const palette = {
    'Groceries':      { bg: 'rgba(168, 194, 152, 0.14)', fg: 'var(--accent-strong)' },
    'Food and Drink': { bg: 'rgba(192, 138, 79, 0.12)',  fg: '#c08a4f' },
    'Housing':        { bg: 'rgba(125, 144, 173, 0.14)', fg: '#9aacc4' },
    'Subscription':   { bg: 'rgba(168, 194, 152, 0.10)', fg: 'var(--text-2)' },
    'Utilities':      { bg: 'rgba(125, 144, 173, 0.12)', fg: '#9aacc4' },
    'Medical':        { bg: 'rgba(192, 138, 79, 0.10)',  fg: '#c08a4f' },
    'Transportation': { bg: 'rgba(125, 144, 173, 0.10)', fg: '#9aacc4' },
    'Income':         { bg: 'rgba(168, 194, 152, 0.20)', fg: 'var(--accent-strong)' },
    'Transfer':       { bg: 'var(--hairline)', fg: 'var(--text-2)' },
    'Donations':      { bg: 'rgba(168, 194, 152, 0.14)', fg: 'var(--accent-strong)' },
    'Loan Payments':  { bg: 'var(--hairline)', fg: 'var(--text-2)' },
    'General Merchandise': { bg: 'var(--hairline)', fg: 'var(--text-2)' },
    'General Services':    { bg: 'rgba(192, 138, 79, 0.10)', fg: '#c08a4f' },
  };
  const p = palette[name] || palette['Transfer'];
  return <span className="tx-chip" style={{ background: p.bg, color: p.fg }}>{name}</span>;
}

function TxRow({ t }) {
  const isPos = t.amt > 0;
  const sign = isPos ? '+' : '−';
  return (
    <li className="tx-row">
      <div className="tx-day"><div className="num">{t.d.split(' ')[1]}</div><div className="day">{t.day}</div></div>
      <div className="tx-desc-col">
        <div className="tx-desc">{t.desc}</div>
        <div className="tx-raw">{t.raw}</div>
      </div>
      <div className="tx-cat-col"><CategoryChip name={t.cat} /></div>
      <div className="tx-acct">{t.acct}</div>
      <div className={`tx-amt num ${isPos ? 'pos' : ''}`}>
        {sign}${Math.abs(t.amt).toFixed(2)}
      </div>
      <div className="tx-flags">
        {t.recurring && <span className="tx-flag" title="Recurring"><Icon name="refresh" size={12} /></span>}
        {t.flagged   && <span className="tx-flag flagged" title="Flagged by Drift">!</span>}
        {t.kind === 'transfer' && <span className="tx-flag" title="Transfer">⇄</span>}
      </div>
    </li>
  );
}

function Transactions() {
  const [q, setQ] = useTxState('');
  const [cat, setCat] = useTxState('All');
  const [acct, setAcct] = useTxState('All accounts');

  const filtered = useTxMemo(() => {
    return TX_DATA.filter((t) => {
      if (q && !(`${t.desc} ${t.raw} ${t.cat}`.toLowerCase().includes(q.toLowerCase()))) return false;
      if (cat !== 'All' && t.cat !== cat) return false;
      if (acct !== 'All accounts' && t.acct !== acct) return false;
      return true;
    });
  }, [q, cat, acct]);

  // group by date
  const groups = useTxMemo(() => {
    const out = {};
    filtered.forEach((t) => { if (!out[t.d]) out[t.d] = []; out[t.d].push(t); });
    return out;
  }, [filtered]);

  // Summary
  const monthSpend  = TX_DATA.filter((t) => t.amt < 0 && t.kind !== 'transfer').reduce((s, t) => s + Math.abs(t.amt), 0);
  const monthIncome = TX_DATA.filter((t) => t.income).reduce((s, t) => s + t.amt, 0);
  const monthNet = monthIncome - monthSpend;

  return (
    <div className="page transactions-page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Records</div>
          <h1 className="page-title">Transactions</h1>
        </div>
      </div>
      <p className="page-sub" style={{ margin: '0 clamp(20px, 4vw, 40px) 28px', maxWidth: 540 }}>
        Every charge, every credit. Searchable, filterable, accountable.
      </p>

      <div className="tx-summary">
        <div className="tx-summary-block">
          <div className="smallcaps">Spend · May</div>
          <div className="tx-summary-num num">${monthSpend.toFixed(2)}</div>
          <div className="tx-summary-sub">across {TX_DATA.filter((t) => t.amt < 0 && t.kind !== 'transfer').length} charges</div>
        </div>
        <div className="tx-summary-block">
          <div className="smallcaps">Income · May</div>
          <div className="tx-summary-num num pos">${monthIncome.toFixed(2)}</div>
          <div className="tx-summary-sub">1 deposit</div>
        </div>
        <div className="tx-summary-block">
          <div className="smallcaps">Net · May</div>
          <div className={`tx-summary-num num ${monthNet >= 0 ? 'pos' : ''}`}>{monthNet >= 0 ? '+' : '−'}${Math.abs(monthNet).toFixed(2)}</div>
          <div className="tx-summary-sub">{monthNet >= 0 ? 'spending less than earned' : 'spending more than earned'}</div>
        </div>
        <div className="tx-summary-block">
          <div className="smallcaps">Showing</div>
          <div className="tx-summary-num num">{filtered.length}<span className="goals-summary-of"> / {TX_DATA.length}</span></div>
          <div className="tx-summary-sub">{filtered.length === TX_DATA.length ? 'unfiltered' : 'filtered'}</div>
        </div>
      </div>

      <div className="tx-toolbar">
        <div className="tx-search">
          <Icon name="search" size={13} />
          <input
            placeholder="Search merchant, category, or raw description…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && <button className="tx-clear" onClick={() => setQ('')} aria-label="Clear">✕</button>}
        </div>
        <div className="tx-filters">
          <select className="tx-select" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}
          </select>
          <select className="tx-select" value={acct} onChange={(e) => setAcct(e.target.value)}>
            {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn ghost">More</button>
        </div>
      </div>

      <div className="tx-list-wrap">
        <div className="tx-list-header">
          <div className="smallcaps">Date</div>
          <div className="smallcaps">Merchant</div>
          <div className="smallcaps">Category</div>
          <div className="smallcaps">Account</div>
          <div className="smallcaps amt-col">Amount</div>
          <div></div>
        </div>

        {Object.keys(groups).length === 0 && (
          <div className="tx-empty">
            No matches for "{q}".
          </div>
        )}

        {Object.entries(groups).map(([date, rows]) => {
          const dayNet = rows.reduce((s, r) => s + r.amt, 0);
          return (
            <section key={date} className="tx-group">
              <header className="tx-group-head">
                <span className="tx-group-date">{date} · {rows[0].day}</span>
                <span className="tx-group-net num">{dayNet >= 0 ? '+' : '−'}${Math.abs(dayNet).toFixed(2)}</span>
              </header>
              <ul className="tx-list">
                {rows.map((t, i) => <TxRow key={i} t={t} />)}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Transactions });
