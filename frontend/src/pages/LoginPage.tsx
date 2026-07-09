import { useEffect, useState } from 'react'
import { useAuth, type CachedAccount } from '../lib/auth'

type Bridge = Window & {
  assetManager?: { getCachedAccounts?: () => Promise<CachedAccount[]> }
}

export default function LoginPage() {
  const { login, selectAccount } = useAuth()
  const [busy,      setBusy]      = useState(false)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error,     setError]     = useState('')
  const [accounts,  setAccounts]  = useState<CachedAccount[] | null>(null)

  useEffect(() => {
    const win = window as Bridge
    win.assetManager?.getCachedAccounts?.()
      .then(a => setAccounts(a ?? []))
      .catch(() => setAccounts([]))
  }, [])

  async function handleSelect(homeAccountId: string) {
    setSelecting(homeAccountId)
    setError('')
    const result = await selectAccount(homeAccountId)
    if (!result.ok) {
      setError(result.error ?? 'Failed to sign in with that account')
      setSelecting(null)
    }
  }

  async function handleLogin() {
    setBusy(true)
    setError('')
    const result = await login()
    if (!result.ok) {
      setError(result.error ?? 'Login failed')
      setBusy(false)
    }
  }

  const hasCachedAccounts = accounts !== null && accounts.length > 0
  const isLoading = accounts === null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg)', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        padding: '48px 40px',
        borderRadius: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <img src="/assets/gravity_asset_v1.svg" alt="" style={{ width: 48, height: 48 }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: "'Google Sans', sans-serif",
              fontWeight: 400, fontSize: 22, color: 'var(--text-1)',
              letterSpacing: -.2,
            }}>
              Sign in
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 6 }}>
              to continue to Asset Manager
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 14 }}>
            <span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>
            Checking for saved accounts…
          </div>
        )}

        {/* Account picker */}
        {hasCachedAccounts && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accounts!.map(acc => {
              const initials = acc.name
                ? acc.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                : acc.email.slice(0, 2).toUpperCase()
              const isBusy = selecting === acc.homeAccountId
              return (
                <button
                  key={acc.homeAccountId}
                  onClick={() => handleSelect(acc.homeAccountId)}
                  disabled={selecting !== null}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    width: '100%', padding: '12px 14px',
                    border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--surface)',
                    cursor: selecting !== null ? 'default' : 'pointer',
                    opacity: selecting !== null && !isBusy ? 0.5 : 1,
                    textAlign: 'left',
                    transition: 'border-color .12s, background .12s',
                  }}
                  onMouseEnter={e => { if (!selecting) e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)' }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--primary)', color: 'var(--on-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 500, fontFamily: "'Google Sans', sans-serif",
                  }}>
                    {isBusy
                      ? <span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>
                      : initials
                    }
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {acc.name || acc.email}
                    </div>
                    {acc.name && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {acc.email}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Sign-in button */}
        {!isLoading && (
          <button
            onClick={handleLogin}
            disabled={busy || selecting !== null}
            className="md-btn md-btn-outlined"
            style={{ width: '100%', height: 44 }}
          >
            <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
              <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
              <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            {busy ? 'Opening browser…' : hasCachedAccounts ? 'Use another account' : 'Sign in with Microsoft'}
          </button>
        )}

        {error && (
          <div style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            background: 'var(--danger-bg)', color: 'var(--danger)',
            fontSize: 13, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {!hasCachedAccounts && !isLoading && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
            Your browser will open for authentication. Return here after signing in.
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-3)', fontFamily: "'Google Sans', sans-serif" }}>
        Gravity Business Partners
      </div>
    </div>
  )
}
