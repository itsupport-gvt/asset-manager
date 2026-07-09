/**
 * auth.ts – Microsoft Entra ID auth context for Asset Manager.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  createElement,
  type ReactNode,
} from 'react'
import { api } from './api'
import { clearMsToken } from './api'

export type AppRole = 'Admin' | 'Editor' | 'Viewer'

export interface AuthUserInfo {
  oid: string
  name: string
  email: string
  role: AppRole
}

export interface CachedAccount {
  homeAccountId: string
  name: string
  email: string
}

interface AuthContextValue {
  user: AuthUserInfo | null
  loading: boolean
  authEnabled: boolean
  login: () => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  selectAccount: (homeAccountId: string) => Promise<{ ok: boolean; error?: string }>
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  authEnabled: false,
  login:         async () => ({ ok: false, error: 'Not mounted' }),
  logout:        async () => {},
  selectAccount: async () => ({ ok: false, error: 'Not mounted' }),
})

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

type AssetManagerBridge = {
  getMsUser?:         () => Promise<{ name: string; email: string; oid: string; token: string } | null>
  getMsToken?:        () => Promise<string | null>
  msLogin?:           () => Promise<{ ok: boolean; user?: { name: string; email: string; oid: string; token: string } | null; error?: string }>
  msLogout?:          () => Promise<{ ok: boolean }>
  getCachedAccounts?: () => Promise<CachedAccount[]>
  selectAccount?:     (homeAccountId: string) => Promise<{ ok: boolean; error?: string }>
}

function bridge(): AssetManagerBridge {
  return ((window as unknown as { assetManager?: AssetManagerBridge }).assetManager) ?? {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,        setUser]        = useState<AuthUserInfo | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [authEnabled, setAuthEnabled] = useState(false)

  const fetchMe = useCallback(async (): Promise<AuthUserInfo | null> => {
    try {
      const resp = await api.getMe()
      setAuthEnabled(resp.auth_enabled)
      if (!resp.auth_enabled) return null
      if (!resp.user) return null
      return {
        oid:   resp.user.oid,
        name:  resp.user.name,
        email: resp.user.email,
        role:  resp.user.role as AppRole,
      }
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [fetchMe])

  const login = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const result = await bridge().msLogin?.()
      if (!result?.ok) return { ok: false, error: result?.error ?? 'Login cancelled' }
      const me = await fetchMe()
      setUser(me)
      return me ? { ok: true } : { ok: false, error: 'Role not assigned — contact your administrator.' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }, [fetchMe])

  const logout = useCallback(async () => {
    await bridge().msLogout?.()
    clearMsToken()
    setUser(null)
    await fetchMe()
  }, [fetchMe])

  const selectAccount = useCallback(async (homeAccountId: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const result = await bridge().selectAccount?.(homeAccountId)
      if (!result?.ok) return { ok: false, error: result?.error ?? 'Failed to select account' }
      const me = await fetchMe()
      setUser(me)
      return me ? { ok: true } : { ok: false, error: 'Role not assigned — contact your administrator.' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }, [fetchMe])

  return createElement(
    AuthContext.Provider,
    { value: { user, loading, authEnabled, login, logout, selectAccount } },
    children,
  )
}
