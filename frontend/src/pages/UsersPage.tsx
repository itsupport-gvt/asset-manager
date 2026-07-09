import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../App'
import type { AuthUser } from '../lib/types'

function Avatar({ name, email }: { name: string; email: string }) {
  const initials = (name || email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span style={{
      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
      background: 'var(--primary)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 500, fontFamily: "'Google Sans', sans-serif",
    }}>{initials}</span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const color = role === 'Admin'
    ? 'var(--badge-purple-color, #9334e9)'
    : role === 'Editor'
    ? 'var(--primary)'
    : 'var(--text-2)'
  const bg = role === 'Admin'
    ? 'var(--badge-purple-bg, rgba(147,52,233,.12))'
    : role === 'Editor'
    ? 'rgba(26,115,232,.12)'
    : 'var(--surface-3)'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 500, color, background: bg,
    }}>{role || '—'}</span>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 500,
      color: active ? 'var(--success)' : 'var(--text-3)',
      background: active ? 'rgba(30,200,120,.12)' : 'var(--surface-3)',
    }}>{active ? 'Active' : 'Disabled'}</span>
  )
}

function formatDate(iso: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

const TH = (label: string) => (
  <th style={{
    padding: '14px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500,
    color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: .5,
    whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
  }}>{label}</th>
)

export default function UsersPage() {
  const { user: me, authEnabled } = useAuth()
  const { showToast } = useToast()
  const isAdmin = !authEnabled || me?.role === 'Admin'

  const [authUsers, setAuthUsers] = useState<AuthUser[]>([])
  const [loading, setLoading]     = useState(true)
  const [toggling, setToggling]   = useState<string | null>(null)

  useEffect(() => {
    if (!authEnabled) { setLoading(false); return }
    api.listAuthUsers()
      .then(setAuthUsers)
      .catch(() => showToast('Failed to load users', 'error'))
      .finally(() => setLoading(false))
  }, [authEnabled])

  async function toggleStatus(u: AuthUser) {
    setToggling(u.oid)
    try {
      const patch = await api.setUserStatus(u.oid, !u.is_active)
      setAuthUsers(prev => prev.map(x => x.oid === patch.oid ? { ...x, is_active: patch.is_active } : x))
      showToast(`${u.name || u.email} ${patch.is_active ? 'enabled' : 'disabled'}`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Update failed', 'error')
    } finally {
      setToggling(null)
    }
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <span className="icon icon-xl" style={{ color: 'var(--text-3)', display: 'block', marginBottom: 12 }}>lock</span>
        <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Admin access required</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <div className="page-title">Users</div>
        <div className="page-subtitle">Microsoft accounts that have signed in to Asset Manager</div>
      </div>

      {!authEnabled && (
        <div style={{
          padding: '20px 24px', borderRadius: 12,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text-2)', fontSize: 14,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span className="icon" style={{ color: 'var(--text-3)' }}>info</span>
          Authentication is disabled. Configure <code>AUTH_CLIENT_ID</code> and <code>AUTH_TENANT_ID</code> to enable Microsoft sign-in.
        </div>
      )}

      <div className="md-card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 className="section-title">App access</h2>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
            Roles are assigned via Entra ID app roles (AssetManager.Admin / Editor / Viewer)
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                height: 56, background: 'var(--surface-2)', borderRadius: 8,
                animation: 'pulse 1.5s infinite',
              }} />
            ))}
          </div>
        ) : authUsers.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
            No users have signed in yet
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {TH('User')}
                {TH('Email')}
                {TH('Role')}
                {TH('Last sign-in')}
                {TH('Status')}
                <th style={{ borderBottom: '1px solid var(--border)' }} />
              </tr>
            </thead>
            <tbody>
              {authUsers.map((u, i) => {
                const isSelf = u.oid === me?.oid
                const busy   = toggling === u.oid
                return (
                  <tr
                    key={u.oid}
                    style={{
                      borderBottom: i < authUsers.length - 1 ? '1px solid var(--border)' : 'none',
                      opacity: u.is_active ? 1 : .55,
                    }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Avatar name={u.name} email={u.email} />
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                          {u.name || '—'}
                          {isSelf && (
                            <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>
                              (you)
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                      {u.email || '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <RoleBadge role={u.effective_role} />
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      {formatDate(u.last_login)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <StatusPill active={u.is_active} />
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {isAdmin && !isSelf && (
                        <button
                          onClick={() => toggleStatus(u)}
                          disabled={busy}
                          className="md-btn md-btn-text md-btn-sm"
                          style={{ color: u.is_active ? 'var(--danger)' : 'var(--success)' }}
                        >
                          {busy
                            ? <span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>
                            : u.is_active ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
