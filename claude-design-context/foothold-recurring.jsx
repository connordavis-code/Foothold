/* global React, Icon, fmtMoney */
const { useState: useRecurringState, useMemo: useRecurringMemo } = React;

// ============================================================
// Recurring — the monthly charges on autopilot.
// Group by next-charge window so the page reads as a calendar
// of upcoming outflows, not just a list.
// ============================================================

const RECURRING_DATA = [
  // This week
  { id: 'netflix',    name: 'Netflix',           cat: 'Streaming',     amt: 15.99,  next: 'Wed May 14', freq: 'monthly',  status: 'active', trend: 'flat' },
  { id: 'patreon',    name: 'Patreon · Kurzgesagt', cat: 'Subscription', amt: 12.00,  next: 'Thu May 15', freq: 'monthly',  status: 'active', trend: 'flat' },
  { id: 'gym',        name: 'Equinox',           cat: 'Fitness',       amt: 248.00, next: 'Sat May 17', freq: 'monthly',  status: 'active', trend: 'up' },
  // Later this month
  { id: 'spotify',    name: 'Spotify Family',    cat: 'Streaming',     amt: 16.99,  next: 'Mon May 19', freq: 'monthly',  status: 'active', trend: 'flat' },
  { id: 'icloud',     name: 'iCloud+ 2TB',       cat: 'Storage',       amt: 9.99,   next: 'Tue May 20', freq: 'monthly',  status: 'active', trend: 'flat' },
  { id: 'verizon',    name: 'Verizon Wireless',  cat: 'Utilities',     amt: 84.00,  next: 'Wed May 21', freq: 'monthly',  status: 'active', trend: 'flat' },
  { id: 'comcast',    name: 'Comcast Internet',  cat: 'Utilities',     amt: 75.00,  next: 'Thu May 22', freq: 'monthly',  status: 'active', trend: 'flat' },
  { id: 'figma',      name: 'Figma Pro',         cat: 'Software',      amt: 15.00,  next: 'Fri May 23', freq: 'monthly',  status: 'active', trend: 'flat' },
  { id: 'gh',         name: 'GitHub Pro',        cat: 'Software',      amt: 4.00,   next: 'Sun May 25', freq: 'monthly',  status: 'active', trend: 'flat' },
  { id: 'aws',        name: 'AWS · personal',    cat: 'Software',      amt: 38.42,  next: 'Mon May 26', freq: 'monthly',  status: 'active', trend: 'up' },
  // Next month
  { id: 'electric',   name: 'Eversource',        cat: 'Utilities',     amt: 142.00, next: 'Sun Jun 01', freq: 'monthly',  status: 'active', trend: 'up' },
  { id: 'rent',       name: 'Rent · 412 Beacon', cat: 'Housing',       amt: 2400.00, next: 'Sun Jun 01', freq: 'monthly', status: 'active', trend: 'flat' },
  { id: 'insurance',  name: 'Geico Auto',        cat: 'Insurance',     amt: 128.00, next: 'Mon Jun 02', freq: 'monthly',  status: 'active', trend: 'flat' },
  { id: 'amex-fee',   name: 'Amex Platinum · annual', cat: 'Fees',     amt: 695.00, next: 'Fri Jul 18', freq: 'annual',   status: 'active', trend: 'flat' },
  // Snoozed / flagged
  { id: 'paddle',     name: 'Paddle.com',        cat: 'Service',       amt: 100.00, next: '—',          freq: 'monthly',  status: 'flagged', trend: 'flat', note: 'Spotted by Drift · not in subscription list' },
  { id: 'medium',     name: 'Medium',            cat: 'Subscription',  amt: 5.00,   next: '—',          freq: 'monthly',  status: 'snoozed', trend: 'flat' },
];

function MerchantGlyph({ name }) {
  // Simple monogram glyph from first letter — placeholder for real merchant logos.
  const letter = name.replace(/^[\W_]+/, '').slice(0, 1).toUpperCase() || '·';
  return <span className="rec-glyph">{letter}</span>;
}

function TrendIcon({ trend }) {
  if (trend === 'up')   return <span className="rec-trend up"   title="Trending up">↗</span>;
  if (trend === 'down') return <span className="rec-trend down" title="Trending down">↘</span>;
  return <span className="rec-trend flat" title="Flat">—</span>;
}

function RecurringRow({ r }) {
  return (
    <li className="rec-row" data-status={r.status}>
      <MerchantGlyph name={r.name} />
      <div className="rec-name-col">
        <div className="rec-name">{r.name}</div>
        <div className="rec-cat">
          {r.cat}
          {r.note && <span className="rec-note"> · {r.note}</span>}
        </div>
      </div>
      <div className="rec-next num">{r.next}</div>
      <div className="rec-freq">{r.freq}</div>
      <div className="rec-amt num">${r.amt.toFixed(2)}</div>
      <div className="rec-trend-col"><TrendIcon trend={r.trend} /></div>
      <div className="rec-actions">
        {r.status === 'active'  && <button className="rec-act" aria-label="Manage"><Icon name="more" size={14} /></button>}
        {r.status === 'flagged' && <span className="rec-pill flagged">flagged</span>}
        {r.status === 'snoozed' && <span className="rec-pill snoozed">snoozed</span>}
      </div>
    </li>
  );
}

function RecurringGroup({ label, sub, items }) {
  if (!items.length) return null;
  const total = items.reduce((s, r) => s + (Number.isFinite(r.amt) ? r.amt : 0), 0);
  return (
    <section className="rec-group">
      <header className="rec-group-head">
        <div>
          <div className="rec-group-label">{label}</div>
          <div className="rec-group-sub">{sub}</div>
        </div>
        <div className="rec-group-total">
          <span className="smallcaps">total</span>
          <span className="num">${total.toFixed(2)}</span>
        </div>
      </header>
      <ul className="rec-list">
        {items.map((r) => <RecurringRow key={r.id} r={r} />)}
      </ul>
    </section>
  );
}

function Recurring() {
  const [filter, setFilter] = useRecurringState('all');

  const filtered = useRecurringMemo(() => {
    if (filter === 'all')    return RECURRING_DATA.filter((r) => r.status === 'active');
    if (filter === 'flagged') return RECURRING_DATA.filter((r) => r.status === 'flagged');
    if (filter === 'snoozed') return RECURRING_DATA.filter((r) => r.status === 'snoozed');
    return RECURRING_DATA;
  }, [filter]);

  const thisWeek    = filtered.filter((r) => r.next.includes('May 1') && (r.next.includes('14') || r.next.includes('15') || r.next.includes('17')));
  const laterMonth  = filtered.filter((r) => r.next.startsWith('Mon May 1') || r.next.startsWith('Tue May 2') || r.next.startsWith('Wed May 2') || r.next.startsWith('Thu May 2') || r.next.startsWith('Fri May 2') || r.next.startsWith('Sun May 2') || r.next.startsWith('Mon May 2'));
  const nextMonth   = filtered.filter((r) => r.next.includes('Jun') || r.next.includes('Jul'));
  const flaggedSnoozed = filtered.filter((r) => r.next === '—');

  // Sums
  const monthlyTotal = RECURRING_DATA
    .filter((r) => r.status === 'active' && r.freq === 'monthly')
    .reduce((s, r) => s + r.amt, 0);
  const activeCount = RECURRING_DATA.filter((r) => r.status === 'active').length;
  const flaggedCount = RECURRING_DATA.filter((r) => r.status === 'flagged').length;
  const annualizedTotal = RECURRING_DATA
    .filter((r) => r.status === 'active')
    .reduce((s, r) => s + (r.freq === 'monthly' ? r.amt * 12 : r.amt), 0);

  return (
    <div className="page recurring-page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Records</div>
          <h1 className="page-title">Recurring</h1>
        </div>
      </div>
      <p className="page-sub" style={{ margin: '0 clamp(20px, 4vw, 40px) 28px', maxWidth: 540 }}>
        The monthly charges that move on autopilot. Cancel, snooze, or watch what's next.
      </p>

      <div className="rec-summary">
        <div className="rec-summary-block primary">
          <div className="smallcaps">Monthly outflow</div>
          <div className="rec-summary-num num">${monthlyTotal.toFixed(2)}</div>
          <div className="rec-summary-sub">${(monthlyTotal / 30).toFixed(2)} / day</div>
        </div>
        <div className="rec-summary-block">
          <div className="smallcaps">Annualized</div>
          <div className="rec-summary-num num">${annualizedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="rec-summary-sub">incl. annual fees</div>
        </div>
        <div className="rec-summary-block">
          <div className="smallcaps">Active</div>
          <div className="rec-summary-num num">{activeCount}</div>
          <div className="rec-summary-sub">{flaggedCount} flagged · 1 snoozed</div>
        </div>
        <div className="rec-summary-block">
          <div className="smallcaps">Next charge</div>
          <div className="rec-summary-num num">Wed May 14</div>
          <div className="rec-summary-sub">Netflix · $15.99</div>
        </div>
      </div>

      <div className="rec-toolbar">
        <div className="rec-tabs">
          {['all', 'flagged', 'snoozed'].map((k) => (
            <button
              key={k}
              className={`rec-tab ${filter === k ? 'active' : ''}`}
              onClick={() => setFilter(k)}
            >
              {k === 'all' ? `Active (${activeCount})` :
               k === 'flagged' ? `Flagged (${flaggedCount})` :
               `Snoozed (1)`}
            </button>
          ))}
        </div>
        <div className="rec-toolbar-actions">
          <button className="btn ghost"><Icon name="search" size={13} /> Find a charge</button>
          <button className="btn"><Icon name="plus" size={13} /> Add manually</button>
        </div>
      </div>

      <div className="rec-list-wrap">
        <div className="rec-list-header">
          <div></div>
          <div className="smallcaps">Merchant</div>
          <div className="smallcaps">Next</div>
          <div className="smallcaps">Frequency</div>
          <div className="smallcaps amt-col">Amount</div>
          <div className="smallcaps">Trend</div>
          <div></div>
        </div>

        {filter === 'all' && (
          <>
            <RecurringGroup label="This week"        sub="3 charges · Wed → Sat" items={thisWeek} />
            <RecurringGroup label="Later this month" sub="Mon May 19 → Mon May 26" items={laterMonth} />
            <RecurringGroup label="Next month"       sub="Jun 01 → Jul 18" items={nextMonth} />
          </>
        )}
        {filter === 'flagged' && (
          <RecurringGroup label="Flagged by Drift"   sub="charges that don't match your subscription list" items={flaggedSnoozed.filter((r) => r.status === 'flagged')} />
        )}
        {filter === 'snoozed' && (
          <RecurringGroup label="Snoozed"            sub="paused — won't count toward your monthly outflow" items={flaggedSnoozed.filter((r) => r.status === 'snoozed')} />
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Recurring });
