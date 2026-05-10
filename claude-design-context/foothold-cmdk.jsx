/* global React, Icon */
const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
// Command palette (⌘K)
// ============================================================

const RECENT_TX = [
  { date: 'May 08', desc: 'PADDLECOM', cat: 'General Services', amt: -100.00 },
  { date: 'May 08', desc: 'CHIPOTLE', cat: 'Food and Drink', amt: -15.83 },
  { date: 'May 07', desc: 'AMERICAN EXPRESS', cat: 'Loan Payments', amt: 148.77 },
  { date: 'May 07', desc: 'TARGET', cat: 'General Merchandise', amt: -48.76 },
  { date: 'May 07', desc: 'DIGITAL DREAMS', cat: 'Income', amt: 2075.99 },
  { date: 'May 06', desc: 'KAISER', cat: 'Medical', amt: -338.69 },
];

function CommandPalette({ open, onClose, onNav, onTweak, theme }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
    }
  }, [open]);

  // Build command list
  const items = useMemo(() => {
    const navs = [
      { kind: 'Pages', icon: 'dashboard', label: 'Go to Dashboard',     keywords: 'dashboard home today',     run: () => onNav('dashboard') },
      { kind: 'Pages', icon: 'simulator', label: 'Go to Simulator',      keywords: 'simulator scenario plan forecast',  run: () => onNav('simulator') },
      { kind: 'Pages', icon: 'goals',     label: 'Go to Goals',          keywords: 'goals targets',            run: () => onNav('goals') },
      { kind: 'Pages', icon: 'recurring', label: 'Go to Recurring',      keywords: 'recurring subscriptions',  run: () => onNav('recurring') },
      { kind: 'Pages', icon: 'transactions', label: 'Go to Transactions', keywords: 'transactions records ledger', run: () => onNav('transactions') },
      { kind: 'Pages', icon: 'investments',  label: 'Go to Investments',  keywords: 'investments holdings portfolio', run: () => onNav('investments') },
      { kind: 'Pages', icon: 'settings',  label: 'Settings',              keywords: 'settings preferences account connections', run: () => onNav('settings') },
    ];
    const actions = [
      { kind: 'Actions', icon: 'plus',    label: 'New scenario',                 keywords: 'simulator new add move',    run: () => onNav('simulator') },
      { kind: 'Actions', icon: 'refresh', label: 'Refresh data',                 keywords: 'sync reload refresh',       run: () => {} },
      { kind: 'Actions', icon: theme === 'dark' ? 'sun' : 'moon', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', keywords: 'theme dark light mode toggle', run: () => onTweak('theme', theme === 'dark' ? 'light' : 'dark') },
    ];
    const tx = RECENT_TX.map((t) => ({
      kind: 'Transactions', icon: 'transactions',
      label: t.desc,
      meta: `${t.date} · ${t.amt > 0 ? '+' : ''}$${Math.abs(t.amt).toFixed(2)}`,
      keywords: `${t.desc} ${t.cat} transaction`.toLowerCase(),
      run: () => onNav('transactions'),
    }));
    return [...navs, ...actions, ...tx];
  }, [onNav, onTweak, theme]);

  // Filter
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      it.label.toLowerCase().includes(term) ||
      (it.keywords || '').includes(term) ||
      (it.meta || '').toLowerCase().includes(term)
    );
  }, [items, q]);

  // Group by kind
  const groups = useMemo(() => {
    const out = {};
    filtered.forEach((it) => {
      if (!out[it.kind]) out[it.kind] = [];
      out[it.kind].push(it);
    });
    return out;
  }, [filtered]);

  // Flat ordered list for keyboard nav
  const flat = useMemo(() => {
    const out = [];
    Object.values(groups).forEach((arr) => arr.forEach((it) => out.push(it)));
    return out;
  }, [groups]);

  useEffect(() => { setActive(0); }, [q]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = flat[active];
      if (it) { it.run(); onClose(); }
    } else if (e.key === 'Escape') {
      e.preventDefault(); onClose();
    }
  };

  if (!open) return null;

  let runningIdx = 0;
  return (
    <div className="cmdk-scrim" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="cmdk-input-row">
          <span className="ico"><Icon name="search" size={16}/></span>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Jump to a page, action, or transaction…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          <span className="cmdk-esc">esc</span>
        </div>
        <div className="cmdk-list">
          {flat.length === 0 && (
            <div className="cmdk-empty">No matches for "{q}"</div>
          )}
          {Object.entries(groups).map(([kind, arr]) => (
            <div key={kind}>
              <div className="cmdk-group-label">{kind}</div>
              {arr.map((it) => {
                const idx = runningIdx++;
                return (
                  <div
                    key={idx}
                    className={`cmdk-row ${idx === active ? 'active' : ''}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => { it.run(); onClose(); }}
                  >
                    <span className="leadicon"><Icon name={it.icon} size={15}/></span>
                    <span className="label">{it.label}</span>
                    {it.meta && <span className="meta">{it.meta}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-footer">
          <span>Foothold</span>
          <span className="keys">
            <span><span className="key">↑</span><span className="key">↓</span> navigate</span>
            <span><span className="key">↵</span> select</span>
            <span><span className="key">esc</span> close</span>
          </span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CommandPalette });
