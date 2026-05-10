/* global React, FootholdMark, ContourBackdrop, Icon, fmtMoney, fmtCompact, splitMoney */
const { useState, useMemo, useRef, useEffect, useCallback } = React;

// ============================================================
// Simulator — empty / templates / filled comparison
// ============================================================

// 12-month forward projection (1 point per month). Baseline is the
// current-trajectory cash forecast (loosely matching screenshot 3).
function genSimSeries() {
  // months from 2026-06 -> 2027-05 = 12 points
  // baseline ends near -$4,168 (per screenshot). Start from current liquid ~ $5,845.
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const baseline = [5845, 4920, 3970, 3010, 2050, 1090, 130, -830, -1790, -2540, -3290, -4168];
  // Active scenario: cancel a $24/mo sub + reduce groceries — recovers ~$2.4k by EOY
  const scenario = baseline.map((v, i) => v + i * 195);
  return { months, baseline, scenario };
}

function SimChart({ chartStyle = 'line', showScenario = true, density = 'comfortable' }) {
  const { months, baseline, scenario } = useMemo(genSimSeries, []);
  const W = 1000, H = 320;
  const padL = 56, padR = 24, padT = 20, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const allVals = [...baseline, ...scenario];
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const yPad = (yMax - yMin) * 0.15;
  const lo = yMin - yPad, hi = yMax + yPad;

  const x = (i) => padL + (i / (months.length - 1)) * innerW;
  const y = (v) => padT + innerH - ((v - lo) / (hi - lo)) * innerH;

  const baselinePath = baseline.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const scenarioPath = scenario.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  // Uncertainty band around scenario for the "band" treatment
  const upper = scenario.map((v, i) => ({ x: x(i), y: y(v + 280 + i * 40) }));
  const lower = scenario.map((v, i) => ({ x: x(i), y: y(v - 280 - i * 40) })).reverse();
  const bandPath = `M ${[...upper, ...lower].map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} Z`;

  // Area fill below scenario (for "area" treatment) — clipped at 0
  const zeroY = y(0);
  const areaPath = `M ${x(0)} ${zeroY} ${scenario.map((v, i) => `L ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} L ${x(scenario.length - 1)} ${zeroY} Z`;

  // y-axis ticks
  const ticks = [-6000, -3000, 0, 3000, 6000];

  // Goal markers — time-based moments on the journey.
  const goals = [
    { idx: 6, label: 'Runway depleted',         sub: 'baseline only',  tone: 'warn' },
    { idx: 8, label: 'Emergency Fund · target', sub: 'Feb ’27',         tone: 'goal' },
  ];

  // hover state
  const [hover, setHover] = useState(months.length - 1);
  const onMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const ratio = (localX - padL * (rect.width / W)) / (innerW * (rect.width / W));
    const idx = Math.round(ratio * (months.length - 1));
    setHover(Math.max(0, Math.min(months.length - 1, idx)));
  }, []);

  const tipX = x(hover);
  const tipBaseline = baseline[hover];
  const tipScenario = scenario[hover];

  return (
    <div className="sim-chart">
      <div className="sim-chart-head">
        <div>
          <h3>Cash forecast</h3>
          <div className="sim-readout">
            <span>12 months · 2027-05 projected <span style={{ color: showScenario ? 'var(--accent-strong)' : 'var(--text)' }}>{fmtMoney(showScenario ? scenario[scenario.length - 1] : baseline[baseline.length - 1])}</span></span>
          </div>
        </div>
        <div className="legend">
          <span className="item"><span className="swatch baseline"/> baseline</span>
          {showScenario && <span className="item"><span className="swatch scenario"/> scenario</span>}
        </div>
      </div>

      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(months.length - 1)}
          style={{ cursor: 'crosshair' }}
        >
          {/* gridlines */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padL} x2={W - padR}
                y1={y(t)} y2={y(t)}
                stroke="var(--hairline)"
                strokeDasharray={t === 0 ? '0' : '2 4'}
                strokeWidth={t === 0 ? 1 : 0.8}
                opacity={t === 0 ? 1 : 0.7}
              />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--text-3)' }}>
                {t === 0 ? '$0' : (t > 0 ? '$' : '-$') + Math.abs(t / 1000) + 'K'}
              </text>
            </g>
          ))}

          {/* x labels (every 2nd) */}
          {months.map((m, i) => (
            i % 2 === 0 || i === months.length - 1 ? (
              <text key={i} x={x(i)} y={H - 12} textAnchor="middle"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--text-3)', letterSpacing: '0.05em' }}>
                {2026 + Math.floor((i + 5) / 12)}-{String(((i + 5) % 12) + 1).padStart(2, '0')}
              </text>
            ) : null
          ))}

          {/* goal markers — dotted verticals + caption */}
          {goals.map((g, gi) => {
            const gx = x(g.idx);
            const isWarn = g.tone === 'warn';
            const stroke = isWarn ? 'var(--text-2)' : 'var(--accent)';
            return (
              <g key={`goal-${gi}`} opacity={isWarn ? 0.55 : 0.9}>
                <line
                  x1={gx} x2={gx}
                  y1={padT + 30} y2={H - padB}
                  stroke={stroke}
                  strokeWidth="1"
                  strokeDasharray="2 4"
                />
                <circle cx={gx} cy={padT + 30} r="2.5" fill={stroke} />
                <text
                  x={gx} y={padT + 14} textAnchor={g.idx > months.length - 3 ? 'end' : 'middle'}
                  style={{
                    fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: '0.08em',
                    textTransform: 'uppercase', fill: stroke, fontWeight: 500
                  }}>
                  {g.label}
                </text>
                <text
                  x={gx} y={padT + 26} textAnchor={g.idx > months.length - 3 ? 'end' : 'middle'}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fill: 'var(--text-3)' }}>
                  {g.sub}
                </text>
              </g>
            );
          })}

          {/* uncertainty band (under) */}
          {chartStyle === 'band' && showScenario && (
            <path d={bandPath} fill="var(--accent)" opacity="0.10" />
          )}

          {/* area fill */}
          {chartStyle === 'area' && showScenario && (
            <>
              <defs>
                <linearGradient id="simArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#simArea)" />
            </>
          )}

          {/* baseline line — quieter, dashed */}
          <path
            d={baselinePath}
            fill="none"
            stroke="var(--text-2)"
            strokeWidth="1.4"
            strokeDasharray="3 5"
            strokeLinecap="round"
            opacity="0.65"
          />

          {/* scenario line */}
          {showScenario && (
            <path
              d={scenarioPath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* "You are here" — today's position, anchored at index 0 */}
          {(() => {
            const tx0 = x(0);
            const ty0 = y(showScenario ? scenario[0] : baseline[0]);
            return (
              <g pointerEvents="none">
                <circle cx={tx0} cy={ty0} r="7" fill="var(--accent)" opacity="0.18">
                  <animate attributeName="r" values="5;10;5" dur="2.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.28;0.05;0.28" dur="2.6s" repeatCount="indefinite" />
                </circle>
                <circle cx={tx0} cy={ty0} r="3.5" fill="var(--accent)" />
                <circle cx={tx0} cy={ty0} r="1.5" fill="var(--bg)" />
              </g>
            );
          })()}

          {/* hover crosshair */}
          <line x1={tipX} x2={tipX} y1={padT} y2={H - padB} stroke="var(--hairline-strong)" strokeWidth="1" strokeDasharray="2 3" />

          {/* hover dots */}
          <circle cx={tipX} cy={y(tipBaseline)} r="3" fill="var(--text-2)" />
          {showScenario && <circle cx={tipX} cy={y(tipScenario)} r="3.5" fill="var(--accent)" />}
        </svg>

        {/* tooltip */}
        <div className="chart-tip" style={{
          left: `${(tipX / W) * 100}%`,
          top: 8,
          transform: tipX > W * 0.7 ? 'translateX(-110%)' : 'translateX(10%)',
        }}>
          <div className="lbl" style={{ marginBottom: 4 }}>
            {2026 + Math.floor((hover + 5) / 12)}-{String(((hover + 5) % 12) + 1).padStart(2, '0')}
          </div>
          <div className="row"><span className="lbl">baseline</span><span className="v baseline">{fmtMoney(tipBaseline)}</span></div>
          {showScenario && <div className="row"><span className="lbl">scenario</span><span className="v scenario">{fmtMoney(tipScenario)}</span></div>}
          {showScenario && (
            <div className="row" style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--hairline)' }}>
              <span className="lbl">delta</span>
              <span className="v scenario">+{fmtMoney(tipScenario - tipBaseline)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MovesGrid({ onPick }) {
  const moves = [
    { id: 'income',     icon: 'income',    title: 'Income change',   desc: 'Raise, side income, or stipend' },
    { id: 'big-buy',    icon: 'big-buy',   title: 'Big purchase',    desc: 'Lump sum that hits one month' },
    { id: 'pay-raise',  icon: 'sparkles',  title: 'Pay raise',       desc: 'Recurring increase from date' },
    { id: 'job-loss',   icon: 'job-loss',  title: 'Job loss',        desc: 'Pause income for N months' },
    { id: 'recurring',  icon: 'recurring', title: 'New recurring',   desc: 'Add monthly charge' },
    { id: 'pause',      icon: 'pause',     title: 'Pause recurring', desc: 'Skip a known charge' },
    { id: 'bonus',      icon: 'gift',      title: 'Bonus',           desc: 'One-time cash inflow' },
    { id: 'cancel',     icon: 'sub',       title: 'Cancel subs',     desc: 'Trim recurring outflow' },
  ];
  return (
    <div className="moves">
      {moves.map((m) => (
        <button key={m.id} className="move" onClick={() => onPick && onPick(m.id)}>
          <div className="ico"><Icon name={m.icon} size={20}/></div>
          <div>
            <div className="ttl">{m.title}</div>
            <div className="desc">{m.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function OverridesPanel({ activeScenario }) {
  const [open, setOpen] = useState({ recurring: true });
  const groups = [
    { id: 'categories',    label: 'Categories',         badge: null },
    { id: 'lump',          label: 'Lump sums',          badge: null },
    { id: 'recurring',     label: 'Recurring',          badge: '2 active' },
    { id: 'income',        label: 'Income',             badge: null },
    { id: 'hypothetical',  label: 'Hypothetical goals', badge: null },
    { id: 'edits',         label: 'Existing goal edits',badge: null },
    { id: 'skip',          label: 'Skip recurring',     badge: null },
  ];
  return (
    <div className="overrides">
      <div className="smallcaps">Overrides</div>
      {groups.map((g) => (
        <div key={g.id}>
          <div
            className={`ov-row ${open[g.id] ? 'expanded' : ''}`}
            onClick={() => setOpen((s) => ({ ...s, [g.id]: !s[g.id] }))}
          >
            <span className="left">
              <Icon name="chevron-right" size={12} className="chev"/>
              {g.label}
            </span>
            {g.badge && <span className="badge">{g.badge}</span>}
            {!g.badge && <Icon name="minus" size={14}/>}
          </div>
          {open[g.id] && g.id === 'recurring' && (
            <div style={{ padding: '8px 0 12px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>
                <span>Cancel · Disney+</span>
                <span style={{ color: 'var(--accent-strong)' }}>+$19.99/mo</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>
                <span>Reduce · Groceries</span>
                <span style={{ color: 'var(--accent-strong)' }}>+$175.00/mo</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ScenarioCards({ active, onSelect }) {
  return (
    <div className="scenarios">
      <div className={`scenario ${active === 'baseline' ? 'active' : ''}`} onClick={() => onSelect && onSelect('baseline')}>
        <div className="scenario-head">
          <span className="name"><span className="swatch baseline"/> Baseline</span>
          <span className="delta neg">−$4,168</span>
        </div>
        <div className="figure">−$4,168.47</div>
        <div className="meta">Projected 2027-05 · no overrides</div>
      </div>
      <div className={`scenario ${active === 'trim' ? 'active' : ''}`} onClick={() => onSelect && onSelect('trim')}>
        <div className="scenario-head">
          <span className="name"><span className="swatch scenario"/> Trim recurring</span>
          <span className="delta">+$2,340</span>
        </div>
        <div className="figure">−$1,828.47</div>
        <div className="meta">Cancel Disney+ · −$175 groceries/mo</div>
      </div>
    </div>
  );
}

function GoalImpacts() {
  return (
    <div>
      <div className="section-head" style={{ marginBottom: 8 }}>
        <h3 className="section-title">Goal impacts</h3>
        <div className="section-sub">vs baseline projection</div>
      </div>
      <div className="goal-impacts">
        <div className="goal-impact">
          <div className="goal-impact-head">
            <span style={{ fontSize: 14, color: 'var(--text)' }}>Emergency Fund</span>
            <span className="pill faster">faster</span>
          </div>
          <div className="figure">2027 · 02</div>
          <div className="delta-row">
            <span className="from">2027-09</span>
            <span style={{ color: 'var(--accent-strong)' }}>− 7 months</span>
          </div>
        </div>
        <div className="goal-impact">
          <div className="goal-impact-head">
            <span style={{ fontSize: 14, color: 'var(--text)' }}>Food and Groceries</span>
            <span className="pill same">same</span>
          </div>
          <div className="figure">2026 · 06</div>
          <div className="delta-row">
            <span>1 mo from now</span>
            <span style={{ color: 'var(--text-3)' }}>$0 target · $400/mo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimulatorEmpty({ onStart }) {
  return (
    <div className="empty">
      <div className="contour-bg" style={{ color: 'var(--accent)' }}>
        <ContourBackdrop stroke="currentColor" density={6} strokeWidth={0.7} opacity={0.5}/>
      </div>
      <div style={{ position: 'relative' }}>
        <div className="mark"><FootholdMark size={48}/></div>
        <h3>Start with where you stand.</h3>
        <p>
          The baseline shows your trajectory if nothing changes for the next 12 months.
          Add a Move to see how a single decision shifts the line.
        </p>
        <button className="btn primary" onClick={onStart}>
          <Icon name="plus" size={14}/> Pick a Move
        </button>
      </div>
    </div>
  );
}

function Simulator({ initialView = 'filled', chartStyle = 'line' }) {
  const [view, setView] = useState(initialView);
  const [active, setActive] = useState('trim');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Plan</div>
          <h1 className="page-title">Simulator</h1>
        </div>
        <div className="row">
          <button className="btn ghost"><Icon name="refresh" size={14}/> Reset</button>
          <button className="btn">Save as…</button>
        </div>
      </div>

      <div className="sim-tabs">
        <button className={`sim-tab ${view === 'empty' ? 'active' : ''}`} onClick={() => setView('empty')}>Empty</button>
        <button className={`sim-tab ${view === 'templates' ? 'active' : ''}`} onClick={() => setView('templates')}>Moves</button>
        <button className={`sim-tab ${view === 'filled' ? 'active' : ''}`} onClick={() => setView('filled')}>Comparison</button>
      </div>

      {view === 'empty' && (
        <>
          <SimChart chartStyle={chartStyle} showScenario={false} />
          <div style={{ marginTop: 16 }}>
            <SimulatorEmpty onStart={() => setView('templates')} />
          </div>
        </>
      )}

      {view === 'templates' && (
        <>
          <div className="section-head" style={{ marginBottom: 12 }}>
            <div>
              <h3 className="section-title">Pick a Move</h3>
              <div className="section-sub">Each Move adds an override and re-runs the projection</div>
            </div>
            <a className="linkish" onClick={() => setView('empty')}>Cancel <Icon name="x" size={11}/></a>
          </div>
          <MovesGrid onPick={() => setView('filled')} />
        </>
      )}

      {view === 'filled' && (
        <>
          <div className="sim-grid">
            <OverridesPanel activeScenario={active}/>
            <SimChart chartStyle={chartStyle} showScenario={true} />
          </div>
          <ScenarioCards active={active} onSelect={setActive}/>
          <div className="section">
            <GoalImpacts />
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { Simulator, SimChart, MovesGrid });
