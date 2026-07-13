import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useScanner, ScannerContext } from './lib/scanner';
import type { ScanPayload } from './lib/types';
import { api } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
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
import UsersPage from './pages/UsersPage';
import SettingsPage from './pages/SettingsPage';
import OnboardingPage from './pages/OnboardingPage';

const isElectron = typeof window !== 'undefined' && !!(window as Window & { assetManager?: unknown }).assetManager
const H_HEIGHT = 56

// ── Electron IPC bridge ───────────────────────────────────────────────────────
const ipc = (window as any).assetManager ?? {};

// ── Toast system ──────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info'
interface Toast { id: number; type: ToastType; message: string }
interface ToastContextValue { showToast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })
export function useToast() { return useContext(ToastContext) }
let toastCounter = 0

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse', gap: 8, maxWidth: 420,
    }}>
      {toasts.map((t) => (
        <div key={t.id} className="animate-in" style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          borderRadius: 8,
          background: '#3c4043',
          color: '#fff',
          fontSize: 14,
          fontFamily: "'Google Sans', sans-serif",
          fontWeight: 400,
          minHeight: 48,
        }}>
          <span className="icon icon-sm" style={{
            color: t.type === 'success' ? '#81c995' : t.type === 'error' ? '#f28b82' : '#8ab4f8',
          }}>
            {t.type === 'success' ? 'check_circle' : t.type === 'error' ? 'error' : 'info'}
          </span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            style={{
              background: 'none', border: 'none', color: '#bdc1c6',
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
              borderRadius: 4,
            }}
          >
            <span className="icon icon-sm">close</span>
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Sync button ───────────────────────────────────────────────────────────────

function SyncButton({ showToast }: { showToast: (msg: string, type?: ToastType) => void }) {
  const [open, setOpen]       = useState(false)
  const [pending, setPending] = useState(0)
  const [busy, setBusy]       = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = () => api.getSyncStatus().then(s => setPending(s.pending_changes)).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    document.addEventListener('sync-status-changed', load)
    return () => { clearInterval(t); document.removeEventListener('sync-status-changed', load) }
  }, [])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function doSync(action: 'push' | 'pull') {
    setBusy(true); setOpen(false)
    try {
      if (action === 'push') {
        const r = await api.pushToExcel()
        showToast(r.message || 'Pushed to SharePoint', 'success')
      } else {
        await fetch('/api/sync/pull', { method: 'POST', headers: await _tokenHeaders() })
        showToast('Pulled from SharePoint', 'success')
      }
      const s = await api.getSyncStatus(); setPending(s.pending_changes)
      document.dispatchEvent(new CustomEvent('sync-status-changed'))
    } catch (err) { showToast(err instanceof Error ? err.message : 'Sync failed', 'error') }
    finally { setBusy(false) }
  }

  const synced = pending === 0
  const icon   = busy ? 'sync' : (synced ? 'cloud_done' : 'cloud_upload')
  const label  = busy ? 'Syncing' : synced ? 'Synced' : `${pending} pending`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 36,
          padding: '0 12px',
          border: 'none',
          borderRadius: 18,
          background: 'transparent',
          color: synced ? 'var(--text-2)' : 'var(--warn)',
          fontSize: 13,
          fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
          cursor: 'pointer',
          transition: 'background-color .12s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--h-hover-bg)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span className="icon icon-sm" style={{ animation: busy ? 'spin .8s linear infinite' : 'none' }}>{icon}</span>
        {label}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 200, zIndex: 200,
          background: 'var(--h-dropdown-bg)', border: '1px solid var(--h-dropdown-bdr)',
          borderRadius: 8, boxShadow: 'var(--shadow-2)', overflow: 'hidden',
          padding: '6px 0',
        }}>
          {[
            { label: 'Push to SharePoint', icon: 'upload',   action: 'push' as const },
            { label: 'Pull from SharePoint', icon: 'download', action: 'pull' as const },
          ].map(item => (
            <button key={item.action} onClick={() => doSync(item.action)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, color: 'var(--h-dropdown-text)', textAlign: 'left',
              fontFamily: "'Google Sans', sans-serif",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-dropdown-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span className="icon icon-sm" style={{ color: 'var(--text-2)' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

async function _tokenHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = {}
  try {
    const win = window as Window & { assetManager?: { getAppToken?: () => Promise<string>; getMsToken?: () => Promise<string | null> } }
    const app = await win.assetManager?.getAppToken?.()
    const ms  = await win.assetManager?.getMsToken?.()
    if (app) h['X-App-Token']   = app
    if (ms)  h['Authorization'] = `Bearer ${ms}`
  } catch { /* ignore */ }
  return h
}

// ── Shortcuts help modal ──────────────────────────────────────────────────────

const KBD_STYLE: React.CSSProperties = {
  display: 'inline-block', fontFamily: 'monospace', fontSize: 11,
  padding: '2px 7px', borderRadius: 4,
  background: 'var(--surface-3)', border: '1px solid var(--border)',
  color: 'var(--text-1)', whiteSpace: 'nowrap',
}

type ShortcutRow = { keys: string | string[]; action: string; scope: string }

function Kbd({ k }: { k: string | string[] }) {
  const keys = Array.isArray(k) ? k : [k]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {keys.map((key, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>then</span>}
          <kbd style={KBD_STYLE}>{key}</kbd>
        </span>
      ))}
    </span>
  )
}

function ShortcutsModal({ onClose, isAdmin, canCreate }: { onClose: () => void; isAdmin: boolean; canCreate: boolean }) {
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const groups: { heading: string; rows: ShortcutRow[] }[] = [
    {
      heading: 'Navigation',
      rows: [
        { keys: ['G', 'D'], action: 'Dashboard',     scope: 'Global' },
        { keys: ['G', 'A'], action: 'Browse assets', scope: 'Global' },
        { keys: ['G', 'E'], action: 'Employees',     scope: 'Global' },
        { keys: ['G', 'L'], action: 'Activity log',  scope: 'Global' },
        { keys: ['G', 'R'], action: 'Reports',       scope: 'Global' },
        ...(isAdmin ? [
          { keys: ['G', 'U'] as string[], action: 'Users',    scope: 'Global · Admin' },
          { keys: ['G', 'S'] as string[], action: 'Settings', scope: 'Global · Admin' },
        ] : []),
      ],
    },
    {
      heading: 'Search',
      rows: [
        { keys: '/',         action: 'Focus asset search', scope: 'Global' },
        { keys: 'Backspace', action: 'Go back',            scope: 'Global · not in text field' },
      ],
    },
    {
      heading: 'Actions',
      rows: [
        ...(canCreate ? [{ keys: 'Ctrl + N', action: 'New asset', scope: 'Global' }] : []),
        { keys: 'Ctrl + S', action: 'Save form', scope: 'Forms' },
        { keys: '?',        action: 'Toggle this help panel', scope: 'Global' },
        ...(isAdmin ? [{ keys: 'Ctrl + `', action: 'Toggle server log panel', scope: 'Global · Admin' }] : []),
      ],
    },
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', borderRadius: 16, padding: '28px 32px', maxWidth: 560, width: '90%', boxShadow: 'var(--shadow-2)', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500, color: 'var(--text-1)', fontFamily: "'Google Sans', sans-serif" }}>Keyboard shortcuts</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 4 }}>
            <span className="icon icon-sm">close</span>
          </button>
        </div>

        {groups.map(g => (
          <div key={g.heading} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{g.heading}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 0', width: 160 }}><Kbd k={r.keys} /></td>
                    <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-1)' }}>{r.action}</td>
                    <td style={{ padding: '8px 0', fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{r.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
          Navigation uses a two-key sequence: press <kbd style={KBD_STYLE}>G</kbd> then the letter within 800 ms. Disabled when focus is in a text field.
        </div>
      </div>
    </div>
  )
}

// ── Admin log panel ───────────────────────────────────────────────────────────

function LogPanel({ onClose }: { onClose: () => void }) {
  const [lines, setLines]   = useState<string[]>([])
  const [paused, setPaused] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const poll = () => {
      api.getAdminLogs(300)
        .then(d => { if (!paused) setLines(d.lines) })
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [paused])

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [lines, paused])

  function lineColor(line: string): string {
    if (/ ERROR /.test(line)) return '#f28b82'
    if (/ WARNING /.test(line)) return '#fdd663'
    return 'var(--text-2)'
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 260, zIndex: 200,
      background: 'var(--surface)', borderTop: '2px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 -4px 24px rgba(0,0,0,.12)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' }}>Server Logs</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button title={paused ? 'Resume' : 'Pause'} onClick={() => setPaused(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, display: 'flex' }}>
            <span className="icon icon-sm">{paused ? 'play_arrow' : 'pause'}</span>
          </button>
          <button title="Clear" onClick={() => setLines([])}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, display: 'flex' }}>
            <span className="icon icon-sm">delete_sweep</span>
          </button>
          <button title="Close" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, display: 'flex' }}>
            <span className="icon icon-sm">close</span>
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px', fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.55 }}>
        {lines.length === 0
          ? <span style={{ color: 'var(--text-3)' }}>No log entries yet…</span>
          : lines.map((line, i) => (
            <div key={i} style={{ color: lineColor(line), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>
          ))
        }
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Icon button ───────────────────────────────────────────────────────────────

function HeaderIconBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 18, border: 'none',
        background: 'transparent', color: 'var(--text-2)',
        cursor: 'pointer', transition: 'background-color .12s', flexShrink: 0,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--h-hover-bg)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span className="icon icon-sm">{icon}</span>
    </button>
  )
}

// ── User menu ─────────────────────────────────────────────────────────────────

function UserMenu() {
  const { user, authEnabled, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (!authEnabled || !user) return null

  const initials = (user.name || user.email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`${user.name} (${user.role})`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--primary)', color: 'var(--on-primary)',
          cursor: 'pointer', border: 'none',
          fontSize: 12, fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
          flexShrink: 0,
        }}
      >
        {initials}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 260, zIndex: 200,
          background: 'var(--h-dropdown-bg)', border: '1px solid var(--h-dropdown-bdr)',
          borderRadius: 12, boxShadow: 'var(--shadow-2)', overflow: 'hidden',
        }}>
          <div style={{ padding: '20px 16px', textAlign: 'center', borderBottom: '1px solid var(--h-dropdown-bdr)' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--primary)', color: 'var(--on-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 500, fontFamily: "'Google Sans', sans-serif",
              margin: '0 auto 12px',
            }}>{initials}</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>{user.name || user.email}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{user.email}</div>
            <div style={{
              marginTop: 10, display: 'inline-flex', alignItems: 'center',
              padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 500,
              background: 'var(--surface-3)', color: 'var(--text-2)',
            }}>
              {user.role}
            </div>
          </div>
          <button
            onClick={async () => { setOpen(false); await logout() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '12px 16px', border: 'none', background: 'none',
              color: 'var(--h-dropdown-text)', cursor: 'pointer', fontSize: 14,
              fontFamily: "'Google Sans', sans-serif",
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--h-dropdown-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span className="icon icon-sm" style={{ color: 'var(--text-2)' }}>logout</span>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// ── Scanner QR Modal ──────────────────────────────────────────────────────────

function ScannerQRButton({ connected }: { connected: boolean }) {
  const [open, setOpen]     = useState(false);
  const [url, setUrl]       = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/scanner-url').then(r => r.json()).then(d => setUrl(d.url)).catch(() => {});
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
        title={connected ? 'Scanner connected' : 'Open Mobile Scanner'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: 18, border: 'none',
          background: connected ? 'rgba(129,201,149,.15)' : 'transparent',
          color: connected ? 'var(--success)' : 'var(--text-2)',
          cursor: 'pointer', transition: 'background-color .12s', flexShrink: 0,
        }}
        onMouseEnter={e => { if (!connected) e.currentTarget.style.background = 'var(--h-hover-bg)' }}
        onMouseLeave={e => { if (!connected) e.currentTarget.style.background = 'transparent' }}
      >
        <span className="icon icon-sm">{connected ? 'qr_code_scanner' : 'qr_code'}</span>
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)', zIndex: 9999 }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 32, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 17, color: 'var(--text-1)' }}>Mobile Scanner</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Scan to open on your phone</div>
              </div>
              <HeaderIconBtn icon="close" title="Close" onClick={() => setOpen(false)} />
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

// ── Nav items ──────────────────────────────────────────────────────────────────

type NavItem = { to: string; end?: boolean; label: string; icon: string }

const NAV: NavItem[] = [
  { to: '/',          end: true, label: 'Browse',    icon: 'grid_view'   },
  { to: '/dashboard',            label: 'Dashboard', icon: 'dashboard'   },
  { to: '/employees',            label: 'People',    icon: 'group'       },
  { to: '/documents',            label: 'Reports',   icon: 'description' },
  { to: '/activity',             label: 'Activity',  icon: 'history'     },
]

const NAV_ADMIN: NavItem[] = []

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

function AppInner() {
  const { user, loading, authEnabled } = useAuth()
  const navigate = useNavigate()
  const isAdmin  = !authEnabled || user?.role === 'Admin'
  const canCreate = !authEnabled || user?.role === 'Admin' || user?.role === 'Editor'

  const [toasts,        setToasts]        = useState<Toast[]>([])
  const [logPanelOpen,  setLogPanelOpen]  = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const [lastFieldScan,  setLastFieldScan]  = useState<ScanPayload | null>(null)
  const [activeFieldId,  setActiveFieldId]  = useState<string | null>(null)

  const pendingGRef = useRef(false)
  const gTimerRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastCounter
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  // ── Theme ─────────────────────────────────────────────────────────────────
  const [theme, setThemeState] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('asset-theme') as 'light' | 'dark') || 'dark'
  )

  useEffect(() => {
    ipc.getTheme?.().then((t: string) => {
      if (t === 'dark' || t === 'light') setThemeState(t)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('asset-theme', theme)
  }, [theme])

  // ── Update notifications ──────────────────────────────────────────────────
  useEffect(() => {
    type Bridge = Window & { assetManager?: {
      onUpdateAvailable?:    (cb: (info: { version: string }) => void) => void
      onUpdateNotAvailable?: (cb: () => void) => void
    }}
    const win = window as Bridge
    win.assetManager?.onUpdateAvailable?.((info) => {
      showToast(`Update v${info.version} available — downloading in background`, 'info')
    })
    win.assetManager?.onUpdateNotAvailable?.(() => {
      showToast("You're on the latest version", 'success')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function isTyping(e: KeyboardEvent): boolean {
      const t = e.target as HTMLElement
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
    }

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'n' && canCreate) { e.preventDefault(); navigate('/new-asset'); return }
        if (e.key === '`' && isAdmin)   { e.preventDefault(); setLogPanelOpen(o => !o); return }
      }

      if (e.key === 'Escape') {
        if (shortcutsOpen) { setShortcutsOpen(false); return }
        if (logPanelOpen)  { setLogPanelOpen(false);  return }
      }

      if (e.key === 'Backspace' && !isTyping(e)) {
        e.preventDefault()
        navigate(-1)
        return
      }

      if (isTyping(e)) return

      if (pendingGRef.current) {
        clearTimeout(gTimerRef.current)
        pendingGRef.current = false
        const G_ROUTES: Record<string, string> = {
          d: '/dashboard', a: '/', e: '/employees', l: '/activity', r: '/documents',
          ...(isAdmin ? { u: '/users', s: '/settings' } : {}),
        }
        const route = G_ROUTES[e.key.toLowerCase()]
        if (route) { e.preventDefault(); navigate(route) }
        return
      }
      if (e.key === 'g' || e.key === 'G') {
        pendingGRef.current = true
        clearTimeout(gTimerRef.current)
        gTimerRef.current = setTimeout(() => { pendingGRef.current = false }, 800)
        return
      }

      if (e.key === '/') {
        e.preventDefault()
        document.dispatchEvent(new CustomEvent('focus-asset-search'))
        navigate('/')
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen(o => !o)
        return
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate, canCreate, isAdmin, shortcutsOpen, logPanelOpen])

  useEffect(() => {
    const open = () => setShortcutsOpen(true)
    document.addEventListener('open-shortcuts', open)
    return () => document.removeEventListener('open-shortcuts', open)
  }, [])

  // ── Scanner ───────────────────────────────────────────────────────────────
  const { connected, setScannerContext } = useScanner((payload: ScanPayload) => {
    if (payload.mode === 'context_action' && payload.context) {
      const { action, targetUser, oldAsset } = payload.context
      const userStr = targetUser || ''
      let assetId   = payload.value
      if (assetId.startsWith('http')) assetId = assetId.split('/').pop() || assetId

      try {
        if (action === 'assign') {
          fetch('/api/asset/assign', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_id: assetId, employee_email: userStr, condition: '', notes: 'Assigned via mobile scanner' })
          }).then(() => { showToast(`Assigned ${assetId}`); navigate(`/employee/${encodeURIComponent(userStr)}`); setScannerContext?.(null); });
        } else if (action === 'swap' && oldAsset) {
          fetch('/api/asset/return', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_id: oldAsset, employee_email: userStr, condition: '', notes: 'Swapped via scanner' })
          }).then(() => fetch('/api/asset/assign', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_id: assetId, employee_email: userStr, condition: '', notes: 'Swapped via scanner' })
          })).then(() => { showToast('Swapped assets'); navigate(`/employee/${encodeURIComponent(userStr)}`); setScannerContext?.(null); });
        }
      } catch (e) { console.error('Context action failed', e); }
      return;
    }

    if (payload.mode === 'asset_qr') {
      let assetId = payload.value
      if (assetId.startsWith('http')) { const parts = assetId.split('/'); assetId = parts[parts.length - 1]; }
      showToast(`Asset scanned: ${assetId}`)
      navigate(`/asset/${encodeURIComponent(assetId)}`)
    } else {
      showToast('Text received from scanner')
      setLastFieldScan(payload)
    }
  })

  // ── Loading / Login guards ────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-3)' }}>
      <span className="icon" style={{ fontSize: 32, animation: 'spin .8s linear infinite' }}>sync</span>
    </div>
  )

  if (authEnabled && !user) return (
    <ToastContext.Provider value={{ showToast }}>
      <LoginPage />
      <ToastContainer toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </ToastContext.Provider>
  )

  return (
    <ScannerContext.Provider value={{ lastFieldScan, clearFieldScan: () => setLastFieldScan(null), scannerConnected: connected, activeFieldId, setActiveFieldId, setScannerContext }}>
      <ToastContext.Provider value={{ showToast }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* ── Top app bar ─────────────────────────────────────────────── */}
          <header className="app-header" style={{
            position: 'sticky', top: 0, zIndex: 50,
            background: 'var(--h-bg)',
            borderBottom: '1px solid var(--h-border)',
            height: H_HEIGHT,
            display: 'flex', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div style={{
              width: '100%', maxWidth: 1440, margin: '0 auto',
              paddingLeft: 16, paddingRight: 16,
              display: 'flex', alignItems: 'center', gap: 0, height: '100%',
            }}>

              {/* Brand */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingRight: 24 }}>
                <img src="/assets/gravity_asset_v1.svg" alt="" style={{ width: 24, height: 24 }} />
                <div style={{
                  fontFamily: "'Google Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 16,
                  color: 'var(--text-1)',
                  lineHeight: 1,
                }}>
                  Asset Manager
                </div>
              </div>

              {/* Nav */}
              <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' }}>
                {[...NAV, ...(isAdmin ? NAV_ADMIN : [])].map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '0 12px', height: 36,
                      borderRadius: 18, textDecoration: 'none', whiteSpace: 'nowrap',
                      fontFamily: "'Google Sans', sans-serif", fontWeight: 500, fontSize: 13,
                      background: isActive ? 'var(--h-active-bg)' : 'transparent',
                      color: isActive ? 'var(--h-active-txt)' : 'var(--text-2)',
                      transition: 'background-color .12s, color .12s',
                    })}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLAnchorElement
                      if (el.getAttribute('aria-current') !== 'page') {
                        el.style.background = 'var(--h-hover-bg)'
                        el.style.color = 'var(--text-1)'
                      }
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLAnchorElement
                      if (el.getAttribute('aria-current') !== 'page') {
                        el.style.background = 'transparent'
                        el.style.color = 'var(--text-2)'
                      }
                    }}
                  >
                    <span className="icon icon-sm">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              {/* Right controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingLeft: 8 }}>
                {canCreate && (
                  <button
                    onClick={() => navigate('/new-asset')}
                    title="New Asset (Ctrl+N)"
                    className="md-btn md-btn-tonal md-btn-sm"
                    style={{ marginRight: 4 }}
                  >
                    <span className="icon icon-sm">add</span>New
                  </button>
                )}
                <SyncButton showToast={showToast} />
                {isAdmin && (
                  <HeaderIconBtn
                    icon="terminal"
                    title="Server logs (Ctrl+`)"
                    onClick={() => setLogPanelOpen(o => !o)}
                  />
                )}
                <NavLink
                  to="/settings"
                  title="Settings"
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 36, borderRadius: 18, border: 'none',
                    background: isActive ? 'var(--h-active-bg)' : 'transparent',
                    color: isActive ? 'var(--h-active-txt)' : 'var(--text-2)',
                    textDecoration: 'none', flexShrink: 0,
                    transition: 'background-color .12s, color .12s',
                  })}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    if (el.getAttribute('aria-current') !== 'page') {
                      el.style.background = 'var(--h-hover-bg)'
                      el.style.color = 'var(--text-1)'
                    }
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    if (el.getAttribute('aria-current') !== 'page') {
                      el.style.background = 'transparent'
                      el.style.color = 'var(--text-2)'
                    }
                  }}
                >
                  <span className="icon icon-sm">settings</span>
                </NavLink>
                <div style={{ marginLeft: 4 }}>
                  <UserMenu />
                </div>
                {isElectron && <div style={{ width: 138, flexShrink: 0 }} />}
              </div>
            </div>
          </header>

          {/* ── Page content ─────────────────────────────────────────────── */}
          <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px' }}>
              <Routes>
                <Route path="/"            element={<BrowsePage />} />
                <Route path="/dashboard"   element={<DashboardPage />} />
                <Route path="/asset/:id"   element={<AssetDetailPage />} />
                <Route path="/edit/:id"    element={<EditAssetPage />} />
                <Route path="/assign/:id"  element={<AssignPage />} />
                <Route path="/return/:id"  element={<ReturnPage />} />
                <Route path="/new-asset"   element={<NewAssetPage />} />
                <Route path="/employees"   element={<EmployeeManagerPage />} />
                <Route path="/new-employee" element={<NewEmployeePage />} />
                <Route path="/employee/:email" element={<EmployeePage />} />
                <Route path="/documents"   element={<DocumentsPage />} />
                <Route path="/activity"    element={<ActivityLogPage />} />
                <Route path="/swap/:id"    element={<SwapPage />} />
                <Route path="/users"       element={<UsersPageLazy />} />
                <Route path="/settings"    element={<SettingsPage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
              </Routes>
            </div>
          </main>
        </div>

        {isAdmin && logPanelOpen  && <LogPanel onClose={() => setLogPanelOpen(false)} />}
        {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} isAdmin={isAdmin} canCreate={canCreate} />}
        <ToastContainer toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
      </ToastContext.Provider>
    </ScannerContext.Provider>
  )
}

function UsersPageLazy() {
  const { user, authEnabled } = useAuth()
  const isAdmin = !authEnabled || user?.role === 'Admin'
  if (!isAdmin) return <div style={{ padding: 32, color: 'var(--text-2)' }}>Access denied</div>
  return <UsersPage />
}
