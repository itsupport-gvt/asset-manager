import { useState, useCallback, useEffect, useRef } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useScanner, ScannerContext } from './lib/scanner';
import type { ScanPayload } from './lib/types';
import { BrowsePage } from './pages/BrowsePage';
import { AssetDetailPage } from './pages/AssetDetailPage';
import { AssignPage } from './pages/AssignPage';
import { ReturnPage } from './pages/ReturnPage';
import { NewAssetPage } from './pages/NewAssetPage';
import { EditAssetPage } from './pages/EditAssetPage';
import { EmployeePage } from './pages/EmployeePage';
import { EmployeeManagerPage } from './pages/EmployeeManagerPage';
import { NewEmployeePage } from './pages/NewEmployeePage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ActivityLogPage } from './pages/ActivityLogPage';
import { SwapPage } from './pages/SwapPage';

// ── Electron IPC bridge (safe fallback for non-Electron / dev) ────────────────
const ipc = (window as any).assetManager ?? {};

// ── Quick Lookup ──────────────────────────────────────────────────────────────
function QuickLookup() {
  const [q, setQ] = useState('');
  const nav = useNavigate();

  function go() {
    const id = q.trim();
    if (!id) return;
    nav(`/asset/${encodeURIComponent(id)}`);
    setQ('');
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span className="icon" style={{ position: 'absolute', left: 9, fontSize: 15, color: 'var(--text-3)', pointerEvents: 'none', zIndex: 1 }}>search</span>
      <input
        type="text" value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && go()}
        placeholder="Asset ID…"
        className="md-input"
        style={{ borderRadius: 6, paddingLeft: 30, paddingRight: 10, height: 32, width: 148, fontSize: 12 }}
      />
    </div>
  );
}

// ── Scanner QR Modal ──────────────────────────────────────────────────────────
function ScannerQRButton({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/scanner-url').then(r => r.json()).then(d => setUrl(d.url)).catch(() => { });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => { setOpen(true); setLoaded(false); }}
        className="md-btn"
        style={{
          padding: '5px 9px', fontSize: 12, gap: 0,
          background: connected ? 'rgba(63,185,80,.12)' : 'var(--surface-2)',
          color: connected ? 'var(--success)' : 'var(--text-2)',
          border: `1px solid ${connected ? 'rgba(63,185,80,.25)' : 'var(--border)'}`,
          borderRadius: 6, minWidth: 0,
        }}
        title={connected ? 'Scanner connected' : 'Open Mobile Scanner'}
      >
        <span className="icon" style={{ fontSize: 17 }}>{connected ? 'qr_code_scanner' : 'qr_code'}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)', zIndex: 9999 }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="md-card p-8 w-full max-w-sm flex flex-col items-center gap-5" style={{ borderRadius: 14 }}>
            <div className="w-full flex items-center justify-between">
              <div>
                <h2 style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-1)' }}>Mobile Scanner</h2>
                <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Scan to open on your phone</p>
              </div>
              <button onClick={() => setOpen(false)} className="md-btn" style={{ padding: 7, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-2)', minWidth: 0 }}>
                <span className="icon">close</span>
              </button>
            </div>
            <div style={{ borderRadius: 10, overflow: 'hidden', background: '#fff', padding: 8, width: 216, height: 216, position: 'relative' }}>
              {!loaded && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#666' }}>Generating…</div>}
              <img
                src={`/api/scanner-qr?t=${Date.now()}`}
                alt="Scanner QR"
                style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: loaded ? 1 : 0, transition: 'opacity .3s' }}
                onLoad={() => setLoaded(true)}
              />
            </div>
            {url && (
              <a href={url} target="_blank" rel="noreferrer"
                style={{ color: 'var(--primary)', background: 'var(--primary-bg)', fontFamily: 'monospace', fontSize: 11, padding: '6px 12px', borderRadius: 6, wordBreak: 'break-all', width: '100%', textAlign: 'center', textDecoration: 'none' }}>
                {url}
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Nav Link ──────────────────────────────────────────────────────────────────
function NavLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to.split('/:')[0]));
  return (
    <Link to={to} title={label} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: active ? 600 : 400,
      color: active ? 'var(--primary)' : 'var(--text-2)',
      background: active ? 'var(--primary-bg)' : 'transparent',
      textDecoration: 'none', transition: 'background .12s, color .12s',
      whiteSpace: 'nowrap', border: active ? '1px solid rgba(88,166,255,.2)' : '1px solid transparent',
    }}>
      <span className="icon" style={{ fontSize: 15 }}>{icon}</span>
      {label}
    </Link>
  );
}

// ── Sync Button ───────────────────────────────────────────────────────────────
function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPending] = useState(0);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(() => {
    fetch('/api/sync/status').then(r => r.json()).then(d => setPending(d.pending_changes || 0)).catch(() => { });
  }, []);

  useEffect(() => { fetchStatus(); const iv = setInterval(fetchStatus, 5000); return () => clearInterval(iv); }, [fetchStatus]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function push() {
    setSyncing(true); setOpen(false); setStatus('Pushing…');
    try { await fetch('/api/sync/push', { method: 'POST' }); setStatus('Pushed ✓'); fetchStatus(); }
    catch { setStatus('Failed'); }
    setSyncing(false); setTimeout(() => setStatus(''), 3000);
  }

  async function pull() {
    setSyncing(true); setOpen(false); setStatus('Syncing…');
    try { await fetch('/api/sync/pull', { method: 'POST' }); setStatus('Synced ✓'); fetchStatus(); }
    catch { setStatus('Failed'); }
    setSyncing(false); setTimeout(() => setStatus(''), 3000);
  }

  async function pullLogs() {
    setSyncing(true); setOpen(false); setStatus('Importing…');
    try {
      const r = await fetch('/api/sync/pull-logs', { method: 'POST' });
      const d = await r.json();
      setStatus(d.success ? `+${d.imported} logs` : 'Failed');
      fetchStatus();
    } catch { setStatus('Failed'); }
    setSyncing(false); setTimeout(() => setStatus(''), 4000);
  }

  const hasPending = pendingCount > 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={syncing}
        className="md-btn"
        style={{
          padding: '5px 10px', fontSize: 12, gap: 5, borderRadius: 6,
          background: syncing ? 'var(--surface-2)' : hasPending ? 'rgba(210,153,34,.12)' : 'var(--surface-2)',
          color: syncing ? 'var(--text-2)' : hasPending ? 'var(--warn)' : 'var(--success)',
          border: `1px solid ${hasPending ? 'rgba(210,153,34,.3)' : 'var(--border)'}`,
        }}
        title="Sync options"
      >
        <span className="icon" style={{ fontSize: 15, animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
          {syncing ? 'sync' : hasPending ? 'cloud_upload' : 'cloud_done'}
        </span>
        <span style={{ fontSize: 11 }}>
          {status || (syncing ? 'Working…' : hasPending ? `${pendingCount} pending` : 'Synced')}
        </span>
        <span className="icon" style={{ fontSize: 13, color: 'var(--text-3)' }}>expand_more</span>
      </button>

      {open && (
        <div className="md-card" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 196,
          zIndex: 999, padding: 4, display: 'flex', flexDirection: 'column', gap: 1,
        }}>
          <button onClick={push} style={menuItemStyle(hasPending)}>
            <span className="icon icon-sm">cloud_upload</span>
            <span>Push to Excel {hasPending && <span style={{ marginLeft: 5, fontSize: 10, background: 'var(--warn)', color: '#000', padding: '1px 5px', borderRadius: 8, fontWeight: 600 }}>{pendingCount}</span>}</span>
          </button>
          <button onClick={pull} style={menuItemStyle(false)}>
            <span className="icon icon-sm">cloud_download</span>
            Pull from Excel
          </button>
        </div>
      )}
    </div>
  );
}

function menuItemStyle(highlight: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
    background: 'none', border: 'none', borderRadius: 5, cursor: 'pointer',
    color: highlight ? 'var(--warn)' : 'var(--text-1)',
    textAlign: 'left', width: '100%', fontWeight: highlight ? 600 : 400, fontSize: 12,
  };
}

// ── App Menu (gear / settings / theme) ───────────────────────────────────────
function AppMenu({ theme, onToggleTheme }: { theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ipc.getAppVersion?.().then((v: string) => setVersion(v)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="md-btn"
        title="Settings & more"
        style={{ padding: '5px 8px', borderRadius: 6, background: 'transparent', border: '1px solid transparent', color: 'var(--text-2)', minWidth: 0 }}
      >
        <span className="icon" style={{ fontSize: 17 }}>settings</span>
      </button>

      {open && (
        <div className="md-card animate-in" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 220,
          zIndex: 999, padding: 4, display: 'flex', flexDirection: 'column', gap: 1,
        }}>
          {/* Theme toggle */}
          <button onClick={() => { onToggleTheme(); setOpen(false); }} style={menuItemStyle(false)}>
            <span className="icon icon-sm">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
            Switch to {theme === 'dark' ? 'Light' : 'Dark'} Theme
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 6px' }} />
          <button onClick={() => { setOpen(false); ipc.openSettings?.(); }} style={menuItemStyle(false)}>
            <span className="icon icon-sm">tune</span> Connections & Setup
          </button>
          <button onClick={() => { setOpen(false); ipc.checkForUpdates?.(); }} style={menuItemStyle(false)}>
            <span className="icon icon-sm">system_update</span> Check for Updates
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 6px' }} />
          <button onClick={() => { setOpen(false); ipc.showAbout?.(); }} style={{ ...menuItemStyle(false), color: 'var(--text-2)' }}>
            <span className="icon icon-sm">info</span>
            <span>About {version && <span style={{ color: 'var(--text-3)', fontSize: 11 }}>v{version}</span>}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [lastFieldScan, setLastFieldScan] = useState<ScanPayload | null>(null);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; id: number } | null>(null);
  const nav = useNavigate();

  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    ipc.setTheme?.(theme).catch(() => {});
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  function triggerToast(msg: string) {
    setToastMsg({ msg, id: Date.now() });
    setTimeout(() => setToastMsg(null), 3000);
  }

  const { connected, setScannerContext } = useScanner((payload: ScanPayload) => {
    if (payload.mode === 'context_action' && payload.context) {
      const { action, targetUser, oldAsset } = payload.context;
      const userStr = targetUser || '';
      let assetId = payload.value;
      if (assetId.startsWith('http')) assetId = assetId.split('/').pop() || assetId;

      try {
        if (action === 'assign') {
          fetch('/api/asset/assign', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_id: assetId, employee_email: userStr, condition: '', notes: 'Assigned via mobile scanner' })
          }).then(() => { triggerToast(`Assigned ${assetId}`); nav(`/employee/${encodeURIComponent(userStr)}`); setScannerContext?.(null); });
        } else if (action === 'swap' && oldAsset) {
          fetch('/api/asset/return', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_id: oldAsset, employee_email: userStr, condition: '', notes: 'Swapped via scanner' })
          }).then(() => fetch('/api/asset/assign', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_id: assetId, employee_email: userStr, condition: '', notes: 'Swapped via scanner' })
          })).then(() => { triggerToast('Swapped assets'); nav(`/employee/${encodeURIComponent(userStr)}`); setScannerContext?.(null); });
        }
      } catch (e) { console.error('Context action failed', e); }
      return;
    }

    if (payload.mode === 'asset_qr') {
      let assetId = payload.value;
      if (assetId.startsWith('http')) { const parts = assetId.split('/'); assetId = parts[parts.length - 1]; }
      triggerToast(`Asset scanned: ${assetId}`);
      nav(`/asset/${encodeURIComponent(assetId)}`);
    } else {
      triggerToast('Text received from scanner');
      setLastFieldScan(payload);
    }
  });

  return (
    <ScannerContext.Provider value={{ lastFieldScan, clearFieldScan: () => setLastFieldScan(null), scannerConnected: connected, activeFieldId, setActiveFieldId, setScannerContext }}>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

        {/* Toast */}
        {toastMsg && (
          <div key={toastMsg.id} className="animate-in" style={{
            position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface-3)', color: 'var(--text-1)',
            padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            boxShadow: 'var(--shadow-3)', zIndex: 9998, border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span className="icon icon-sm" style={{ color: 'var(--success)' }}>check_circle</span>
            {toastMsg.msg}
          </div>
        )}

        {/* ── Top Header / Title Bar ── */}
        <header
          className="titlebar-drag"
          style={{
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            position: 'sticky', top: 0, zIndex: 100,
          }}
        >
          <div style={{
            paddingLeft: 16,
            paddingRight: 152,   /* clear native win controls (~138px + gap) */
            height: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <img src="/assets/gravity_asset_v1.svg" alt="Logo" style={{ width: 26, height: 26, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', letterSpacing: -.2 }}>
                AssetGravity
              </span>
            </div>

            <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

            {/* Nav */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              <NavLink to="/dashboard" icon="dashboard"   label="Dashboard" />
              <NavLink to="/"          icon="grid_view"   label="Browse"    />
              <NavLink to="/new-asset" icon="add_box"     label="Create"    />
              <NavLink to="/employees" icon="group"       label="People"    />
              <NavLink to="/documents" icon="description" label="Documents" />
              <NavLink to="/activity"  icon="history"     label="Activity"  />
            </nav>

            {/* Right actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <QuickLookup />
              <ScannerQRButton connected={connected} />
              <SyncButton />
              {/* Theme toggle — always visible */}
              <button
                onClick={toggleTheme}
                className="md-btn"
                title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                style={{ padding: '5px 8px', borderRadius: 6, background: 'transparent', border: '1px solid transparent', color: 'var(--text-2)', minWidth: 0 }}
              >
                <span className="icon" style={{ fontSize: 17 }}>{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
              </button>
              <AppMenu theme={theme} onToggleTheme={toggleTheme} />
            </div>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main style={{ flex: 1, maxWidth: 1280, width: '100%', margin: '0 auto', padding: '24px 20px' }}>
          <Routes>
            <Route path="/" element={<BrowsePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/asset/:id" element={<AssetDetailPage />} />
            <Route path="/edit/:id" element={<EditAssetPage />} />
            <Route path="/assign/:id" element={<AssignPage />} />
            <Route path="/return/:id" element={<ReturnPage />} />
            <Route path="/new-asset" element={<NewAssetPage />} />
            <Route path="/employees" element={<EmployeeManagerPage />} />
            <Route path="/new-employee" element={<NewEmployeePage />} />
            <Route path="/employee/:email" element={<EmployeePage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/activity"  element={<ActivityLogPage />} />
            <Route path="/swap/:id"  element={<SwapPage />} />
          </Routes>
        </main>
      </div>
    </ScannerContext.Provider>
  );
}
