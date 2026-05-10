/* global React, FootholdMark, ContourBackdrop, Icon, splitMoney, fmtMoney, fmtCompact, genTrajectory */
const { useMemo, useState } = React;

// ============================================================
// Dashboard
// ============================================================

function NetWorthHero({ variant = 'trajectory' }) {
  // Count-up the hero number on first paint (one-time, per brief).
  const target = 95955.42;
  const [n, setN] = React.useState(target * 0.985);
  React.useEffect(() => {
    let raf;
    const start = performance.now();
    const dur = 900;
    const from = target * 0.985;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(from + (target - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const traj = useMemo(() => genTrajectory({ days: 180, end: 95955.42 }), []);
  const min = Math.min(...traj);
  const max = Math.max(...traj);
  const W = 100,H = 100;
  // Build polyline path normalized to 0-100 viewBox
  const points = traj.map((v, i) => {
    const x = i / (traj.length - 1) * W;
    const y = H - (v - min) / (max - min || 1) * H * 0.85 - H * 0.075;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const path = `M ${points.join(' L ')}`;
  const todayIdx = Math.floor(traj.length * (90 / 180)); // 90 days back, then 90 days projected
  const tx = todayIdx / (traj.length - 1) * W;
  const ty = (() => {
    const v = traj[todayIdx];
    return H - (v - min) / (max - min || 1) * H * 0.85 - H * 0.075;
  })();

  // forecast: continuation with widening uncertainty band
  const forecast = useMemo(() => {
    const out = [];
    let v = traj[todayIdx];
    for (let i = 0; i <= traj.length - todayIdx - 1; i++) {
      const day = i;
      const drift = -1.2; // gentle drift down
      v = v + drift + Math.sin(i * 0.4) * 30;
      out.push(v);
    }
    return out;
  }, [traj]);

  const fpoints = forecast.map((v, i) => {
    const x = (todayIdx + i) / (traj.length - 1) * W;
    const y = H - (v - min) / (max - min || 1) * H * 0.85 - H * 0.075;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const fpath = `M ${fpoints.join(' L ')}`;

  // uncertainty band (forecast)
  const upper = forecast.map((v, i) => {
    const x = (todayIdx + i) / (traj.length - 1) * W;
    const spread = 60 + i * 6;
    const y = H - (v + spread - min) / (max - min || 1) * H * 0.85 - H * 0.075;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const lower = forecast.map((v, i) => {
    const x = (todayIdx + i) / (traj.length - 1) * W;
    const spread = 60 + i * 6;
    const y = H - (v - spread - min) / (max - min || 1) * H * 0.85 - H * 0.075;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).reverse();
  const bandPath = `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`;

  const m = splitMoney(n);

  return (
    <div className="hero" data-variant={variant}>
      <div className="hero-watermark" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <ContourBackdrop stroke="#a8c298" density={7} strokeWidth={0.6} />
      </div>

      <div className="hero-head">
        <div className="hero-eyebrow">Net Worth</div>
        <div className="hero-pos">
          <span className="dot" />
          You are here · May 09
        </div>
      </div>

      <div className="hero-num">
        {m.sign}${m.whole}<span className="cents">.{m.cents}</span>
      </div>

      {variant !== 'solid' &&
      <div className="hero-traj" aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="histFade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#d4dccf" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#d4dccf" stopOpacity="0.7" />
              </linearGradient>
              <linearGradient id="fcastFade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#a8c298" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#a8c298" stopOpacity="0.25" />
              </linearGradient>
            </defs>
            {/* uncertainty band on the forecast side */}
            <path d={bandPath} fill="#a8c298" opacity="0.08" />
            {/* historical line (90 days back -> today) */}
            <path d={path} fill="none" stroke="url(#histFade)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
            {/* projection line (today -> +90 days) */}
            <path d={fpath} fill="none" stroke="url(#fcastFade)" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0.6 1.4" />
            {/* today vertical */}
            <line x1={tx} y1="0" x2={tx} y2="100" stroke="#d4dccf" strokeWidth="0.4" strokeDasharray="0.6 1.2" opacity="0.35" />
            {/* you-are-here dot */}
            <circle cx={tx} cy={ty} r="1.6" fill="#a8c298" />
            <circle cx={tx} cy={ty} r="3" fill="#a8c298" opacity="0.18" />
          </svg>
          <div className="hero-traj-labels">
            <span>90 days back</span>
            <span>today</span>
            <span>+90 days</span>
          </div>
        </div>
      }

      <div className="hero-row">
        <div className="hero-delta down">
          <span className="v">$28.69</span>
          <span>this month</span>
        </div>
        <div className="hero-fineprint">
          Fresh 2h ago · 3 sources · Trend appears once accounts have 30 days of history.
        </div>
      </div>
    </div>);

}

function Kpis() {
  return (
    <div className="kpis">
      <div className="kpi">
        <div className="smallcaps label">Liquid Balance</div>
        <div className="value">$5,845.53</div>
        <div className="sub">across 3 accounts</div>
      </div>
      <div className="kpi">
        <div className="smallcaps label">EOM Projected</div>
        <div className="value">$5,011.03</div>
        <div className="sub">−$834.50 from today</div>
      </div>
      <div className="kpi">
        <div className="smallcaps label">Runway</div>
        <div className="value">14 wks</div>
        <div className="sub">at current burn</div>
      </div>
    </div>);

}

function DriftModule() {
  const rows = [
  { cat: 'General Merchandise', spent: 2183.50, baseline: 212.28, ratio: 10.3, hot: true, w: 100 },
  { cat: 'General Services', spent: 433.26, baseline: 230.50, ratio: 1.9, hot: true, w: 38 },
  { cat: 'Travel', spent: 298.16, baseline: 193.40, ratio: 1.5, hot: true, w: 30 },
  { cat: 'Entertainment', spent: 32.74, baseline: 46.47, ratio: 0.7, hot: false, w: 7 },
  { cat: 'Food and Drink', spent: 125.93, baseline: 225.50, ratio: 0.6, hot: false, w: 12 }];

  return (
    <div className="drift">
      <div className="drift-head">
        <div className="lead"><span className="dot" /> 3 categories running hot this week</div>
        <a className="linkish">Open Drift <Icon name="arrow-right" size={12} /></a>
      </div>
      <div className="drift-rows">
        {rows.map((r) =>
        <div key={r.cat} className={`drift-row ${r.hot ? '' : 'cool'}`}>
            <div className="cat">{r.cat}</div>
            <div className={`drift-bar ${r.hot ? '' : 'cool'}`}>
              <div className="baseline" style={{ left: '14%' }} />
              <div className="fill" style={{ '--w': `${r.w}%` }} />
            </div>
            <div className="amt">{fmtMoney(r.spent)}<span style={{ color: 'var(--text-3)' }}> · {fmtMoney(r.baseline)}</span></div>
            <div className="ratio">{r.ratio.toFixed(1)}×</div>
          </div>
        )}
      </div>
    </div>);

}

function GoalsRow() {
  return (
    <div>
      <div className="section-head">
        <div>
          <h3 className="section-title">Goals</h3>
          <div className="section-sub">2 active · sorted by urgency</div>
        </div>
        <a className="linkish">All goals <Icon name="arrow-right" size={12} /></a>
      </div>
      <div className="goals-grid">
        <div className="goal">
          <div>
            <h4>Emergency Fund</h4>
            <div className="sub">Not on track at current pace</div>
          </div>
          <div className="progress"><div className="bar" style={{ width: '15.3%' }} /></div>
          <div className="row"><span>$1,530.00 of $10,000.00</span><span className="pct">15.3%</span></div>
        </div>
        <div className="goal">
          <div>
            <h4>Food and Groceries</h4>
            <div className="sub">On pace to exceed cap</div>
          </div>
          <div className="progress"><div className="bar" style={{ width: '30%', background: 'var(--caution)' }} /></div>
          <div className="row"><span>$119.89 of $400.00</span><span className="pct" style={{ color: 'var(--caution)' }}>30.0%</span></div>
        </div>
      </div>
    </div>);

}

function RecurringList() {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="smallcaps">Recurring · Next 7 Days</div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>
            2 charges expected · $34.99
          </div>
        </div>
        <a className="linkish">All recurring <Icon name="arrow-right" size={12} /></a>
      </div>
      <div>
        <div className="list-row">
          <div className="ico"><Icon name="calendar" size={14} /></div>
          <div>
            <div className="pri">Disney+</div>
            <div className="meta">Wed, May 13</div>
          </div>
          <div className="amt">$19.99</div>
        </div>
        <div className="list-row">
          <div className="ico"><Icon name="calendar" size={14} /></div>
          <div>
            <div className="pri">Monthly Service Fee</div>
            <div className="meta">Fri, May 15</div>
          </div>
          <div className="amt">$15.00</div>
        </div>
      </div>
    </div>);

}

function WeekInsight() {
  return (
    <article className="brief">
      <header className="brief-head">
        <span className="brief-eyebrow">Weekly Brief</span>
        <span className="brief-rule"></span>
        <span className="brief-meta">№ 14 · May 04—10, 2025</span>
      </header>

      <div className="brief-body">
        <p className="brief-lead">
          A quiet week, financially speaking — though
          not without one significant outlay.
        </p>

        <p className="brief-para">
          Your <strong>Kaiser</strong> payment of <span className="num">$338.69</span> cleared on Tuesday,
          accounting for nearly a fifth of the week's spending. The category that
          looks alarming — General Merchandise, running <span className="num">10.3×</span> baseline —
          turns out to be a single Target visit, not a shift in habit. Recurring
          held steady. Income arrived on schedule.
        </p>

        <p className="brief-para">
          Net result: you ended the week <span className="num">$432.99</span> ahead of where you started.
          The trajectory points up.
        </p>
      </div>

      <dl className="brief-stats">
        <div>
          <dt>Spend</dt>
          <dd className="num">$1,644.00</dd>
        </div>
        <div>
          <dt>Income</dt>
          <dd className="num">$2,076.99</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd className="num pos">+$432.99</dd>
        </div>
      </dl>

      <footer className="brief-foot">
        <span className="brief-sign">— Foothold · May 11</span>
        <a className="brief-more">Read full brief <Icon name="arrow-right" size={11} /></a>
      </footer>
    </article>);

}

function RecentActivity() {
  const rows = [
  { date: 'May 08', desc: 'Padd…', raw: 'PADDLECOM', cat: 'General Services', amt: -100.00 },
  { date: 'May 08', desc: 'Chic…', raw: 'CHIPOTLE', cat: 'Food and Drink', amt: -15.83 },
  { date: 'May 07', desc: 'Mobile Payment', raw: 'AMERICAN EXPRESS', cat: 'Loan Payments', amt: 148.77, pos: true },
  { date: 'May 07', desc: 'Target', raw: 'ApIPay TARGET', cat: 'General Merchandise', amt: -48.76 },
  { date: 'May 07', desc: 'Digital Dreams', raw: 'DIGITAL DREAMS', cat: 'Income', amt: 2075.99, pos: true }];

  return (
    <div>
      <div className="section-head">
        <div>
          <h3 className="section-title">Recent activity</h3>
          <div className="section-sub">Last 5 transactions</div>
        </div>
        <a className="linkish">View all <Icon name="arrow-right" size={12} /></a>
      </div>
      <div className="activity">
        {rows.map((r, i) =>
        <div key={i} className="activity-row">
            <div className="date">{r.date}</div>
            <div className="desc">
              {r.desc}
              <span className="raw">{r.raw}</span>
            </div>
            <div className="cat">{r.cat}</div>
            <div className={`amt ${r.pos ? 'pos' : ''}`}>{r.pos ? '+' : ''}{fmtMoney(r.amt)}</div>
          </div>
        )}
      </div>
    </div>);

}

function Dashboard({ heroVariant }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Today · Sat, May 09</div>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="page-meta">
          <span>Fresh 2h ago</span><span className="sep">·</span><span>3 sources</span>
        </div>
      </div>

      <NetWorthHero variant={heroVariant} />
      <Kpis />

      <div className="section">
        <DriftModule />
      </div>

      <div className="section">
        <WeekInsight />
      </div>

      <div className="section">
        <GoalsRow />
      </div>

      <div className="section" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <RecurringList />
      </div>

      <div className="section">
        <RecentActivity />
      </div>
    </div>);

}

Object.assign(window, { Dashboard });