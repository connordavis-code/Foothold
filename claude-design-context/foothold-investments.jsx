/* global React, Icon, splitMoney, genTrajectory */
const { useState: useInvState, useMemo: useInvMemo } = React;

// ============================================================
// Investments — portfolio overview, holdings, allocation, performance
// ============================================================

const HOLDINGS = [
  { sym: 'VTI',  name: 'Vanguard Total Stock Market', acct: 'Wealthfront',  shares: 142.318, price: 268.40, costBasis: 28490.21, kind: 'ETF' },
  { sym: 'VXUS', name: 'Vanguard Total International', acct: 'Wealthfront', shares: 88.420,  price:  64.12, costBasis: 4982.55,  kind: 'ETF' },
  { sym: 'BND',  name: 'Vanguard Total Bond Market',   acct: 'Wealthfront', shares: 51.220,  price:  72.85, costBasis: 4001.40,  kind: 'ETF' },
  { sym: 'VTSAX',name: 'Vanguard Total Stock Idx Adm', acct: 'Fidelity 401k', shares: 38.412, price: 132.91, costBasis: 4392.18, kind: 'Mutual' },
  { sym: 'AAPL', name: 'Apple Inc.',                   acct: 'Robinhood',     shares: 14.000, price: 218.40, costBasis: 1842.00,  kind: 'Stock' },
  { sym: 'BRK.B',name: 'Berkshire Hathaway B',         acct: 'Robinhood',     shares:  6.000, price: 462.18, costBasis: 2440.10,  kind: 'Stock' },
  { sym: 'CASH', name: 'Cash sweep',                   acct: 'Wealthfront',   shares: 1842.91,price:   1.00, costBasis: 1842.91,  kind: 'Cash' },
];

const ALLOC_PALETTE = {
  'US Stocks':            'var(--accent-strong)',
  'International Stocks': '#9aacc4',
  'Bonds':                '#c08a4f',
  'Cash':                 'var(--text-3)',
};

function classify(sym) {
  if (sym === 'VTI' || sym === 'VTSAX' || sym === 'AAPL' || sym === 'BRK.B') return 'US Stocks';
  if (sym === 'VXUS') return 'International Stocks';
  if (sym === 'BND') return 'Bonds';
  return 'Cash';
}

function PerformanceChart({ data, totalReturn }) {
  const W = 1000, H = 200;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = (max - min) * 0.1;
  const lo = min - pad, hi = max + pad;
  const x = (i) => (i / (data.length - 1)) * W;
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="inv-chart-svg">
      <defs>
        <linearGradient id="invFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#invFill)"/>
      <path d={line} fill="none" stroke="var(--accent-strong)" strokeWidth="1.6" />
    </svg>
  );
}

function Investments() {
  const [range, setRange] = useInvState('1Y');
  const [view, setView] = useInvState('holdings'); // holdings | accounts

  // Compute totals
  const totalValue = HOLDINGS.reduce((s, h) => s + h.shares * h.price, 0);
  const totalCost  = HOLDINGS.reduce((s, h) => s + h.costBasis, 0);
  const totalGain  = totalValue - totalCost;
  const totalPct   = (totalGain / totalCost) * 100;

  // Allocation
  const allocation = useInvMemo(() => {
    const buckets = {};
    HOLDINGS.forEach((h) => {
      const v = h.shares * h.price;
      const k = classify(h.sym);
      buckets[k] = (buckets[k] || 0) + v;
    });
    return Object.entries(buckets).map(([k, v]) => ({ name: k, value: v, pct: (v / totalValue) * 100 })).sort((a, b) => b.value - a.value);
  }, [totalValue]);

  // Trajectory for performance chart — slightly upward
  const days = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '5Y': 1825 }[range];
  const traj = useInvMemo(() => {
    let rnd = 7;
    const next = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
    const out = new Array(days);
    let v = totalValue;
    const driftPerDay = (totalValue * 0.0009 * (range === '5Y' ? 0.4 : 1)); // gentle uptrend
    const vol = totalValue * 0.012;
    for (let i = days - 1; i >= 0; i--) {
      out[i] = v;
      const shock = (next() - 0.5) * vol;
      v = v - driftPerDay - shock * 0.5;
    }
    return out;
  }, [days, totalValue]);

  const periodReturn = traj[traj.length - 1] - traj[0];
  const periodPct = (periodReturn / traj[0]) * 100;

  const bySym = useInvMemo(() => [...HOLDINGS].sort((a, b) => b.shares * b.price - a.shares * a.price), []);
  const byAcct = useInvMemo(() => {
    const map = {};
    HOLDINGS.forEach((h) => {
      if (!map[h.acct]) map[h.acct] = { acct: h.acct, value: 0, holdings: [] };
      map[h.acct].value += h.shares * h.price;
      map[h.acct].holdings.push(h);
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, []);

  const totalParts = splitMoney(totalValue);
  const gainParts = splitMoney(Math.abs(totalGain));

  return (
    <div className="page investments-page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Long horizon</div>
          <h1 className="page-title">Investments</h1>
        </div>
      </div>
      <p className="page-sub" style={{ margin: '0 clamp(20px, 4vw, 40px) 28px', maxWidth: 540 }}>
        Where your money is working. Quiet by design — markets move, but the plan doesn't.
      </p>

      {/* Hero summary */}
      <div className="inv-hero">
        <div className="inv-hero-main">
          <div className="smallcaps">Portfolio value · today</div>
          <div className="inv-hero-num num">
            <span className="dim">$</span>{totalParts.whole}<span className="cents">.{totalParts.cents}</span>
          </div>
          <div className="inv-hero-meta">
            <span className={`inv-delta ${totalGain >= 0 ? 'pos' : 'neg'}`}>
              {totalGain >= 0 ? '↑' : '↓'} ${gainParts.whole}.{gainParts.cents}
              <span className="inv-delta-pct"> · {totalGain >= 0 ? '+' : '−'}{Math.abs(totalPct).toFixed(2)}%</span>
            </span>
            <span className="inv-hero-divider">since cost basis</span>
          </div>
        </div>

        <div className="inv-hero-aside">
          <div className="inv-stat">
            <div className="smallcaps">Cost basis</div>
            <div className="inv-stat-num num">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="inv-stat">
            <div className="smallcaps">Holdings</div>
            <div className="inv-stat-num num">{HOLDINGS.length}<span className="dim"> · {Object.keys(byAcct.reduce((a, x) => (a[x.acct] = 1, a), {})).length} accounts</span></div>
          </div>
        </div>
      </div>

      {/* Performance chart */}
      <section className="inv-section">
        <header className="inv-section-head">
          <div>
            <div className="smallcaps">Performance</div>
            <h2 className="inv-section-title">{range} change · <span className={periodReturn >= 0 ? 'inv-pos' : 'inv-neg'}>{periodReturn >= 0 ? '+' : '−'}${Math.abs(periodReturn).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></h2>
          </div>
          <div className="inv-range-tabs">
            {['1M', '3M', '6M', '1Y', '5Y'].map((r) => (
              <button key={r} className={`inv-range-tab ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>{r}</button>
            ))}
          </div>
        </header>
        <div className="inv-chart-wrap">
          <PerformanceChart data={traj} totalReturn={periodReturn} />
          <div className="inv-chart-meta">
            <span className="num">${Math.round(traj[0]).toLocaleString()}</span>
            <span className="num">${Math.round(Math.max(...traj)).toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* Allocation */}
      <section className="inv-section">
        <header className="inv-section-head">
          <div>
            <div className="smallcaps">Allocation</div>
            <h2 className="inv-section-title">How it's distributed</h2>
          </div>
        </header>
        <div className="inv-alloc-bar">
          {allocation.map((a) => (
            <div
              key={a.name}
              className="inv-alloc-seg"
              style={{ width: `${a.pct}%`, background: ALLOC_PALETTE[a.name] }}
              title={`${a.name} · ${a.pct.toFixed(1)}%`}
            />
          ))}
        </div>
        <ul className="inv-alloc-legend">
          {allocation.map((a) => (
            <li key={a.name}>
              <span className="inv-alloc-dot" style={{ background: ALLOC_PALETTE[a.name] }}></span>
              <span className="inv-alloc-name">{a.name}</span>
              <span className="inv-alloc-pct num">{a.pct.toFixed(1)}%</span>
              <span className="inv-alloc-val num">${Math.round(a.value).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Holdings */}
      <section className="inv-section">
        <header className="inv-section-head">
          <div>
            <div className="smallcaps">Holdings</div>
            <h2 className="inv-section-title">{view === 'holdings' ? 'By position' : 'By account'}</h2>
          </div>
          <div className="inv-tabs">
            <button className={`inv-tab ${view === 'holdings' ? 'active' : ''}`} onClick={() => setView('holdings')}>Positions</button>
            <button className={`inv-tab ${view === 'accounts' ? 'active' : ''}`} onClick={() => setView('accounts')}>Accounts</button>
          </div>
        </header>

        {view === 'holdings' && (
          <div className="inv-holdings-wrap">
            <div className="inv-holdings-header">
              <div className="smallcaps">Symbol</div>
              <div className="smallcaps">Shares</div>
              <div className="smallcaps amt-col">Price</div>
              <div className="smallcaps amt-col">Value</div>
              <div className="smallcaps amt-col">Gain / loss</div>
            </div>
            <ul className="inv-holdings-list">
              {bySym.map((h) => {
                const value = h.shares * h.price;
                const gain = value - h.costBasis;
                const pct = (gain / h.costBasis) * 100;
                return (
                  <li key={h.sym} className="inv-holding-row">
                    <div className="inv-sym-col">
                      <div className="inv-sym">{h.sym}</div>
                      <div className="inv-sym-name">{h.name}</div>
                      <div className="inv-sym-meta">{h.kind} · {h.acct}</div>
                    </div>
                    <div className="inv-shares num">{h.shares.toLocaleString('en-US', { minimumFractionDigits: h.kind === 'Cash' ? 2 : 3, maximumFractionDigits: 3 })}</div>
                    <div className="inv-price num">${h.price.toFixed(2)}</div>
                    <div className="inv-value num">${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className={`inv-gain num ${gain >= 0 ? 'pos' : 'neg'}`}>
                      {gain >= 0 ? '+' : '−'}${Math.abs(gain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="inv-gain-pct"> · {gain >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {view === 'accounts' && (
          <div className="inv-accts">
            {byAcct.map((a) => (
              <div key={a.acct} className="inv-acct-card">
                <div className="inv-acct-head">
                  <div>
                    <div className="inv-acct-name">{a.acct}</div>
                    <div className="inv-acct-meta">{a.holdings.length} {a.holdings.length === 1 ? 'position' : 'positions'}</div>
                  </div>
                  <div className="inv-acct-value num">${a.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <ul className="inv-acct-holdings">
                  {a.holdings.map((h) => (
                    <li key={h.sym}>
                      <span className="inv-acct-sym">{h.sym}</span>
                      <span className="inv-acct-name-sub">{h.name}</span>
                      <span className="inv-acct-h-value num">${(h.shares * h.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

Object.assign(window, { Investments });
