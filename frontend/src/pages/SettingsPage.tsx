import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../App'

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

        {/* Data export */}
        <Card title="Data export">
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 0, marginBottom: 16 }}>
            Export the full activity log as a CSV file.
          </p>
          <a
            href="/api/activity/export"
            download="activity_log.csv"
            className="md-btn md-btn-outlined"
            style={{ display: 'inline-flex', textDecoration: 'none' }}
          >
            <span className="icon icon-sm">table_view</span>Export activity log
          </a>
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
