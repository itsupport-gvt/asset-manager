/**
 * ExportPage — Data Export & Reports
 * Three sections: Inventory, Activity Log, Stats Summary
 * Each supports CSV and Excel (.xlsx) with authenticated downloads.
 */

import { useState, useEffect } from 'react';
import { api } from '../lib/api';

// ── Shared styles ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 28,
  marginBottom: 20,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-2)',
  marginBottom: 5,
};

const selStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--text-1)',
  fontSize: 13,
  outline: 'none',
};

const STATUSES = ['In Stock', 'Assigned', 'Under Repair', 'Damaged', 'Retired', 'Lost'];
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];
const ACTIONS = ['Assigned', 'Returned', 'Created', 'Updated', 'Swap'];

// ── FormatButtons ─────────────────────────────────────────────────────────────

function FormatButtons({
  onCsv, onXlsx, busy,
}: {
  onCsv: () => void;
  onXlsx: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <button
        className="md-btn md-btn-primary"
        onClick={onCsv}
        disabled={busy}
        style={{ minWidth: 160 }}
      >
        <span className="icon icon-sm">{busy ? 'sync' : 'download'}</span>
        {busy ? 'Downloading…' : 'Export CSV'}
      </button>
      <button
        className="md-btn md-btn-tonal"
        onClick={onXlsx}
        disabled={busy}
        style={{ minWidth: 160 }}
      >
        <span className="icon icon-sm">{busy ? 'sync' : 'table_chart'}</span>
        {busy ? 'Downloading…' : 'Export Excel (.xlsx)'}
      </button>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 9 }}>
        <span className="icon" style={{ fontSize: 20, color: 'var(--primary)' }}>{icon}</span>
        {title}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0 29px' }}>{subtitle}</p>
    </div>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────

function ErrBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div style={{ padding: '9px 14px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, fontSize: 13, marginTop: 12 }}>
      <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>{msg}
    </div>
  );
}

// ── FilterGrid ────────────────────────────────────────────────────────────────

function FilterGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
      {children}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ── Inventory section ─────────────────────────────────────────────────────────

function InventoryExport({ assetTypes }: { assetTypes: string[] }) {
  const [q,         setQ]         = useState('');
  const [status,    setStatus]    = useState('');
  const [type,      setType]      = useState('');
  const [condition, setCondition] = useState('');
  const [employee,  setEmployee]  = useState('');
  const [brand,     setBrand]     = useState('');
  const [model,     setModel]     = useState('');
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');
  const [busy,      setBusy]      = useState(false);
  const [err,       setErr]       = useState('');

  function params(format: 'csv' | 'xlsx') {
    return { q, status, type, condition, employee, brand, model, from_date: fromDate, to_date: toDate, format };
  }

  async function download(format: 'csv' | 'xlsx') {
    setBusy(true); setErr('');
    try { await api.exportInventory(params(format)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(false); }
  }

  function clearFilters() {
    setQ(''); setStatus(''); setType(''); setCondition('');
    setEmployee(''); setBrand(''); setModel(''); setFromDate(''); setToDate('');
  }

  const hasFilters = q || status || type || condition || employee || brand || model || fromDate || toDate;

  return (
    <div style={cardStyle}>
      <SectionHeader
        icon="inventory_2"
        title="Inventory Export"
        subtitle="Export the full asset inventory with all fields. Apply filters to narrow the output."
      />

      <FilterGrid>
        <FilterField label="Search (ID / brand / model / serial)">
          <input className="md-input" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Dell, LT-2024…" style={{ width: '100%' }} />
        </FilterField>

        <FilterField label="Status">
          <select value={status} onChange={e => setStatus(e.target.value)} style={selStyle}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FilterField>

        <FilterField label="Asset Type">
          <select value={type} onChange={e => setType(e.target.value)} style={selStyle}>
            <option value="">All types</option>
            {assetTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FilterField>

        <FilterField label="Condition">
          <select value={condition} onChange={e => setCondition(e.target.value)} style={selStyle}>
            <option value="">All conditions</option>
            {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FilterField>

        <FilterField label="Assigned to (name or email)">
          <input className="md-input" value={employee} onChange={e => setEmployee(e.target.value)} placeholder="Employee name…" style={{ width: '100%' }} />
        </FilterField>

        <FilterField label="Brand">
          <input className="md-input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Dell, HP, Apple…" style={{ width: '100%' }} />
        </FilterField>

        <FilterField label="Model">
          <input className="md-input" value={model} onChange={e => setModel(e.target.value)} placeholder="Model keyword…" style={{ width: '100%' }} />
        </FilterField>

        <FilterField label="Date assigned — from">
          <input className="md-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: '100%' }} />
        </FilterField>

        <FilterField label="Date assigned — to">
          <input className="md-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: '100%' }} />
        </FilterField>
      </FilterGrid>

      {hasFilters && (
        <button
          onClick={clearFilters}
          style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 3 }}>close</span>Clear all filters
        </button>
      )}

      <ErrBanner msg={err} />
      <FormatButtons onCsv={() => download('csv')} onXlsx={() => download('xlsx')} busy={busy} />
    </div>
  );
}

// ── Activity Log section ──────────────────────────────────────────────────────

function ActivityExport() {
  const [q,        setQ]        = useState('');
  const [action,   setAction]   = useState('');
  const [employee, setEmployee] = useState('');
  const [assetId,  setAssetId]  = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState('');

  function params(format: 'csv' | 'xlsx') {
    return { q, action, employee, asset_id: assetId, from_date: fromDate, to_date: toDate, format };
  }

  async function download(format: 'csv' | 'xlsx') {
    setBusy(true); setErr('');
    try { await api.exportActivity(params(format)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(false); }
  }

  function clearFilters() {
    setQ(''); setAction(''); setEmployee(''); setAssetId(''); setFromDate(''); setToDate('');
  }

  const hasFilters = q || action || employee || assetId || fromDate || toDate;

  return (
    <div style={cardStyle}>
      <SectionHeader
        icon="history"
        title="Activity Log Export"
        subtitle="Export all assignment, return, and update events. All filters match the Activity Log page."
      />

      <FilterGrid>
        <FilterField label="Search (asset / employee / action)">
          <input className="md-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Keyword…" style={{ width: '100%' }} />
        </FilterField>

        <FilterField label="Action type">
          <select value={action} onChange={e => setAction(e.target.value)} style={selStyle}>
            <option value="">All actions</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </FilterField>

        <FilterField label="Employee (name or email)">
          <input className="md-input" value={employee} onChange={e => setEmployee(e.target.value)} placeholder="Employee name…" style={{ width: '100%' }} />
        </FilterField>

        <FilterField label="Asset ID">
          <input className="md-input" value={assetId} onChange={e => setAssetId(e.target.value)} placeholder="e.g. LT-2024-001" style={{ width: '100%' }} />
        </FilterField>

        <FilterField label="Date — from">
          <input className="md-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: '100%' }} />
        </FilterField>

        <FilterField label="Date — to">
          <input className="md-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: '100%' }} />
        </FilterField>
      </FilterGrid>

      {hasFilters && (
        <button
          onClick={clearFilters}
          style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 3 }}>close</span>Clear all filters
        </button>
      )}

      <ErrBanner msg={err} />
      <FormatButtons onCsv={() => download('csv')} onXlsx={() => download('xlsx')} busy={busy} />
    </div>
  );
}

// ── Stats Summary section ─────────────────────────────────────────────────────

function StatsExport() {
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState('');

  async function download(format: 'csv' | 'xlsx') {
    setBusy(true); setErr('');
    try { await api.exportStats({ from_date: fromDate, to_date: toDate, format }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(false); }
  }

  return (
    <div style={cardStyle}>
      <SectionHeader
        icon="bar_chart"
        title="Stats Summary Export"
        subtitle="Export a summary snapshot: totals, by-status breakdown, by-type breakdown, top assignees."
      />

      <FilterGrid>
        <FilterField label="Activity date range — from (optional)">
          <input className="md-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ width: '100%' }} />
        </FilterField>
        <FilterField label="Activity date range — to (optional)">
          <input className="md-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ width: '100%' }} />
        </FilterField>
      </FilterGrid>

      <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-2)', background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px' }}>
        <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 5 }}>info</span>
        The summary always reflects the <strong>current inventory state</strong>. The date range only affects the recent activity section of the export.
      </div>

      <ErrBanner msg={err} />
      <FormatButtons onCsv={() => download('csv')} onXlsx={() => download('xlsx')} busy={busy} />
    </div>
  );
}

// ── Main ExportPage ───────────────────────────────────────────────────────────

export function ExportPage() {
  const [assetTypes, setAssetTypes] = useState<string[]>([]);

  useEffect(() => {
    api.fieldValues()
      .then(v => setAssetTypes(v.asset_types ?? []))
      .catch(() => {});
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div className="page-title">Data Export</div>
        <div className="page-subtitle">Export inventory, activity, and stats as CSV or Excel spreadsheets.</div>
      </div>

      <InventoryExport assetTypes={assetTypes} />
      <ActivityExport />
      <StatsExport />
    </div>
  );
}
