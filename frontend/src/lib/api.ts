import type { Asset, Employee, AssignRequest, ReturnRequest, CreateAssetRequest, ReportPreview, OverlayConfig, CalibrationData, OverlayRow, PrintLogEntry, ActivityLogPage } from './types';

const BASE = '';  // same origin — Vite proxies to backend in dev, served by FastAPI in prod

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  getAsset: (id: string) => req<Asset>(`/api/asset/${encodeURIComponent(id)}`),
  // Add this line inside the `export const api = { ... }` block:
  updateAsset: (id: string, body: Partial<CreateAssetRequest>) => req<{ success: boolean }>(`/api/asset/update/${encodeURIComponent(id)}`, json(body)),
  listAssets: (q = '', status = '') =>
    req<Asset[]>(`/api/assets?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`),
  searchAssets: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return req<Asset[]>(`/api/assets/search?${qs}`);
  },
  getEmployees: () => req<Employee[]>('/api/employees'),
  assignAsset: (body: AssignRequest) => req<{ success: boolean; assignment_id: string }>('/api/asset/assign', json(body)),
  returnAsset: (body: ReturnRequest) => req<{ success: boolean; returned_from: string }>('/api/asset/return', json(body)),
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
  generateReport: async (body: { employee_email: string; doc_type: string; excluded_ids: string[] }): Promise<Blob> => {
    const res = await fetch('/api/report/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  calibrateFromPdf: async (file: File): Promise<{ calibration: CalibrationData }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/overlay/calibrate', { method: 'POST', body: form });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail ?? detail; } catch { /* ignore */ }
      throw new Error(detail);
    }
    return res.json();
  },

  generateOverlay: async (body: { rows: OverlayRow[]; calibration?: CalibrationData }): Promise<Blob> => {
    const res = await fetch('/api/overlay/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(
      `/api/overlay/print-log/${encodeURIComponent(empId)}/${encodeURIComponent(docType)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  },

  // ── Report: generate Word (.docx) ──────────────────────────────────────────
  generateReportDocx: async (body: {
    employee_email: string;
    doc_type: string;
    excluded_ids: string[];
  }): Promise<Blob> => {
    const res = await fetch('/api/report/generate-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  // ── Asset export CSV ───────────────────────────────────────────────────────
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
};
