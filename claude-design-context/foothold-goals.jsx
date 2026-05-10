/* global React, Icon, fmtMoney, ContourBackdrop */
const { useMemo: useGoalsMemo, useState: useGoalsState } = React;

// ============================================================
// Goals — "am I on track?"
// Each goal is a target (amount + date) with a projection and
// attached moves (the plan to get there).
// ============================================================

const GOALS_DATA = [
  {
    id: 'emergency',
    name: 'Emergency Fund',
    intent: 'Three months of expenses, parked in HYSA.',
    current: 5845,
    target: 10000,
    targetDate: 'Feb 2027',
    projDate: 'Jan 2027',
    deltaMonths: -1, // negative = ahead
    status: 'on-track',
    monthly: 472,
    moves: [
      { label: 'Cancel Paddle subscription', delta: '+$24/mo', kind: 'recurring' },
      { label: 'Reduce groceries by 15%',    delta: '+$148/mo', kind: 'category' },
      { label: 'Reroute Wealthfront cash sweep', delta: '+$300/mo', kind: 'income' },
    ],
  },
  {
    id: 'house',
    name: 'House Down Payment',
    intent: '20% down on a $200k starter, plus closing.',
    current: 12400,
    target: 40000,
    targetDate: 'Dec 2028',
    projDate: 'Apr 2029',
    deltaMonths: 4,
    status: 'behind',
    monthly: 685,
    moves: [
      { label: 'Auto-transfer from checking', delta: '+$500/mo', kind: 'income' },
      { label: 'Treasury ladder (4.2%)',      delta: '+$185/mo', kind: 'yield' },
    ],
  },
  {
    id: 'travel',
    name: 'Travel Fund',
    intent: 'Three weeks in Japan, late 2026.',
    current: 2100,
    target: 3000,
    targetDate: 'Sep 2026',
    projDate: 'Jul 2026',
    deltaMonths: -2,
    status: 'ahead',
    monthly: 250,
    moves: [
      { label: 'Round-up savings on every charge', delta: '+$58/mo', kind: 'income' },
      { label: 'Skip dining out on Tuesdays',      delta: '+$92/mo', kind: 'category' },
    ],
  },
];

function GoalProgress({ current, target }) {
  const pct = Math.max(0, Math.min(1, current / target));
  // Sparkline-style filled bar with hairline ticks at 25/50/75
  return (
    <div className="goal-progress">
      <div className="goal-progress-track">
        <div className="goal-progress-fill" style={{ width: `${pct * 100}%` }} />
        {[0.25, 0.5, 0.75].map((p) => (
          <div key={p} className="goal-progress-tick" style={{ left: `${p * 100}%` }} />
        ))}
        {/* "you are here" dot at current position */}
        <div className="goal-progress-dot" style={{ left: `${pct * 100}%` }} />
      </div>
      <div className="goal-progress-labels">
        <span className="num">${(current / 1000).toFixed(1)}k</span>
        <span className="goal-progress-pct">{Math.round(pct * 100)}%</span>
        <span className="num">${(target / 1000).toFixed(0)}k</span>
      </div>
    </div>
  );
}

function GoalCard({ g }) {
  const aheadOrBehind =
    g.deltaMonths === 0 ? 'on schedule' :
    g.deltaMonths < 0 ? `${Math.abs(g.deltaMonths)} mo ahead` :
    `${g.deltaMonths} mo behind`;
  const remaining = g.target - g.current;
  return (
    <article className="goal-card" data-status={g.status}>
      <header className="goal-card-head">
        <div className="goal-card-title">
          <h3>{g.name}</h3>
          <p className="goal-intent">{g.intent}</p>
        </div>
        <span className={`goal-status ${g.status}`}>
          <span className="goal-status-dot" />
          {g.status === 'on-track' ? 'on track' : g.status}
        </span>
      </header>

      <div className="goal-card-body">
        <div className="goal-numbers">
          <div className="goal-num-block">
            <div className="smallcaps">Target</div>
            <div className="goal-num num">${g.target.toLocaleString()}</div>
            <div className="goal-num-sub">by {g.targetDate}</div>
          </div>
          <div className="goal-num-block">
            <div className="smallcaps">Saved</div>
            <div className="goal-num num">${g.current.toLocaleString()}</div>
            <div className="goal-num-sub">${remaining.toLocaleString()} to go</div>
          </div>
          <div className="goal-num-block">
            <div className="smallcaps">Projected</div>
            <div className="goal-num num">{g.projDate}</div>
            <div className={`goal-num-sub ${g.deltaMonths < 0 ? 'pos' : g.deltaMonths > 0 ? 'neg' : ''}`}>
              {aheadOrBehind}
            </div>
          </div>
          <div className="goal-num-block">
            <div className="smallcaps">Pace</div>
            <div className="goal-num num">${g.monthly}</div>
            <div className="goal-num-sub">per month</div>
          </div>
        </div>

        <GoalProgress current={g.current} target={g.target} />

        <div className="goal-moves">
          <div className="goal-moves-head">
            <span className="smallcaps">The plan · {g.moves.length} moves</span>
            <a className="goal-edit">Edit moves <Icon name="arrow-right" size={11} /></a>
          </div>
          <ul className="goal-moves-list">
            {g.moves.map((m, i) => (
              <li key={i}>
                <span className="goal-move-icon"><Icon name={
                  m.kind === 'recurring' ? 'refresh' :
                  m.kind === 'category'  ? 'transactions' :
                  m.kind === 'yield'     ? 'investments' : 'plus'
                } size={13} /></span>
                <span className="goal-move-label">{m.label}</span>
                <span className="goal-move-delta num pos">{m.delta}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

function Goals() {
  const goals = GOALS_DATA;
  const onTrackCount = goals.filter((g) => g.status !== 'behind').length;
  return (
    <div className="page goals-page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Plan</div>
          <h1 className="page-title">Goals</h1>
        </div>
      </div>
      <p className="page-sub" style={{ margin: '0 clamp(20px, 4vw, 40px) 28px', maxWidth: 540 }}>
        Targets you've committed to. The moves attached are how you reach them.
      </p>

      <div className="goals-summary">
        <div className="goals-summary-block">
          <div className="smallcaps">Active goals</div>
          <div className="goals-summary-num num">{goals.length}</div>
        </div>
        <div className="goals-summary-block">
          <div className="smallcaps">On track</div>
          <div className="goals-summary-num num">{onTrackCount}<span className="goals-summary-of">/{goals.length}</span></div>
        </div>
        <div className="goals-summary-block">
          <div className="smallcaps">Total saved toward goals</div>
          <div className="goals-summary-num num">${goals.reduce((s, g) => s + g.current, 0).toLocaleString()}</div>
        </div>
        <div className="goals-summary-block">
          <div className="smallcaps">Total committed</div>
          <div className="goals-summary-num num">${goals.reduce((s, g) => s + g.target, 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="goal-list">
        {goals.map((g) => <GoalCard key={g.id} g={g} />)}
      </div>

      <div className="goal-add">
        <button className="btn">
          <Icon name="plus" size={14} />
          Add a goal
        </button>
        <span className="goal-add-hint">A goal becomes real when you attach moves to it.</span>
      </div>
    </div>
  );
}

Object.assign(window, { Goals });
