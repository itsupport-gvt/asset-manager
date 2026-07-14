/**
 * ExportPage — Data Export & Reports
 * Three sections: Inventory, Activity Log, Stats Summary
 * Each supports CSV and Excel (.xlsx) with authenticated downloads.
 */

import { useState, useEffect, useRef } from 'react';
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

const STATUSES   = ['In Stock', 'Assigned', 'Under Repair', 'Damaged', 'Retired', 'Lost'];
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];
const ACTIONS    = ['Assigned', 'Returned', 'Created', 'Updated', 'Swap'];

// ── MultiSelectDropdown ───────────────────────────────────────────────────────

function MultiSelectDropdown({
  options, selected, onChange, placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const allSelected = selected.length === options.length;
  const label = selected.length === 0
    ? `All ${placeholder}s`
    : allSelected ? `All ${placeholder}s`
    : selected.length === 1 ? selected[0]
    : `${selected.length} selected`;

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
          borderRadius: 8, background: 'var(--surface)',
          color: selected.length && !allSelected ? 'var(--text-1)' : 'var(--text-3)',
          fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left', gap: 6,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 300,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,.14)', maxHeight: 260, overflowY: 'auto', padding: 4,
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
            cursor: 'pointer', fontSize: 12, color: 'var(--text-2)',
            borderBottom: '1px solid var(--border)', marginBottom: 3,
          }}>
            <input
              type="checkbox" checked={allSelected}
              onChange={e => onChange(e.target.checked ? [...options] : [])}
              style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
            />
            Select all
          </label>
          {options.map(opt => (
            <label key={opt} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
              cursor: 'pointer', fontSize: 13, color: 'var(--text-1)', borderRadius: 6,
            }}>
              <input
                type="checkbox" checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [q,          setQ]          = useState('');
  const [statuses,   setStatuses]   = useState<string[]>([]);
  const [types,      setTypes]      = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [employee,   setEmployee]   = useState('');
  const [brand,      setBrand]      = useState('');
  const [model,      setModel]      = useState('');
  const [fromDate,   setFromDate]   = useState('');
  const [toDate,     setToDate]     = useState('');
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState('');

  function params(format: 'csv' | 'xlsx') {
    return {
      q,
      status:    statuses.length && statuses.length < STATUSES.length   ? statuses.join(',')   : '',
      type:      types.length    && types.length    < assetTypes.length ? types.join(',')      : '',
      condition: conditions.length && conditions.length < CONDITIONS.length ? conditions.join(',') : '',
      employee, brand, model, from_date: fromDate, to_date: toDate, format,
    };
  }

  async function download(format: 'csv' | 'xlsx') {
    setBusy(true); setErr('');
    try { await api.exportInventory(params(format)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(false); }
  }

  function clearFilters() {
    setQ(''); setStatuses([]); setTypes([]); setConditions([]);
    setEmployee(''); setBrand(''); setModel(''); setFromDate(''); setToDate('');
  }

  const hasFilters = q || statuses.length || types.length || conditions.length
    || employee || brand || model || fromDate || toDate;

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
          <MultiSelectDropdown options={STATUSES} selected={statuses} onChange={setStatuses} placeholder="status" />
        </FilterField>

        <FilterField label="Asset Type">
          <MultiSelectDropdown options={assetTypes} selected={types} onChange={setTypes} placeholder="type" />
        </FilterField>

        <FilterField label="Condition">
          <MultiSelectDropdown options={CONDITIONS} selected={conditions} onChange={setConditions} placeholder="condition" />
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
  const [actions,  setActions]  = useState<string[]>([]);
  const [employee, setEmployee] = useState('');
  const [assetId,  setAssetId]  = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState('');

  function params(format: 'csv' | 'xlsx') {
    return {
      q,
      action: actions.length && actions.length < ACTIONS.length ? actions.join(',') : '',
      employee, asset_id: assetId, from_date: fromDate, to_date: toDate, format,
    };
  }

  async function download(format: 'csv' | 'xlsx') {
    setBusy(true); setErr('');
    try { await api.exportActivity(params(format)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Download failed'); }
    finally { setBusy(false); }
  }

  function clearFilters() {
    setQ(''); setActions([]); setEmployee(''); setAssetId(''); setFromDate(''); setToDate('');
  }

  const hasFilters = q || actions.length || employee || assetId || fromDate || toDate;

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
          <MultiSelectDropdown options={ACTIONS} selected={actions} onChange={setActions} placeholder="action" />
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
