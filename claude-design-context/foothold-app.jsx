/* global React, ReactDOM, FootholdMark, Icon, Dashboard, Simulator,
   useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakSlider,
   TweakColor, TweakSelect */
const { useState, useEffect, useMemo, useRef } = React;

// ============================================================
// Sidebar
// ============================================================

function Sidebar({ route, onNav, lockup = 'mono' }) {
  const groups = [
    { label: 'Today', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    ]},
    { label: 'Plan', items: [
      { id: 'simulator', label: 'Simulator', icon: 'simulator' },
      { id: 'goals',     label: 'Goals',     icon: 'goals' },
      { id: 'recurring', label: 'Recurring', icon: 'recurring' },
    ]},
    { label: 'Records', items: [
      { id: 'transactions', label: 'Transactions', icon: 'transactions' },
      { id: 'investments',  label: 'Investments',  icon: 'investments' },
    ]},
  ];

  return (
    <aside className="sidebar">
      <SidebarBrand variant={lockup} />
      {groups.map((g) => (
        <div key={g.label} className="sb-section">
          <div className="sb-group-label">{g.label}</div>
          {g.items.map((it) => (
            <button
              key={it.id}
              className={`sb-item ${route === it.id ? 'active' : ''}`}
              onClick={() => onNav(it.id)}
            >
              <span className="ico"><Icon name={it.icon} size={16}/></span>
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      ))}

      <div className="sb-footer">
        <button className="sb-item" onClick={() => onNav('settings')}>
          <span className="ico"><Icon name="settings" size={16}/></span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

function SidebarBrand({ variant = 'mono' }) {
  const [clicked, setClicked] = React.useState(false);
  const handleClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 600);
  };
  const cls = `sb-brand${variant === 'serif' ? ' serif' : ''}${clicked ? ' click' : ''}`;
  if (variant === 'mark-only') {
    return (
      <button className={cls} onClick={handleClick}>
        <span className="mark"><FootholdMark size={40} simplified/></span>
      </button>
    );
  }
  if (variant === 'serif') {
    return (
      <button className={cls} onClick={handleClick}>
        <span className="mark"><FootholdMark size={40} simplified/></span>
        <span className="word">Foothold</span>
      </button>
    );
  }
  return (
    <button className={cls} onClick={handleClick}>
      <span className="mark"><FootholdMark size={40} simplified/></span>
      <span className="word">foothold</span>
    </button>
  );
}

// ============================================================
// Topbar
// ============================================================

function Topbar({ route, theme, onToggleTheme, onOpenCmdK }) {
  const titles = {
    dashboard: 'Dashboard',
    simulator: 'Simulator',
    goals: 'Goals',
    recurring: 'Recurring',
    transactions: 'Transactions',
    investments: 'Investments',
    settings: 'Settings',
  };
  return (
    <div className="topbar">
      <div className="tb-crumb">{titles[route] || ''}</div>
      <button className="tb-search" onClick={onOpenCmdK} aria-label="Open command palette">
        <Icon name="search" size={14}/>
        <span className="tb-search-placeholder">Search transactions, jump to a page…</span>
        <span className="tb-kbd">⌘K</span>
      </button>
      <div className="tb-spacer"/>
      <span className="tb-pill"><span className="dot"/> Just now</span>
      <button className="tb-icon-btn" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15}/>
      </button>
      <span className="tb-avatar">D</span>
    </div>
  );
}

// ============================================================
// Stub pages for nav items not in scope
// ============================================================
function StubPage({ route }) {
  const labels = {
    goals: { eyebrow: 'Plan', title: 'Goals', body: 'Goals are scenarios you have committed to. The full surface lives in the next pass.' },
    recurring: { eyebrow: 'Plan', title: 'Recurring', body: 'Detected recurring charges and a 7/14/30-day forward calendar.' },
    transactions: { eyebrow: 'Records', title: 'Transactions', body: 'Dense, legible table — out of scope for this round.' },
    investments: { eyebrow: 'Records', title: 'Investments', body: 'Holdings table with current value and 12/24-month projection.' },
    settings: { eyebrow: 'Account', title: 'Settings', body: 'Connections, preferences, and exports.' },
  }[route] || { eyebrow: '', title: route, body: '' };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">{labels.eyebrow}</div>
          <h1 className="page-title">{labels.title}</h1>
        </div>
      </div>
      <div className="empty">
        <div className="mark"><FootholdMark size={42}/></div>
        <h3>{labels.title}</h3>
        <p>{labels.body}</p>
        <p style={{ marginTop: -8 }}>Designed in the Dashboard + Simulator pass — wire up next.</p>
      </div>
    </div>
  );
}

// ============================================================
// Root
// ============================================================

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "density": "comfortable",
  "heroVariant": "trajectory",
  "chartStyle": "line",
  "sidebarLockup": "mono",
  "accent": "default"
}/*EDITMODE-END*/;

function SignatureFooter() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <footer className="sig-footer">
      <div className="sig-left">
        <span className="sig-status"><span className="sig-dot" /> connected</span>
        <span className="sig-sep">·</span>
        <span>3 sources</span>
      </div>
      <div className="sig-right">
        <span>42.3601° N · 71.0589° W</span>
        <span className="sig-sep">·</span>
        <span>synced {hh}:{mm} EDT</span>
        <span className="sig-sep">·</span>
        <span>v0.4</span>
      </div>
    </footer>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useState('dashboard');
  const [cmdOpen, setCmdOpen] = useState(false);

  // ⌘K / Ctrl+K to open command palette
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // sync theme + density + accent to root data attrs
  useEffect(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
    document.documentElement.dataset.accent = t.accent;
  }, [t.theme, t.density, t.accent]);

  const toggleTheme = () => setTweak('theme', t.theme === 'dark' ? 'light' : 'dark');

  return (
    <div className="app" data-density={t.density}>
      <Sidebar route={route} onNav={setRoute} lockup={t.sidebarLockup}/>
      <main className="main">
        <Topbar route={route} theme={t.theme} onToggleTheme={toggleTheme} onOpenCmdK={() => setCmdOpen(true)}/>
        {route === 'dashboard' && <Dashboard heroVariant={t.heroVariant}/>}
        {route === 'simulator' && <Simulator chartStyle={t.chartStyle}/>}
        {route === 'goals' && <Goals />}
        {route === 'recurring' && <Recurring />}
        {route === 'transactions' && <Transactions />}
        {route === 'investments' && <Investments />}
        {route === 'settings' && <Settings />}
        {!['dashboard', 'simulator', 'goals', 'recurring', 'transactions', 'investments', 'settings'].includes(route) && <StubPage route={route}/>}
        <SignatureFooter />
      </main>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNav={setRoute}
        onTweak={setTweak}
        theme={t.theme}
      />

      <TweaksPanel title="Foothold tweaks">
        <TweakSection label="Theme"/>
        <TweakRadio label="Mode" value={t.theme} options={['dark', 'light']} onChange={(v) => setTweak('theme', v)} />
        <TweakRadio label="Density" value={t.density} options={['comfortable', 'compact']} onChange={(v) => setTweak('density', v)} />
        <TweakSelect label="Accent intensity" value={t.accent}
                     options={['muted', 'default', 'vivid']}
                     onChange={(v) => setTweak('accent', v)} />

        <TweakSection label="Net Worth hero"/>
        <TweakSelect label="Variant" value={t.heroVariant}
                     options={['trajectory', 'contour', 'solid']}
                     onChange={(v) => setTweak('heroVariant', v)} />

        <TweakSection label="Simulator chart"/>
        <TweakSelect label="Treatment" value={t.chartStyle}
                     options={['line', 'area', 'band']}
                     onChange={(v) => setTweak('chartStyle', v)} />

        <TweakSection label="Sidebar lockup"/>
        <TweakSelect label="Wordmark" value={t.sidebarLockup}
                     options={['mono', 'serif', 'mark-only']}
                     onChange={(v) => setTweak('sidebarLockup', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
