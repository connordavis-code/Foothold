/* global React, Icon */
const { useState: useSetState } = React;

// ============================================================
// Settings — preferences, connected accounts, profile, danger zone
// ============================================================

const CONNECTED = [
  { id: 'chase',       name: 'Chase',                 type: 'Checking · Savings · Credit', accts: 3, status: 'connected', last: '2h ago', logo: 'C', color: '#117ACA' },
  { id: 'amex',        name: 'American Express',      type: 'Credit',                       accts: 1, status: 'connected', last: '4h ago', logo: 'A', color: '#016fd0' },
  { id: 'wealthfront', name: 'Wealthfront',           type: 'Brokerage · Cash',             accts: 2, status: 'connected', last: '6h ago', logo: 'W', color: '#5b6f8a' },
  { id: 'fidelity',    name: 'Fidelity',              type: '401(k) · Brokerage',           accts: 2, status: 'connected', last: '1d ago', logo: 'F', color: '#368727' },
  { id: 'robinhood',   name: 'Robinhood',             type: 'Brokerage',                    accts: 1, status: 'reauth',    last: '4d ago', logo: 'R', color: '#000' },
  { id: 'schwab',      name: 'Charles Schwab',        type: 'Brokerage',                    accts: 0, status: 'disconnected', last: '14d ago', logo: 'S', color: '#00a0df' },
];

function Toggle({ on, onChange }) {
  return (
    <button
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    >
      <span className="toggle-knob"></span>
    </button>
  );
}

function Settings() {
  const [section, setSection] = useSetState('profile');
  const [prefs, setPrefs] = useSetState({
    weeklyBrief: true,
    driftAlerts: true,
    bigBuyAlerts: true,
    monthlyReport: false,
    marketingEmails: false,
    densityMode: 'comfortable',
    currency: 'USD',
    dateFormat: 'MM DD YYYY',
    weekStart: 'Sunday',
    syncFrequency: 'realtime',
    biometric: true,
    twoFactor: true,
  });

  const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));

  const sections = [
    { id: 'profile',      label: 'Profile' },
    { id: 'accounts',     label: 'Connected accounts' },
    { id: 'notifications',label: 'Notifications' },
    { id: 'preferences',  label: 'Preferences' },
    { id: 'security',     label: 'Privacy & security' },
    { id: 'data',         label: 'Data & export' },
    { id: 'danger',       label: 'Danger zone' },
  ];

  return (
    <div className="page settings-page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Account</div>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>
      <p className="page-sub" style={{ margin: '0 clamp(20px, 4vw, 40px) 28px', maxWidth: 540 }}>
        How Foothold works for you. Quiet defaults; everything adjustable.
      </p>

      <div className="settings-shell">
        {/* Side rail */}
        <aside className="settings-rail">
          {sections.map((s) => (
            <button
              key={s.id}
              className={`settings-rail-item ${section === s.id ? 'active' : ''} ${s.id === 'danger' ? 'is-danger' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <span className="settings-rail-dot"></span>
              {s.label}
            </button>
          ))}
        </aside>

        {/* Body */}
        <div className="settings-body">

          {section === 'profile' && (
            <div className="settings-section">
              <header className="settings-section-head">
                <h2 className="settings-h2">Profile</h2>
                <p className="settings-p">Identity and contact. Used for sign-in and account recovery only.</p>
              </header>
              <div className="settings-card">
                <div className="profile-grid">
                  <div className="profile-avatar"><span>SK</span></div>
                  <div className="profile-fields">
                    <div className="settings-field">
                      <label>Name</label>
                      <input type="text" defaultValue="Sara Kim"/>
                    </div>
                    <div className="settings-field">
                      <label>Email</label>
                      <input type="email" defaultValue="sara@kim.co"/>
                    </div>
                    <div className="settings-field">
                      <label>Time zone</label>
                      <select defaultValue="America/New_York">
                        <option>America/New_York</option>
                        <option>America/Los_Angeles</option>
                        <option>America/Chicago</option>
                        <option>Europe/London</option>
                      </select>
                    </div>
                    <div className="settings-field">
                      <label>Member since</label>
                      <div className="settings-readonly num">March 2024</div>
                    </div>
                  </div>
                </div>
                <div className="settings-row-actions">
                  <button className="btn ghost">Discard</button>
                  <button className="btn primary">Save changes</button>
                </div>
              </div>
            </div>
          )}

          {section === 'accounts' && (
            <div className="settings-section">
              <header className="settings-section-head">
                <h2 className="settings-h2">Connected accounts</h2>
                <p className="settings-p">Banks, brokerages, and credit. Foothold reads transactions; never moves money.</p>
              </header>
              <ul className="conn-list">
                {CONNECTED.map((c) => (
                  <li key={c.id} className={`conn-row status-${c.status}`}>
                    <div className="conn-logo" style={{ background: c.color }}>{c.logo}</div>
                    <div className="conn-info">
                      <div className="conn-name">{c.name}</div>
                      <div className="conn-meta">{c.type} · {c.accts} {c.accts === 1 ? 'account' : 'accounts'}</div>
                    </div>
                    <div className="conn-status">
                      <span className={`conn-dot status-${c.status}`}></span>
                      <span className="conn-status-label">
                        {c.status === 'connected'    ? 'Synced' :
                         c.status === 'reauth'       ? 'Needs reauth' :
                                                       'Disconnected'}
                      </span>
                      <span className="conn-status-time">{c.last}</span>
                    </div>
                    <div className="conn-actions">
                      {c.status === 'connected'    && <button className="btn ghost btn-sm">Manage</button>}
                      {c.status === 'reauth'       && <button className="btn primary btn-sm">Reconnect</button>}
                      {c.status === 'disconnected' && <button className="btn ghost btn-sm">Reconnect</button>}
                    </div>
                  </li>
                ))}
              </ul>
              <button className="btn ghost settings-add"><Icon name="plus" size={13}/> Connect another institution</button>
            </div>
          )}

          {section === 'notifications' && (
            <div className="settings-section">
              <header className="settings-section-head">
                <h2 className="settings-h2">Notifications</h2>
                <p className="settings-p">Foothold is quiet by default. Each alert below earns its place — no marketing nudges, ever.</p>
              </header>
              <div className="settings-card">
                <ul className="settings-toggle-list">
                  <li>
                    <div>
                      <div className="settings-toggle-label">Weekly brief</div>
                      <div className="settings-toggle-desc">Sunday evening · what changed, what's coming, one paragraph.</div>
                    </div>
                    <Toggle on={prefs.weeklyBrief} onChange={(v) => set('weeklyBrief', v)}/>
                  </li>
                  <li>
                    <div>
                      <div className="settings-toggle-label">Drift alerts</div>
                      <div className="settings-toggle-desc">When spending breaks pattern. Triggered, not scheduled.</div>
                    </div>
                    <Toggle on={prefs.driftAlerts} onChange={(v) => set('driftAlerts', v)}/>
                  </li>
                  <li>
                    <div>
                      <div className="settings-toggle-label">Big-buy preview</div>
                      <div className="settings-toggle-desc">Charges &gt; $200 surface here before they post.</div>
                    </div>
                    <Toggle on={prefs.bigBuyAlerts} onChange={(v) => set('bigBuyAlerts', v)}/>
                  </li>
                  <li>
                    <div>
                      <div className="settings-toggle-label">Monthly report</div>
                      <div className="settings-toggle-desc">First of every month · long-form recap, optional.</div>
                    </div>
                    <Toggle on={prefs.monthlyReport} onChange={(v) => set('monthlyReport', v)}/>
                  </li>
                  <li>
                    <div>
                      <div className="settings-toggle-label">Product updates</div>
                      <div className="settings-toggle-desc">When something new ships. Maybe twice a quarter.</div>
                    </div>
                    <Toggle on={prefs.marketingEmails} onChange={(v) => set('marketingEmails', v)}/>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {section === 'preferences' && (
            <div className="settings-section">
              <header className="settings-section-head">
                <h2 className="settings-h2">Preferences</h2>
                <p className="settings-p">Format and rhythm. The way numbers, dates, and density should feel.</p>
              </header>
              <div className="settings-card">
                <div className="settings-field-grid">
                  <div className="settings-field">
                    <label>Density</label>
                    <div className="settings-segment">
                      {['compact', 'comfortable', 'roomy'].map((d) => (
                        <button key={d} className={`settings-seg-btn ${prefs.densityMode === d ? 'active' : ''}`} onClick={() => set('densityMode', d)}>{d[0].toUpperCase() + d.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-field">
                    <label>Currency</label>
                    <select value={prefs.currency} onChange={(e) => set('currency', e.target.value)}>
                      <option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>JPY</option>
                    </select>
                  </div>
                  <div className="settings-field">
                    <label>Date format</label>
                    <select value={prefs.dateFormat} onChange={(e) => set('dateFormat', e.target.value)}>
                      <option>MM DD YYYY</option><option>DD MM YYYY</option><option>YYYY MM DD</option>
                    </select>
                  </div>
                  <div className="settings-field">
                    <label>Week starts</label>
                    <div className="settings-segment">
                      {['Sunday', 'Monday'].map((d) => (
                        <button key={d} className={`settings-seg-btn ${prefs.weekStart === d ? 'active' : ''}`} onClick={() => set('weekStart', d)}>{d}</button>
                      ))}
                    </div>
                  </div>
                  <div className="settings-field">
                    <label>Sync frequency</label>
                    <select value={prefs.syncFrequency} onChange={(e) => set('syncFrequency', e.target.value)}>
                      <option value="realtime">Real-time (recommended)</option>
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {section === 'security' && (
            <div className="settings-section">
              <header className="settings-section-head">
                <h2 className="settings-h2">Privacy &amp; security</h2>
                <p className="settings-p">Foothold reads, never moves. Connections use bank-grade tokenization; we never store credentials.</p>
              </header>
              <div className="settings-card">
                <ul className="settings-toggle-list">
                  <li>
                    <div>
                      <div className="settings-toggle-label">Biometric unlock</div>
                      <div className="settings-toggle-desc">Face ID or fingerprint on mobile and desktop.</div>
                    </div>
                    <Toggle on={prefs.biometric} onChange={(v) => set('biometric', v)}/>
                  </li>
                  <li>
                    <div>
                      <div className="settings-toggle-label">Two-factor authentication</div>
                      <div className="settings-toggle-desc">Required at sign-in. Authenticator app or hardware key.</div>
                    </div>
                    <Toggle on={prefs.twoFactor} onChange={(v) => set('twoFactor', v)}/>
                  </li>
                </ul>
              </div>

              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-toggle-label">Active sessions</div>
                    <div className="settings-toggle-desc">3 devices · last activity 2 minutes ago</div>
                  </div>
                  <button className="btn ghost btn-sm">Manage</button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-toggle-label">Change password</div>
                    <div className="settings-toggle-desc">Last changed 4 months ago</div>
                  </div>
                  <button className="btn ghost btn-sm">Update</button>
                </div>
              </div>
            </div>
          )}

          {section === 'data' && (
            <div className="settings-section">
              <header className="settings-section-head">
                <h2 className="settings-h2">Data &amp; export</h2>
                <p className="settings-p">Your data is yours. Take it whenever, in whatever shape works.</p>
              </header>
              <div className="settings-card">
                <div className="settings-row">
                  <div>
                    <div className="settings-toggle-label">Download all transactions</div>
                    <div className="settings-toggle-desc">CSV · 18 months · 1,484 rows</div>
                  </div>
                  <button className="btn ghost btn-sm">Export CSV</button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-toggle-label">Tax package</div>
                    <div className="settings-toggle-desc">Year-end summary, categorized for filing</div>
                  </div>
                  <button className="btn ghost btn-sm">Generate</button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-toggle-label">Account snapshot</div>
                    <div className="settings-toggle-desc">Full JSON archive of everything Foothold knows</div>
                  </div>
                  <button className="btn ghost btn-sm">Download</button>
                </div>
              </div>
            </div>
          )}

          {section === 'danger' && (
            <div className="settings-section">
              <header className="settings-section-head">
                <h2 className="settings-h2 settings-h2-danger">Danger zone</h2>
                <p className="settings-p">Irreversible actions. We'll ask twice before doing any of these.</p>
              </header>
              <div className="settings-card settings-card-danger">
                <div className="settings-row">
                  <div>
                    <div className="settings-toggle-label">Disconnect all institutions</div>
                    <div className="settings-toggle-desc">Stops all syncing. Historical data is preserved.</div>
                  </div>
                  <button className="btn ghost btn-sm danger-btn">Disconnect</button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-toggle-label">Reset Foothold</div>
                    <div className="settings-toggle-desc">Delete all categories, goals, and preferences. Keep account.</div>
                  </div>
                  <button className="btn ghost btn-sm danger-btn">Reset</button>
                </div>
                <div className="settings-row">
                  <div>
                    <div className="settings-toggle-label">Delete account</div>
                    <div className="settings-toggle-desc">All data is permanently removed within 30 days.</div>
                  </div>
                  <button className="btn ghost btn-sm danger-btn">Delete</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Settings });
