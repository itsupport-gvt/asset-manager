import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const isElectron = typeof window !== 'undefined' && !!(window as any).assetManager

export default function OnboardingPage() {
  const nav = useNavigate()
  const [fileUrl, setFileUrl]   = useState('')
  const [step, setStep]         = useState<'url' | 'signing-in' | 'saving' | 'done'>('url')
  const [error, setError]       = useState('')

  async function handleSignIn() {
    setError('')
    setStep('signing-in')
    try {
      const ipc = (window as any).assetManager
      await ipc.initMsal?.({})
      await ipc.msLogin?.()
      setStep('url')
    } catch (e: any) {
      setError(e.message || 'Sign-in failed')
      setStep('url')
    }
  }

  async function handleSubmit() {
    if (!fileUrl.trim()) { setError('SharePoint file URL is required'); return }
    setError('')
    setStep('saving')
    try {
      const ipc = (window as any).assetManager
      const cfg = { SHAREPOINT_FILE_URL: fileUrl.trim(), NGROK_URL: '', AUTH_CLIENT_ID: '' }
      await ipc.saveConfig?.(cfg)
      // Upload bootstrap so teammates get this URL on their first run
      ipc.uploadBootstrap?.({ fileUrl: fileUrl.trim() })
        .catch((e: Error) => console.warn('[onboarding] bootstrap upload:', e.message))
      setStep('done')
      // Reload to main app — backend now has the correct FILE_URL
      window.location.href = '/'
    } catch (e: any) {
      setError(e.message || 'Save failed')
      setStep('url')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <div className="md-card" style={{ maxWidth: 480, width: '100%', padding: 40 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <span className="icon" style={{ fontSize: 32, color: 'var(--primary)' }}>inventory_2</span>
          <div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 20, color: 'var(--text-1)' }}>
              Welcome to Asset Manager
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
              First-time setup — takes less than a minute
            </div>
          </div>
        </div>

        {isElectron && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0, lineHeight: 1.6 }}>
              Sign in with your Microsoft 365 account first. This lets the app read your SharePoint Excel workbook.
            </p>
            <button
              className="md-btn md-btn-outlined"
              onClick={handleSignIn}
              disabled={step === 'signing-in'}
              style={{ width: '100%' }}
            >
              <span className="icon icon-sm">account_circle</span>
              {step === 'signing-in' ? 'Opening browser…' : 'Sign in with Microsoft'}
            </button>
          </div>
        )}

        <div>
          <label className="md-label">SharePoint Excel file URL</label>
          <input
            className="md-input"
            type="url"
            value={fileUrl}
            onChange={e => setFileUrl(e.target.value)}
            placeholder="https://gravitybp.sharepoint.com/…/AssetInventory.xlsx?…"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
            Open the Excel file in SharePoint, click <strong>Share → Copy link</strong>, and paste it here.
          </p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', background: 'var(--danger-bg)', color: 'var(--danger)',
            borderRadius: 8, fontSize: 13, marginTop: 12,
          }}>
            <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>
            {error}
          </div>
        )}

        <button
          className="md-btn md-btn-primary"
          style={{ width: '100%', marginTop: 20 }}
          onClick={handleSubmit}
          disabled={step === 'saving' || step === 'done' || step === 'signing-in'}
        >
          {step === 'saving' || step === 'done'
            ? <><span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>Saving…</>
            : <><span className="icon icon-sm">check_circle</span>Continue</>}
        </button>

        {!isElectron && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
            This setup page is only functional inside the desktop app.{' '}
            <button className="md-btn md-btn-tonal md-btn-sm" onClick={() => nav('/')} style={{ marginTop: 8 }}>
              Go to app
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
