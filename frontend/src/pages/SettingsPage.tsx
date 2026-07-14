import { useEffect, useState, useRef, type FormEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../App'
import type { OverlayConfig, OverlayDefaults } from '../lib/types'

const isElectron = typeof window !== 'undefined' && !!(window as any).assetManager

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="md-card" style={{ padding: '24px 28px', marginBottom: 16, breakInside: 'avoid' }}>
      <h2 className="section-title" style={{ marginBottom: 16 }}>{title}</h2>
      {children}
    </section>
  )
}

function StatRow({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: warn ? 'var(--warn)' : 'var(--text-1)' }}>{value}</span>
    </div>
  )
}

type SyncStatus = { pending_changes: number; last_sync?: string; status?: string }
type Config = {
  SHAREPOINT_FILE_URL: string
  NGROK_URL: string
  AUTH_CLIENT_ID: string
}

export default function SettingsPage() {
  const { showToast } = useToast()
  const { user, authEnabled } = useAuth()
  const isAdmin = !authEnabled || user?.role === 'Admin'

  const [syncStatus,     setSyncStatus]     = useState<SyncStatus | null>(null)
  const [syncLoading,    setSyncLoading]    = useState(true)
  const [pushBusy,       setPushBusy]       = useState(false)
  const [pullBusy,       setPullBusy]       = useState(false)
  const [pullLogsBusy,   setPullLogsBusy]   = useState(false)
  const [markBusy,       setMarkBusy]       = useState(false)
  const [configLoading,  setConfigLoading]  = useState(false)
  const [configSaving,   setConfigSaving]   = useState(false)
  const [config,         setConfig]         = useState<Config>({
    SHAREPOINT_FILE_URL: '',
    NGROK_URL:           '',
    AUTH_CLIENT_ID:      '',
  })
  const [appVersion, setAppVersion] = useState('')
  const [logPath,    setLogPath]    = useState('')
  const [theme, setThemeState] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('asset-theme') as 'light' | 'dark') || 'dark'
  )

  // Overlay calibration state
  const [overlayConfig,       setOverlayConfig]       = useState<OverlayConfig | null>(null)
  const [overlayHasOverrides, setOverlayHasOverrides] = useState(false)
  const [overlayP1Y,          setOverlayP1Y]          = useState('')
  const [overlayP2Y,          setOverlayP2Y]          = useState('')
  const [overlayRowH,         setOverlayRowH]         = useState('')
  const [overlaySaving,       setOverlaySaving]       = useState(false)
  const [overlayDocxLoading,  setOverlayDocxLoading]  = useState(false)
  const [overlayMsg,          setOverlayMsg]          = useState('')
  const overlayDocxRef = useRef<HTMLInputElement>(null)

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', next === 'dark')
    localStorage.setItem('asset-theme', next)
    ;(window as any).assetManager?.setTheme?.(next).catch?.(() => {})
    setThemeState(next)
  }

  function applyOverlayConfig(cfg: OverlayConfig) {
    setOverlayConfig(cfg)
    setOverlayP1Y(String(cfg.table_data_start_y_mm))
    setOverlayP2Y(String(cfg.table_data_start_y_mm_page2))
    setOverlayRowH(String(cfg.row_height_mm))
  }

  useEffect(() => {
    api.getOverlayDefaults()
      .then(r => { applyOverlayConfig(r.config); setOverlayHasOverrides(r.has_user_overrides) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    api.getSyncStatus().then(setSyncStatus).catch(() => {}).finally(() => setSyncLoading(false))
    if (isElectron) {
      const ipc = (window as any).assetManager
      setConfigLoading(true)
      ipc.getConfig?.()
        .then((cfg: Partial<Config>) => setConfig(c => ({ ...c, ...cfg })))
        .catch(() => {})
        .finally(() => setConfigLoading(false))
      ipc.getAppVersion?.().then(setAppVersion).catch(() => setAppVersion('Unknown'))
      ipc.getLogPath?.().then(setLogPath).catch(() => {})
    } else {
      setAppVersion('Web mode')
    }
  }, [])

  async function handlePush() {
    setPushBusy(true)
    try {
      const r = await api.pushToExcel()
      showToast(r.message || 'Pushed to Excel', 'success')
      window.dispatchEvent(new CustomEvent('sync-status-changed'))
      api.getSyncStatus().then(setSyncStatus).catch(() => {})
    } catch (e) { showToast(e instanceof Error ? e.message : 'Push failed', 'error') }
    finally { setPushBusy(false) }
  }

  async function handlePull() {
    setPullBusy(true)
    try {
      const r = await api.pullFromExcel()
      showToast(r.message || 'Pulled from Excel', r.success ? 'success' : 'error')
      api.getSyncStatus().then(setSyncStatus).catch(() => {})
    } catch (e) { showToast(e instanceof Error ? e.message : 'Pull failed', 'error') }
    finally { setPullBusy(false) }
  }

  async function handlePullLogs() {
    setPullLogsBusy(true)
    try {
      const r = await api.pullLogs()
      showToast(r.message || `Imported ${r.imported} log entries`, r.success ? 'success' : 'error')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Pull logs failed', 'error') }
    finally { setPullLogsBusy(false) }
  }

  async function handleMarkAllForSync() {
    if (!window.confirm('Mark all assets as pending sync?\n\nThe next push will re-send every asset row to Excel, fully repopulating any new columns.')) return
    setMarkBusy(true)
    try {
      const r = await api.markAllForSync()
      showToast(`Marked ${r.marked} assets for sync`, 'success')
      window.dispatchEvent(new CustomEvent('sync-status-changed'))
      api.getSyncStatus().then(setSyncStatus).catch(() => {})
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
    finally { setMarkBusy(false) }
  }

  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault()
    if (!isElectron) return
    setConfigSaving(true)
    try {
      await (window as any).assetManager.saveConfig(config)
      showToast('Configuration saved — restart the app to apply changes', 'success')
    } catch (err) { showToast(err instanceof Error ? err.message : 'Save failed', 'error') }
    finally { setConfigSaving(false) }
  }

  async function handleCheckUpdates() {
    if (!isElectron) return
    try {
      const r = await (window as any).assetManager.checkForUpdates?.()
      if (r?.ok) showToast('Checking for updates — result will appear shortly', 'info')
      else showToast(r?.error || 'Update check failed', 'error')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Update check failed', 'error') }
  }

  async function handleOverlaySave() {
    const p1y  = parseFloat(overlayP1Y)
    const p2y  = parseFloat(overlayP2Y)
    const rowh = parseFloat(overlayRowH)
    if (isNaN(p1y) || isNaN(p2y) || isNaN(rowh)) {
      setOverlayMsg('Enter valid numbers for all three fields.')
      return
    }
    setOverlaySaving(true)
    setOverlayMsg('')
    try {
      const r = await api.saveOverlayDefaults({
        table_data_start_y_mm: p1y,
        table_data_start_y_mm_page2: p2y,
        row_height_mm: rowh,
      })
      applyOverlayConfig(r.config)
      setOverlayHasOverrides(true)
      setOverlayMsg('Calibration saved.')
    } catch (e) {
      setOverlayMsg(e instanceof Error ? e.message : 'Save failed')
    } finally { setOverlaySaving(false) }
  }

  async function handleOverlayReset() {
    if (!window.confirm('Reset calibration to factory defaults?')) return
    setOverlaySaving(true)
    setOverlayMsg('')
    try {
      const r = await api.resetOverlayDefaults()
      applyOverlayConfig(r.config)
      setOverlayHasOverrides(false)
      setOverlayMsg('Reset to factory defaults.')
    } catch (e) {
      setOverlayMsg(e instanceof Error ? e.message : 'Reset failed')
    } finally { setOverlaySaving(false) }
  }

  async function handleOverlayDocx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setOverlayDocxLoading(true)
    setOverlayMsg('')
    try {
      const res = await api.calibrateFromDocx(file)
      const calib = res.calibration
      // Apply column values to effective config and save
      const p1 = calib[1]
      const p2 = calib[2]
      const toSave: OverlayDefaults = {}
      if (p1) {
        toSave.col_x_mm = p1.col_x0
        toSave.col_w_mm = p1.col_w
        toSave.row_height_mm = p1.avg_row_h
        // Pre-fill Y inputs from docx estimate (user can fine-tune)
        setOverlayP1Y(String(p1.data_start_y))
        toSave.table_data_start_y_mm = p1.data_start_y
      }
      if (p2) {
        setOverlayP2Y(String(p2.data_start_y))
        toSave.table_data_start_y_mm_page2 = p2.data_start_y
      }
      if (Object.keys(toSave).length) {
        const r = await api.saveOverlayDefaults(toSave)
        applyOverlayConfig(r.config)
        setOverlayHasOverrides(true)
      }
      setOverlayMsg(`Columns calibrated from Word doc (${p1?.col_x0?.length ?? '?'} cols). Check & save Y positions below.`)
    } catch (err) {
      setOverlayMsg(err instanceof Error ? err.message : 'Docx calibration failed')
    } finally {
      setOverlayDocxLoading(false)
      if (overlayDocxRef.current) overlayDocxRef.current.value = ''
    }
  }

  const Field = ({ label, field, type = 'text', placeholder }: { label: string; field: keyof Config; type?: string; placeholder?: string }) => (
    <div>
      <label className="md-label">{label}</label>
      <input
        className="md-input"
        type={type}
        value={config[field]}
        onChange={e => setConfig(c => ({ ...c, [field]: e.target.value }))}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Sync, configuration & application</div>
      </div>

      <div style={{ columnWidth: 440, columnGap: 16 }}>

        {/* Sync Status */}
        <Card title="Sync status">
          {syncLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1].map(i => <div key={i} style={{ height: 16, background: 'var(--surface-2)', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />)}
            </div>
          ) : syncStatus ? (
            <div>
              <StatRow
                label="Pending asset changes"
                value={syncStatus.pending_changes}
                warn={syncStatus.pending_changes > 0}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Last sync</span>
                <span style={{ fontSize: 14, color: 'var(--text-1)' }}>
                  {syncStatus.last_sync ? new Date(syncStatus.last_sync).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>
          ) : <div style={{ fontSize: 14, color: 'var(--text-3)' }}>Could not load sync status</div>}
        </Card>

        {/* Sync Operations */}
        <Card title="Sync operations">
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
            Manually sync with the SharePoint Excel workbook. Auto-sync runs on startup and every 60 minutes.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="md-btn md-btn-primary" onClick={handlePush} disabled={pushBusy}>
              {pushBusy
                ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Pushing…</>
                : <><span className="icon icon-sm">upload</span>Push to Excel</>}
            </button>
            <button className="md-btn md-btn-outlined" onClick={handlePull} disabled={pullBusy}>
              {pullBusy
                ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Pulling…</>
                : <><span className="icon icon-sm">download</span>Pull from Excel</>}
            </button>
            <button className="md-btn md-btn-outlined" onClick={handlePullLogs} disabled={pullLogsBusy}>
              {pullLogsBusy
                ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Pulling…</>
                : <><span className="icon icon-sm">history</span>Pull activity logs</>}
            </button>
          </div>
        </Card>

        {/* SharePoint + Auth Config (Electron only) */}
        {isElectron && (
          <Card title="SharePoint & authentication">
            {configLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[0, 1, 2, 3].map(i => <div key={i} style={{ height: 40, background: 'var(--surface-2)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />)}
              </div>
            ) : (
              <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0, lineHeight: 1.5 }}>
                  SharePoint sync uses your signed-in Microsoft 365 account — no client secret required.
                  Paste the sharing link to your Excel workbook below.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="md-label">SharePoint File URL</label>
                    <input
                      className="md-input"
                      type="url"
                      value={config.SHAREPOINT_FILE_URL}
                      onChange={e => setConfig(c => ({ ...c, SHAREPOINT_FILE_URL: e.target.value }))}
                      placeholder="https://…/AssetInventory.xlsx?…"
                    />
                  </div>
                  <div>
                    <label className="md-label">
                      Auth Client ID{' '}
                      <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional — baked in by default)</span>
                    </label>
                    <input
                      className="md-input"
                      value={config.AUTH_CLIENT_ID}
                      onChange={e => setConfig(c => ({ ...c, AUTH_CLIENT_ID: e.target.value }))}
                      placeholder="PKCE app client ID"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="md-label">
                      Ngrok URL{' '}
                      <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional — for scanner QR over HTTPS)</span>
                    </label>
                    <input
                      className="md-input"
                      value={config.NGROK_URL}
                      onChange={e => setConfig(c => ({ ...c, NGROK_URL: e.target.value }))}
                      placeholder="https://xxxx.ngrok-free.app"
                    />
                  </div>
                </div>

                <div style={{ paddingTop: 4 }}>
                  <button type="submit" disabled={configSaving} className="md-btn md-btn-primary">
                    {configSaving ? 'Saving…' : <><span className="icon icon-sm">save</span>Save configuration</>}
                  </button>
                </div>
              </form>
            )}
          </Card>
        )}

        {/* Appearance */}
        <Card title="Appearance">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Theme</span>
            <button onClick={toggleTheme} className="md-btn md-btn-tonal md-btn-sm">
              <span className="icon icon-sm">{theme === 'light' ? 'dark_mode' : 'light_mode'}</span>
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Keyboard shortcuts</span>
            <button onClick={() => document.dispatchEvent(new CustomEvent('open-shortcuts'))} className="md-btn md-btn-tonal md-btn-sm">
              <span className="icon icon-sm">keyboard</span>View
            </button>
          </div>
        </Card>

        {/* Access control (Admin only) */}
        {isAdmin && (
          <Card title="Access control">
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 16 }}>
              Manage Microsoft Entra accounts and app access roles.
            </p>
            <NavLink to="/users" className="md-btn md-btn-outlined" style={{ display: 'inline-flex', textDecoration: 'none' }}>
              <span className="icon icon-sm">manage_accounts</span>Manage users
            </NavLink>
          </Card>
        )}

        {/* Data export */}
        <Card title="Data export">
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 16 }}>
            Export the full activity log as a CSV file.
          </p>
          <button
            className="md-btn md-btn-outlined"
            onClick={() => api.exportActivity({ format: 'csv' }).catch(() => {})}
          >
            <span className="icon icon-sm">table_view</span>Export activity log
          </button>
        </Card>

        {/* Schema migration (Admin only) */}
        {isAdmin && (
          <Card title="Schema migration">
            <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>
              After adding new columns to the SharePoint Excel table, mark all assets for sync so the
              next push fully repopulates every row including the new columns.
            </p>
            <button className="md-btn md-btn-tonal" onClick={handleMarkAllForSync} disabled={markBusy}>
              {markBusy
                ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Marking…</>
                : <><span className="icon icon-sm">table_rows</span>Mark all assets for sync</>}
            </button>
          </Card>
        )}

        {/* Overlay Calibration */}
        <Card title="Overlay calibration">
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 16, lineHeight: 1.6 }}>
            Fine-tune where the overlay PDF prints text on your physical forms.
            Upload the Word template to auto-detect column widths, then adjust Y positions to match your printed form.
            {overlayHasOverrides && (
              <span style={{ marginLeft: 6, fontSize: 12, background: 'var(--primary-bg)', color: 'var(--primary)', padding: '1px 7px', borderRadius: 10 }}>custom</span>
            )}
          </p>

          {/* Docx upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'var(--primary-bg)', color: 'var(--primary)', cursor: overlayDocxLoading ? 'not-allowed' : 'pointer', border: '1px solid var(--primary)', opacity: overlayDocxLoading ? 0.6 : 1 }}>
              <span className="icon icon-sm">description</span>
              {overlayDocxLoading ? 'Reading template…' : 'Auto-calibrate from Word template (.docx)'}
              <input ref={overlayDocxRef} type="file" accept=".docx" style={{ display: 'none' }} onChange={handleOverlayDocx} disabled={overlayDocxLoading} />
            </label>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              Uploads the handover/return .docx — extracts exact column widths from the table XML.
            </div>
          </div>

          {/* Y position inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Page 1 — data Y start (mm)</label>
              <input
                className="md-input"
                type="number"
                step="0.1"
                value={overlayP1Y}
                onChange={e => setOverlayP1Y(e.target.value)}
                placeholder={String(overlayConfig?.table_data_start_y_mm ?? 156.7)}
              />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>mm from top of page to first data row</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Page 2 — data Y start (mm)</label>
              <input
                className="md-input"
                type="number"
                step="0.1"
                value={overlayP2Y}
                onChange={e => setOverlayP2Y(e.target.value)}
                placeholder={String(overlayConfig?.table_data_start_y_mm_page2 ?? 61.6)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Row height (mm)</label>
              <input
                className="md-input"
                type="number"
                step="0.01"
                value={overlayRowH}
                onChange={e => setOverlayRowH(e.target.value)}
                placeholder={String(overlayConfig?.row_height_mm ?? 16.055)}
              />
            </div>
          </div>

          {overlayMsg && (
            <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 12, background: overlayMsg.includes('failed') || overlayMsg.includes('valid') ? 'var(--danger-bg)' : 'var(--success-bg)', color: overlayMsg.includes('failed') || overlayMsg.includes('valid') ? 'var(--danger)' : 'var(--success)' }}>
              {overlayMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="md-btn md-btn-primary" onClick={handleOverlaySave} disabled={overlaySaving}>
              {overlaySaving ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Saving…</> : <><span className="icon icon-sm">save</span>Save Y positions</>}
            </button>
            <a
              href="/api/overlay/calibration-grid"
              download="calibration_grid.pdf"
              className="md-btn md-btn-outlined"
              style={{ textDecoration: 'none', display: 'inline-flex' }}
            >
              <span className="icon icon-sm">grid_on</span>Download calibration grid
            </a>
            {overlayHasOverrides && (
              <button className="md-btn" onClick={handleOverlayReset} style={{ color: 'var(--danger)', marginLeft: 'auto' }}>
                <span className="icon icon-sm">restart_alt</span>Reset to factory
              </button>
            )}
          </div>

          {overlayConfig && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.8 }}>
              <strong style={{ color: 'var(--text-2)' }}>Active:</strong>{' '}
              P1 Y={overlayConfig.table_data_start_y_mm}mm · P2 Y={overlayConfig.table_data_start_y_mm_page2}mm · row={overlayConfig.row_height_mm}mm · {overlayConfig.col_x_mm?.length ?? 0} cols
            </div>
          )}
        </Card>

        {/* Application */}
        <Card title="Application">
          <StatRow label="Version" value={appVersion || '…'} />
          {isElectron && logPath && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-2)' }}>Log file</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2 }}>{logPath}</div>
              </div>
              <button onClick={() => (window as any).assetManager?.openPath?.(logPath)} className="md-btn md-btn-tonal md-btn-sm">
                <span className="icon icon-sm">folder_open</span>Open
              </button>
            </div>
          )}
          {isElectron && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Updates</span>
              <button onClick={handleCheckUpdates} className="md-btn md-btn-tonal md-btn-sm">
                <span className="icon icon-sm">system_update</span>Check for updates
              </button>
            </div>
          )}
          {!isElectron && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 8 }}>
              Running in browser mode — configuration editor not available.
            </div>
          )}
        </Card>

      </div>
    </div>
  )
}
