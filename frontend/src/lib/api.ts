import type { Asset, Employee, AssignRequest, ReturnRequest, CreateAssetRequest, ReportPreview, OverlayConfig, CalibrationData, OverlayRow, PrintLogEntry, ActivityLogPage, OverlayDefaults } from './types';

// ── Per-launch app token (Electron IPC secret) ────────────────────────────────
let _cachedToken: string | null | undefined = undefined

async function getAppToken(): Promise<string | null> {
  if (_cachedToken !== undefined) return _cachedToken
  try {
    const win = window as Window & { assetManager?: { getAppToken?: () => Promise<string> } }
    _cachedToken = (await win.assetManager?.getAppToken?.()) ?? null
  } catch {
    _cachedToken = null
  }
  return _cachedToken
}

// ── Microsoft ID token ────────────────────────────────────────────────────────
let _msToken: string | null = null
let _msTokenAt = 0
const _MS_TTL  = 50 * 60 * 1000

export function clearMsToken() {
  _msToken = null
  _msTokenAt = 0
}

async function getMsToken(): Promise<string | null> {
  if (_msToken && Date.now() - _msTokenAt < _MS_TTL) return _msToken
  try {
    const win = window as Window & { assetManager?: { getMsToken?: () => Promise<string | null> } }
    const ipcCall = win.assetManager?.getMsToken?.() ?? Promise.resolve(null)
    const t = await Promise.race([
      ipcCall,
      new Promise<null>(r => setTimeout(() => r(null), 6000)),
    ])
    _msToken   = t
    _msTokenAt = Date.now()
  } catch {
    _msToken = null
  }
  return _msToken
}

// ── Microsoft Graph access token (for SharePoint sync) ─────────────────────────
let _msGraphToken: string | null = null
let _msGraphTokenAt = 0

async function getMsGraphToken(): Promise<string | null> {
  if (_msGraphToken && Date.now() - _msGraphTokenAt < _MS_TTL) return _msGraphToken
  try {
    const win = window as Window & { assetManager?: { getMsGraphToken?: () => Promise<string | null> } }
    const t = (await win.assetManager?.getMsGraphToken?.()) ?? null
    _msGraphToken   = t
    _msGraphTokenAt = Date.now()
  } catch {
    _msGraphToken = null
  }
  return _msGraphToken
}

// syncReq — like req() but also injects X-MS-Graph-Token for SharePoint calls
async function syncReq<T>(path: string): Promise<T> {
  const appToken   = await getAppToken()
  const msToken    = await getMsToken()
  const graphToken = await getMsGraphToken()
  const headers: Record<string, string> = {}
  if (appToken)   headers['X-App-Token']       = appToken
  if (msToken)    headers['Authorization']      = `Bearer ${msToken}`
  if (graphToken) headers['X-MS-Graph-Token']   = graphToken
  const res = await fetch(BASE + path, { method: 'POST', headers })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json()
}

const BASE = '';  // same origin — Vite proxies to backend in dev, served by FastAPI in prod

/** Fetch a binary endpoint with auth headers and trigger a browser download. */
export async function downloadAuthenticated(url: string, filename: string): Promise<void> {
  const appToken = await getAppToken()
  const msToken  = await getMsToken()
  const headers: Record<string, string> = {}
  if (appToken) headers['X-App-Token']   = appToken
  if (msToken)  headers['Authorization'] = `Bearer ${msToken}`
  const res = await fetch(BASE + url, { headers })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
    throw new Error(detail)
  }
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objUrl)
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const appToken = await getAppToken()
  const msToken  = await getMsToken()
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) }
  if (appToken) headers['X-App-Token']   = appToken
  if (msToken)  headers['Authorization'] = `Bearer ${msToken}`

  const res = await fetch(BASE + path, { ...options, headers });
  if (res.status === 401) {
    clearMsToken()
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  getAsset: (id: string) => req<Asset>(`/api/asset/${encodeURIComponent(id)}`),
  updateAsset: (id: string, body: Partial<CreateAssetRequest>) => req<{ success: boolean }>(`/api/asset/update/${encodeURIComponent(id)}`, json(body)),
  getAssetSuggestions: () => req<Record<string, string[]>>('/api/asset-suggestions'),
  listAssets: (q = '', status = '') =>
    req<Asset[]>(`/api/assets?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  searchAssets: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return req<Asset[]>(`/api/assets/search?${qs}`);
  },
  getEmployees: () => req<Employee[]>('/api/employees'),
  getEmployeeAssets: (email: string) => req<Asset[]>(`/api/employee/${encodeURIComponent(email)}/assets`),
  assignAsset: (body: AssignRequest) => req<{ success: boolean; assignment_id: string }>('/api/asset/assign', json(body)),
  returnAsset: (body: ReturnRequest) => req<{ success: boolean; returned_from: string }>('/api/asset/return', json(body)),
  syncAsset: (assetId: string) => req<{ success: boolean; message: string }>(`/api/asset/${encodeURIComponent(assetId)}/sync`, { method: 'POST' }),
  getScannerUrl: () => req<{ url: string; ip: string; scheme: string; via_ngrok: boolean }>('/api/scanner-url'),
  createAsset: (body: CreateAssetRequest) => req<{ success: boolean; asset_id: string; asset_id_qr: string }>('/api/asset/create', json(body)),
  createEmployee: (body: any) => req<{ success: boolean; email: string }>('/api/employee/create', json(body)),
  fieldValues: () => req<Record<string, string[]>>('/api/field-values'),
  bulkReturn: (email: string, body: { items: { asset_id: string; condition: string; notes: string }[]; reason: string }) =>
    req<{ returned: string[]; failed: { asset_id: string; reason: string }[]; total: number }>(
      `/api/employee/${encodeURIComponent(email)}/bulk-return`, json(body)
    ),
  bulkAssign: (email: string, body: { asset_ids: string[] }) =>
    req<{ assigned: string[]; failed: { asset_id: string; reason: string }[]; total: number }>(
      `/api/employee/${encodeURIComponent(email)}/bulk-assign`, json(body)
    ),
  reportPreview: (email: string) => req<ReportPreview>(`/api/report/preview/${encodeURIComponent(email)}`),
  generateReport: async (body: { employee_email: string; doc_type: string; excluded_ids: string[]; row_notes?: Record<string, string>; extra_rows?: { asset_id: string; asset_type: string; brand: string; model: string; serial_number: string; notes: string }[] }): Promise<Blob> => {
    const appToken = await getAppToken()
    const msToken  = await getMsToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (appToken) headers['X-App-Token']   = appToken
    if (msToken)  headers['Authorization'] = `Bearer ${msToken}`
    const res = await fetch('/api/report/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
      throw new Error(detail);
    }
    return res.blob();
  },

  // ── Overlay ──────────────────────────────────────────────────────────────
  overlayConfig: () => req<OverlayConfig>('/api/overlay/config'),

  getOverlayDefaults: () =>
    req<{ config: OverlayConfig; factory: OverlayConfig; has_user_overrides: boolean; user_overrides: OverlayDefaults }>(
      '/api/overlay/defaults'
    ),

  saveOverlayDefaults: (defaults: OverlayDefaults) =>
    req<{ saved: boolean; config: OverlayConfig }>('/api/overlay/defaults', json(defaults)),

  resetOverlayDefaults: async (): Promise<{ reset: boolean; config: OverlayConfig }> => {
    const appToken = await getAppToken()
    const msToken  = await getMsToken()
    const headers: Record<string, string> = {}
    if (appToken) headers['X-App-Token']   = appToken
    if (msToken)  headers['Authorization'] = `Bearer ${msToken}`
    const res = await fetch('/api/overlay/defaults', { method: 'DELETE', headers })
    if (!res.ok) throw new Error(res.statusText)
    return res.json()
  },

  calibrateFromDocx: async (file: File): Promise<{ calibration: CalibrationData }> => {
    const appToken = await getAppToken()
    const msToken  = await getMsToken()
    const headers: Record<string, string> = {}
    if (appToken) headers['X-App-Token']   = appToken
    if (msToken)  headers['Authorization'] = `Bearer ${msToken}`
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/overlay/calibrate-docx', { method: 'POST', headers, body: form })
    if (!res.ok) {
      let detail = res.statusText
      try { detail = (await res.json()).detail ?? detail } catch { /* ignore */ }
      throw new Error(detail)
    }
    return res.json()
  },

  calibrateFromPdf: async (file: File): Promise<{ calibration: CalibrationData }> => {
    const appToken = await getAppToken()
    const msToken  = await getMsToken()
    const headers: Record<string, string> = {}
    if (appToken) headers['X-App-Token']   = appToken
    if (msToken)  headers['Authorization'] = `Bearer ${msToken}`
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/overlay/calibrate', { method: 'POST', headers, body: form });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
      throw new Error(detail);
    }
    return res.json();
  },

  generateOverlay: async (body: { rows: OverlayRow[]; calibration?: CalibrationData }): Promise<Blob> => {
    const appToken = await getAppToken()
    const msToken  = await getMsToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (appToken) headers['X-App-Token']   = appToken
    if (msToken)  headers['Authorization'] = `Bearer ${msToken}`
    const res = await fetch('/api/overlay/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
      throw new Error(detail);
    }
    return res.blob();
  },

  getPrintLog: (empId: string, docType: string) =>
    req<PrintLogEntry>(`/api/overlay/print-log/${encodeURIComponent(empId)}/${encodeURIComponent(docType)}`),

  markPrinted: (empId: string, docType: string, assetIds: string[]) =>
    req<{ marked: string[]; total_printed: number }>(
      `/api/overlay/print-log/${encodeURIComponent(empId)}/${encodeURIComponent(docType)}/mark`,
      json({ asset_ids: assetIds })
    ),

  clearPrintLog: async (empId: string, docType: string): Promise<{ cleared: boolean }> => {
    const appToken = await getAppToken()
    const msToken  = await getMsToken()
    const headers: Record<string, string> = {}
    if (appToken) headers['X-App-Token']   = appToken
    if (msToken)  headers['Authorization'] = `Bearer ${msToken}`
    const res = await fetch(
      `/api/overlay/print-log/${encodeURIComponent(empId)}/${encodeURIComponent(docType)}`,
      { method: 'DELETE', headers }
    );
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  },

  // ── Report: generate Word (.docx) ──────────────────────────────────────────
  generateReportDocx: async (body: {
    employee_email: string;
    doc_type: string;
    excluded_ids: string[];
    row_notes?: Record<string, string>;
    extra_rows?: { asset_id: string; asset_type: string; brand: string; model: string; serial_number: string; notes: string }[];
  }): Promise<Blob> => {
    const appToken = await getAppToken()
    const msToken  = await getMsToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (appToken) headers['X-App-Token']   = appToken
    if (msToken)  headers['Authorization'] = `Bearer ${msToken}`
    const res = await fetch('/api/report/generate-docx', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
      throw new Error(detail);
    }
    return res.blob();
  },

  // ── Activity Log ───────────────────────────────────────────────────────────
  getActivity: (params: {
    page?: number;
    page_size?: number;
    action?: string;
    employee?: string;
    asset_id?: string;
    from_date?: string;
    to_date?: string;
    q?: string;
  }): Promise<ActivityLogPage> => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return req<ActivityLogPage>(`/api/activity${qs ? '?' + qs : ''}`);
  },

  exportActivityCsvUrl: (params: {
    action?: string;
    employee?: string;
    asset_id?: string;
    from_date?: string;
    to_date?: string;
    q?: string;
  }): string => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return `/api/activity/export${qs ? '?' + qs : ''}`;
  },

  exportActivity: (params: {
    action?: string; employee?: string; asset_id?: string;
    from_date?: string; to_date?: string; q?: string; format?: 'csv' | 'xlsx';
  }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, String(v)]))
    ).toString()
    const ext = params.format === 'xlsx' ? 'xlsx' : 'csv'
    const ts = new Date().toISOString().slice(0,10)
    return downloadAuthenticated(`/api/activity/export${qs ? '?' + qs : ''}`, `activity_log_${ts}.${ext}`)
  },

  exportInventory: (params: {
    q?: string; status?: string; type?: string; condition?: string;
    employee?: string; brand?: string; model?: string;
    from_date?: string; to_date?: string; format?: 'csv' | 'xlsx';
  }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, String(v)]))
    ).toString()
    const ext = params.format === 'xlsx' ? 'xlsx' : 'csv'
    const ts = new Date().toISOString().slice(0,10)
    return downloadAuthenticated(`/api/assets/export${qs ? '?' + qs : ''}`, `inventory_${ts}.${ext}`)
  },

  exportStats: (params: { from_date?: string; to_date?: string; format?: 'csv' | 'xlsx' }) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v).map(([k, v]) => [k, String(v)]))
    ).toString()
    const ext = params.format === 'xlsx' ? 'xlsx' : 'csv'
    const ts = new Date().toISOString().slice(0,10)
    return downloadAuthenticated(`/api/stats/export${qs ? '?' + qs : ''}`, `stats_summary_${ts}.${ext}`)
  },

  // ── Sync: Pull Logs ────────────────────────────────────────────────────────
  pullLogs: () => syncReq<{ success: boolean; imported: number; skipped: number; total: number; message?: string; detail?: string }>('/api/sync/pull-logs'),

  // ── Push to Excel / Pull from Excel (require Graph token) ─────────────────
  pushToExcel: () =>
    syncReq<{ success: boolean; message?: string; detail?: string }>('/api/sync/push'),
  pullFromExcel: () =>
    syncReq<{ success: boolean; message?: string; imported?: number; skipped?: number }>('/api/sync/pull'),
  getSyncStatus: () =>
    req<{ pending_changes: number; last_sync?: string; status?: string }>('/api/sync/status'),
  markAllForSync: () =>
    req<{ marked: number }>('/api/admin/mark-all-for-sync', { method: 'POST' }),

  // ── Admin logs ────────────────────────────────────────────────────────────
  getAdminLogs: (n = 300) =>
    req<{ lines: string[]; total: number }>(`/api/admin/logs?n=${n}`),

  // ── Auth ──────────────────────────────────────────────────────────────────
  getMe: () =>
    req<{ auth_enabled: boolean; user: { oid: string; name: string; email: string; role: string } | null }>('/api/auth/me'),

  listAuthUsers: () =>
    req<{ oid: string; name: string; email: string; effective_role: string; is_active: boolean; last_login: string; entra_roles: string[] }[]>('/api/auth/users'),

  setUserStatus: (oid: string, is_active: boolean) =>
    req<{ oid: string; is_active: boolean }>(`/api/auth/users/${oid}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    }),

  // ── Swap ──────────────────────────────────────────────────────────────────
  swapAsset: (body: {
    mode: 'person' | 'stock';
    asset_id: string;
    new_employee_email?: string;
    replacement_asset_id?: string;
    return_status?: string;
    condition?: string;
    notes?: string;
  }) => req<{ success: boolean; mode: string; [key: string]: unknown }>('/api/asset/swap', json(body)),

  // ── Dashboard stats ───────────────────────────────────────────────────────
  getStats: (params: { from_date?: string; to_date?: string } = {}) => {
    const entries = Object.entries(params).filter(([, v]) => v)
    const qs = entries.length ? '?' + new URLSearchParams(Object.fromEntries(entries)).toString() : ''
    return req<Record<string, unknown>>(`/api/stats${qs}`)
  },

  // ── Asset export CSV (legacy URL helper — use exportInventory() instead) ──
  exportAssetsCsvUrl: (params: { q?: string; status?: string; type?: string }): string => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();
    return `/api/assets/export${qs ? '?' + qs : ''}`;
  },

  // ── Mobile / Admin connection ─────────────────────────────────────────────
  getServerInfo: () =>
    req<{
      local_url: string; lan_ip: string; port: number; scheme: string;
      ngrok_url: string; ngrok_active: boolean;
      scanners_connected: number; apps_connected: number;
    }>('/api/admin/server-info'),

  startNgrok: (authtoken?: string) =>
    req<{ url: string; started?: boolean; already_running?: boolean }>(
      '/api/admin/ngrok/start' + (authtoken ? `?authtoken=${encodeURIComponent(authtoken)}` : ''),
      { method: 'POST' }
    ),

  stopNgrok: () =>
    req<{ stopped: boolean }>('/api/admin/ngrok/stop', { method: 'POST' }),

  getQrCode: async (url: string): Promise<Blob> => {
    const appToken = await getAppToken()
    const msToken  = await getMsToken()
    const headers: Record<string, string> = {}
    if (appToken) headers['X-App-Token']   = appToken
    if (msToken)  headers['Authorization'] = `Bearer ${msToken}`
    const res = await fetch(`/api/admin/qr-code?url=${encodeURIComponent(url)}`, { headers })
    if (!res.ok) throw new Error(res.statusText)
    return res.blob()
  },
};
