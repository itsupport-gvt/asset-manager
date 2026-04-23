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
    // <div className="flex gap-2 items-center">
    //   <div className="relative">
    //     <span className="icon icon-sm absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }}>search</span>
    //     <input
    //       type="text"
    //       value={q}
    //       onChange={e => setQ(e.target.value)}
    //       onKeyDown={e => e.key === 'Enter' && go()}
    //       placeholder="Asset ID or scan..."
    //       className="md-input pl-9 text-sm w-44 lg:w-60"
    //       style={{ borderRadius: 24, background: 'var(--surface-2)', border: '1px solid transparent' }}
    //     />
    //   </div>
    //   <button onClick={go} className="md-btn md-btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
    //     Go
    //   </button>
    // </div>
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span className="icon" style={{ position: 'absolute', left: 10, fontSize: 18, color: 'var(--text-3)', pointerEvents: 'none', zIndex: 1 }}>search</span>
      <input
        type="text" value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && go()}
        placeholder="Asset ID…"
        className="md-input"
        style={{ borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border)', paddingLeft: 36, paddingRight: 12, height: 36, width: 160, fontSize: 13 }}
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
          padding: '7px 10px', fontSize: 13, gap: 0,
          background: connected ? 'var(--success-bg)' : 'var(--surface-2)',
          color: connected ? 'var(--success)' : 'var(--text-2)',
          border: `1px solid ${connected ? '#ceead6' : 'var(--border)'}`,
          borderRadius: 8, minWidth: 0,
        }}
        title={connected ? 'Scanner connected' : 'Open Mobile Scanner'}
      >
        <span className="icon" style={{ fontSize: 20 }}>{connected ? 'qr_code_scanner' : 'qr_code'}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: 'rgba(32,33,36,.6)', backdropFilter: 'blur(4px)', zIndex: 9999 }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="md-card p-8 w-full max-w-sm flex flex-col items-center gap-5" style={{ borderRadius: 20 }}>
            <div className="w-full flex items-center justify-between">
              <div>
                <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--text-1)' }}>Mobile Scanner</h2>
                <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Scan to open on your phone</p>
              </div>
              <button onClick={() => setOpen(false)} className="md-btn" style={{ padding: 8, borderRadius: 50, background: 'var(--surface-2)', color: 'var(--text-2)', minWidth: 0 }}>
                <span className="icon">close</span>
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-white p-2 shadow-sm" style={{ width: 220, height: 220 }}>
              {!loaded && <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: 'var(--text-3)' }}>Generating…</div>}
              <img
                src={`/api/scanner-qr?t=${Date.now()}`}
                alt="Scanner QR"
                className="w-full h-full object-contain"
                style={{ opacity: loaded ? 1 : 0, transition: 'opacity .3s' }}
                onLoad={() => setLoaded(true)}
              />
            </div>

            {url && (
              <a href={url} target="_blank" rel="noreferrer"
                className="text-center break-all text-xs px-3 py-2 rounded-lg w-full"
                style={{ color: 'var(--primary)', background: 'var(--primary-bg)', fontFamily: 'monospace' }}>
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
      padding: '6px 11px', borderRadius: 8, fontSize: 13, fontWeight: active ? 600 : 400,
      fontFamily: "'Google Sans', sans-serif",
      color: active ? 'var(--primary)' : 'var(--text-2)',
      background: active ? 'var(--primary-bg)' : 'transparent',
      textDecoration: 'none', transition: 'background .15s, color .15s',
      whiteSpace: 'nowrap',
    }}>
      <span className="icon" style={{ fontSize: 18 }}>{icon}</span>
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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  async function push() {
    setSyncing(true); setOpen(false); setStatus('Pushing…');
    try { await fetch('/api/sync/push', { method: 'POST' }); setStatus('Pushed ✓'); fetchStatus(); }
    catch { setStatus('Push failed'); }
    setSyncing(false); setTimeout(() => setStatus(''), 3000);
  }

  async function pull() {
    setSyncing(true); setOpen(false); setStatus('Syncing from Excel…');
    try { await fetch('/api/sync/pull', { method: 'POST' }); setStatus('Synced ✓'); fetchStatus(); }
    catch { setStatus('Pull failed'); }
    setSyncing(false); setTimeout(() => setStatus(''), 3000);
  }

  async function pullLogs() {
    setSyncing(true); setOpen(false); setStatus('Importing logs…');
    try {
      const r = await fetch('/api/sync/pull-logs', { method: 'POST' });
      const d = await r.json();
      setStatus(d.success ? `Logs: +${d.imported}` : 'Log pull failed');
      fetchStatus();
    } catch { setStatus('Log pull failed'); }
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
          padding: '7px 14px', fontSize: 13, gap: 6, borderRadius: 8,
          background: syncing ? 'var(--surface-2)' : hasPending ? 'var(--warn-bg)' : 'var(--surface-2)',
          color: syncing ? 'var(--text-2)' : hasPending ? '#b06000' : 'var(--success)',
          border: `1px solid ${hasPending ? '#f9ab00' : syncing ? 'var(--border)' : 'transparent'}`,
        }}
        title="Sync options"
      >
        <span className="icon icon-sm" style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
          {syncing ? 'sync' : hasPending ? 'cloud_upload' : 'cloud_done'}
        </span>
        {status || (syncing ? 'Working…' : hasPending ? `Push (${pendingCount})` : 'Synced')}
        <span className="icon icon-sm" style={{ fontSize: 16, marginLeft: -2 }}>expand_more</span>
      </button>

      {open && (
        <div className="md-card" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 200,
          zIndex: 999, padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <button
            onClick={push}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer',
              color: hasPending ? '#b06000' : 'var(--text-2)', textAlign: 'left', width: '100%',
              fontWeight: hasPending ? 600 : 400, fontSize: 13,
            }}
          >
            <span className="icon icon-sm">cloud_upload</span>
            <span>
              Push to Excel
              {hasPending && <span style={{ marginLeft: 6, fontSize: 11, background: '#f9ab00', color: '#000', padding: '1px 6px', borderRadius: 10 }}>{pendingCount}</span>}
            </span>
          </button>
          <button
            onClick={pull}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer',
              color: 'var(--text-1)', textAlign: 'left', width: '100%', fontSize: 13,
            }}
          >
            <span className="icon icon-sm">cloud_download</span>
            Pull from Excel
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '2px 6px' }} />
          <button
            onClick={pullLogs}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer',
              color: 'var(--text-2)', textAlign: 'left', width: '100%', fontSize: 13,
            }}
          >
            <span className="icon icon-sm">history</span>
            Pull Activity Logs
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
          })).then(() => { triggerToast(`Swapped assets`); nav(`/employee/${encodeURIComponent(userStr)}`); setScannerContext?.(null); });
        }
      } catch (e) { console.error("Context action failed", e); }
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
          <div key={toastMsg.id} style={{
            position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--text-1)', color: '#fff',
            padding: '10px 20px', borderRadius: 24, fontSize: 13, fontWeight: 500,
            boxShadow: 'var(--shadow-3)', zIndex: 9998,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span className="icon icon-sm">check_circle</span>
            {toastMsg.msg}
          </div>
        )}

        {/* ── Top App Bar ── */}
        <header style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          boxShadow: 'var(--shadow-1)',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <div style={{
            maxWidth: 1280, margin: '0 auto', padding: '0 24px',
            height: 64, display: 'flex', alignItems: 'center', gap: 24,
          }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span className="icon" style={{ color: 'var(--primary)', fontSize: 28 }}>inventory_2</span>
              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--text-1)', letterSpacing: -.3 }}>
                AssetGravity
              </span>
            </div>

            {/* Nav — centre */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, justifyContent: 'center' }}>
              <NavLink to="/dashboard" icon="dashboard"   label="Dashboard" />
              <NavLink to="/"          icon="grid_view"   label="Browse"    />
              <NavLink to="/new-asset" icon="add_box"     label="Create"    />
              <NavLink to="/employees" icon="group"       label="People"    />
              <NavLink to="/documents" icon="description" label="Documents" />
              <NavLink to="/activity"  icon="history"     label="Activity"  />
            </nav>

            {/* Search */}
            <QuickLookup />

            <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

            {/* Right actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <ScannerQRButton connected={connected} />
              <SyncButton />
            </div>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main style={{ flex: 1, maxWidth: 1280, width: '100%', margin: '0 auto', padding: '28px 24px' }}>
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
