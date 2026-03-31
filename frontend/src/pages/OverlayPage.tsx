/**
 * OverlayPage — Print Overlay Workflow
 *
 * Features ported from main-v2.py:
 *  1. Employee + doc type selection
 *  2. Asset list (DB assets) + custom item entry
 *  3. Notes per asset row
 *  4. Row position assignment (page + row for each asset)
 *  5. PDF calibration (upload existing form PDF → auto-detect positions)
 *  6. Calibration grid download
 *  7. Generate overlay PDF (download)
 *  8. Print log (mark printed, view history, clear)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import type { Employee, CalibrationData, OverlayRow, PrintLogEntry } from '../lib/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Step components ───────────────────────────────────────────────────────────

type DocType = 'Handover' | 'Return';

interface AssetRow {
  id: string;           // used as key
  asset_id: string;
  asset_type: string;
  brand: string;
  model: string;
  serial_number: string;
  notes: string;
  is_custom: boolean;
}

interface RowAssignment {
  asset_row: AssetRow;
  page: number;
  target_row: number;
  note: string;         // per-row note override for the overlay
}

// ──────────────────────────────────────────────────────────────────────────────

export function OverlayPage() {
  // ── Step state ─────────────────────────────────────────────────────────────
  type Step = 'select' | 'assets' | 'positions' | 'calibrate' | 'review' | 'log';
  const [step, setStep] = useState<Step>('select');

  // ── Step 1: employee + doc type ────────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [docType, setDocType] = useState<DocType>('Handover');
  const [empDropOpen, setEmpDropOpen] = useState(false);
  const empBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Step 2: assets ─────────────────────────────────────────────────────────
  const [dbAssets, setDbAssets] = useState<AssetRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customItems, setCustomItems] = useState<AssetRow[]>([]);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customForm, setCustomForm] = useState({ asset_id: '', asset_type: '', brand: '', model: '', serial_number: '' });
  const [printLog, setPrintLog] = useState<PrintLogEntry | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);

  // ── Step 3: row positions ──────────────────────────────────────────────────
  const [assignments, setAssignments] = useState<RowAssignment[]>([]);

  // ── Calibration ────────────────────────────────────────────────────────────
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const [calibError, setCalibError] = useState('');
  const [calibLoading, setCalibLoading] = useState(false);

  // ── Generate ────────────────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // ── Print log ──────────────────────────────────────────────────────────────
  const [logLoading, setLogLoading] = useState(false);
  const [markMsg, setMarkMsg] = useState('');

  // ── Load employees on mount ────────────────────────────────────────────────
  useEffect(() => {
    api.getEmployees().then(setEmployees).catch(() => { });
  }, []);

  // ── Load assets + print log when employee + docType selected ──────────────
  const loadAssetsForEmployee = useCallback(async (emp: Employee, dt: DocType) => {
    setLoadingAssets(true);
    try {
      const preview = await api.reportPreview(emp.email);
      const rows: AssetRow[] = preview.rows.map((r, i) => ({
        id: r.asset_id || `charger-${i}`,
        asset_id: r.asset_id,
        asset_type: r.asset_type,
        brand: r.brand,
        model: r.model,
        serial_number: r.serial_number,
        notes: r.notes,
        is_custom: false,
      }));
      setDbAssets(rows);
      setSelectedIds(new Set(rows.map(r => r.id)));

      const log = await api.getPrintLog(emp.employee_id || emp.email, dt);
      setPrintLog(log);
    } catch {
      setDbAssets([]);
    }
    setLoadingAssets(false);
  }, []);

  // ── Employee filtered list ─────────────────────────────────────────────────
  const empSuggestions = empSearch.trim()
    ? employees.filter(e =>
        e.employee_display.toLowerCase().includes(empSearch.toLowerCase()) ||
        e.email.toLowerCase().includes(empSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  // ── All rows (db + custom) in selected order ───────────────────────────────
  const allSelectedRows = [
    ...dbAssets.filter(r => selectedIds.has(r.id)),
    ...customItems,
  ];

  // ── Init assignments when entering positions step ─────────────────────────
  function initAssignments() {
    const asgn: RowAssignment[] = allSelectedRows.map((row, i) => {
      const existing = assignments.find(a => a.asset_row.id === row.id);
      if (existing) return existing;
      // Auto-assign: rows 1-7 on page 1, then 1+ on page 2
      const page = i < 7 ? 1 : 2;
      const target_row = i < 7 ? i + 1 : i - 6;
      return { asset_row: row, page, target_row, note: row.notes || '' };
    });
    setAssignments(asgn);
  }

  // ── Build OverlayRows for API ──────────────────────────────────────────────
  function buildOverlayRows(): OverlayRow[] {
    return assignments.map(a => ({
      page: a.page,
      target_row: a.target_row,
      asset_id: a.asset_row.asset_id,
      values: [
        a.asset_row.asset_id,
        a.asset_row.asset_type,
        a.asset_row.brand,
        a.asset_row.model,
        a.asset_row.serial_number,
        a.note,
        '',  // Signature blank
      ],
    }));
  }

  // ── Generate overlay ───────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    try {
      const rows = buildOverlayRows();
      const blob = await api.generateOverlay({ rows, calibration: calibration || undefined });
      const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      downloadBlob(blob, `Overlay_${docType}_${selectedEmp?.employee_id || 'EMP'}_${ts}.pdf`);
    } catch (e: any) {
      setGenError(e.message || 'Generation failed');
    }
    setGenerating(false);
  }

  // ── Mark printed ───────────────────────────────────────────────────────────
  async function handleMarkPrinted() {
    if (!selectedEmp) return;
    const ids = assignments.map(a => a.asset_row.asset_id).filter(Boolean);
    setLogLoading(true);
    try {
      const res = await api.markPrinted(selectedEmp.employee_id || selectedEmp.email, docType, ids);
      setMarkMsg(`Marked ${res.marked.length} asset(s) as printed (total: ${res.total_printed})`);
      const log = await api.getPrintLog(selectedEmp.employee_id || selectedEmp.email, docType);
      setPrintLog(log);
    } catch (e: any) {
      setMarkMsg('Failed: ' + e.message);
    }
    setLogLoading(false);
  }

  async function handleClearLog() {
    if (!selectedEmp || !window.confirm('Clear print log for this employee?')) return;
    await api.clearPrintLog(selectedEmp.employee_id || selectedEmp.email, docType);
    setPrintLog(null);
    setMarkMsg('Print log cleared.');
  }

  // ── Calibration upload ─────────────────────────────────────────────────────
  async function handleCalibUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCalibError('');
    setCalibLoading(true);
    try {
      const res = await api.calibrateFromPdf(file);
      setCalibration(res.calibration);
    } catch (err: any) {
      setCalibError(err.message || 'Calibration failed');
      setCalibration(null);
    }
    setCalibLoading(false);
  }

  async function handleCalibGridDownload() {
    const res = await fetch('/api/overlay/calibration-grid');
    const blob = await res.blob();
    downloadBlob(blob, 'calibration_grid.pdf');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 28,
    marginBottom: 20,
  };

  const stepBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    background: active ? 'var(--primary-bg)' : 'var(--surface-2)',
    color: active ? 'var(--primary)' : 'var(--text-2)',
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    cursor: 'pointer',
  });

  const steps: { key: Step; label: string; icon: string }[] = [
    { key: 'select', label: 'Employee', icon: 'person' },
    { key: 'assets', label: 'Assets', icon: 'inventory_2' },
    { key: 'positions', label: 'Row Positions', icon: 'table_rows' },
    { key: 'calibrate', label: 'Calibrate', icon: 'tune' },
    { key: 'review', label: 'Generate', icon: 'print' },
    { key: 'log', label: 'Print Log', icon: 'history' },
  ];

  const printedSet = new Set(printLog?.printed_ids ?? []);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0 }}>
          Print Overlay
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 4 }}>
          Generate a precision overlay PDF to print new asset rows on already-printed forms.
        </p>
      </div>

      {/* Step breadcrumb */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        {steps.map(s => (
          <button
            key={s.key}
            style={stepBtnStyle(step === s.key)}
            onClick={() => {
              if (s.key === 'assets' && !selectedEmp) return;
              if (s.key === 'positions' && allSelectedRows.length === 0) return;
              setStep(s.key);
              if (s.key === 'positions') initAssignments();
            }}
          >
            <span className="icon" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }}>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── STEP 1: SELECT EMPLOYEE ── */}
      {step === 'select' && (
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 17, fontWeight: 600, marginTop: 0, color: 'var(--text-1)' }}>
            Select Employee &amp; Document Type
          </h2>

          {/* Doc type */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {(['Handover', 'Return'] as DocType[]).map(dt => (
              <button
                key={dt}
                onClick={() => setDocType(dt)}
                style={{
                  padding: '8px 22px', borderRadius: 20, fontSize: 13,
                  fontWeight: docType === dt ? 600 : 400, cursor: 'pointer',
                  background: docType === dt ? 'var(--primary)' : 'var(--surface-2)',
                  color: docType === dt ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${docType === dt ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >{dt}</button>
            ))}
          </div>

          {/* Employee search */}
          <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Employee</label>
          <div style={{ position: 'relative', maxWidth: 420 }}>
            <input
              className="md-input"
              value={selectedEmp ? selectedEmp.employee_display : empSearch}
              onChange={e => { setSelectedEmp(null); setEmpSearch(e.target.value); setEmpDropOpen(true); }}
              onFocus={() => setEmpDropOpen(true)}
              onBlur={() => { empBlurTimer.current = setTimeout(() => setEmpDropOpen(false), 150); }}
              placeholder="Search by name or ID…"
              style={{ width: '100%' }}
            />
            {empDropOpen && empSuggestions.length > 0 && (
              <div className="md-card" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, padding: 4, maxHeight: 280, overflowY: 'auto' }}>
                {empSuggestions.map(e => (
                  <button
                    key={e.email}
                    onMouseDown={() => { if (empBlurTimer.current) clearTimeout(empBlurTimer.current); }}
                    onClick={() => {
                      setSelectedEmp(e);
                      setEmpSearch('');
                      setEmpDropOpen(false);
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{e.employee_display}</span>
                    <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: 12 }}>{e.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedEmp && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--success-bg)', borderRadius: 10, fontSize: 13, color: 'var(--success)' }}>
              <span className="icon" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 6 }}>check_circle</span>
              {selectedEmp.employee_display} — {selectedEmp.email}
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button
              className="md-btn md-btn-primary"
              disabled={!selectedEmp}
              onClick={() => {
                if (!selectedEmp) return;
                loadAssetsForEmployee(selectedEmp, docType);
                setStep('assets');
              }}
            >
              Next: Select Assets
              <span className="icon icon-sm">arrow_forward</span>
            </button>
            <button
              className="md-btn"
              onClick={() => setStep('log')}
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
              disabled={!selectedEmp}
            >
              <span className="icon icon-sm">history</span>
              View Print Log
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: ASSETS ── */}
      {step === 'assets' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 17, fontWeight: 600, margin: 0, color: 'var(--text-1)' }}>
              Select Assets
            </h2>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {selectedEmp?.employee_display} · {docType}
            </span>
          </div>

          {loadingAssets ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Loading assets…</div>
          ) : (
            <>
              {/* Quick-select buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button className="md-btn" style={{ fontSize: 12 }} onClick={() => setSelectedIds(new Set(dbAssets.map(r => r.id)))}>
                  Select all
                </button>
                <button className="md-btn" style={{ fontSize: 12 }} onClick={() => {
                  const unprinted = new Set(dbAssets.filter(r => !printedSet.has(r.asset_id)).map(r => r.id));
                  setSelectedIds(unprinted);
                }}>
                  Select new only
                </button>
                <button className="md-btn" style={{ fontSize: 12 }} onClick={() => setSelectedIds(new Set())}>
                  Deselect all
                </button>
              </div>

              {/* Asset list */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th style={{ width: 36, padding: '8px 10px', textAlign: 'center' }}></th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Asset ID</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Type</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Brand / Model</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Serial</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-2)', fontWeight: 500 }}>Printed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbAssets.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>No assets assigned</td></tr>
                    )}
                    {dbAssets.map(row => {
                      const printed = printedSet.has(row.asset_id);
                      const checked = selectedIds.has(row.id);
                      return (
                        <tr
                          key={row.id}
                          onClick={() => {
                            const next = new Set(selectedIds);
                            next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                            setSelectedIds(next);
                          }}
                          style={{ cursor: 'pointer', background: checked ? 'var(--primary-bg)' : 'transparent', borderTop: '1px solid var(--border)' }}
                        >
                          <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                            <input type="checkbox" checked={checked} readOnly style={{ cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--text-1)', fontFamily: 'monospace', fontSize: 12 }}>{row.asset_id || '—'}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-2)' }}>{row.asset_type}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-2)' }}>{row.brand} {row.model}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-3)', fontSize: 12 }}>{row.serial_number}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            {printed && <span style={{ fontSize: 11, background: '#ceead6', color: '#1e7e34', padding: '2px 7px', borderRadius: 10 }}>printed</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {customItems.map((row, i) => (
                      <tr key={row.id} style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                        <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setCustomItems(ci => ci.filter((_, j) => j !== i)); }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--error)', padding: 0, fontSize: 16 }}
                            title="Remove custom item"
                          >
                            <span className="icon" style={{ fontSize: 18 }}>remove_circle_outline</span>
                          </button>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--primary)', fontSize: 12, fontFamily: 'monospace' }}>{row.asset_id}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)' }}>{row.asset_type}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-2)' }}>{row.brand} {row.model}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-3)', fontSize: 12 }}>{row.serial_number}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, background: '#e8f0fe', color: '#1a73e8', padding: '2px 7px', borderRadius: 10 }}>custom</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add custom item */}
              <div style={{ marginTop: 12 }}>
                {!showAddCustom ? (
                  <button className="md-btn" style={{ fontSize: 13 }} onClick={() => setShowAddCustom(true)}>
                    <span className="icon icon-sm">add_circle_outline</span>
                    Add custom item (charger, bag, etc.)
                  </button>
                ) : (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--surface-2)', marginTop: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                      {(['asset_id', 'asset_type', 'brand', 'model', 'serial_number'] as const).map(field => (
                        <input
                          key={field}
                          className="md-input"
                          value={customForm[field]}
                          onChange={e => setCustomForm(f => ({ ...f, [field]: e.target.value }))}
                          placeholder={field.replace('_', ' ')}
                          style={{ fontSize: 12 }}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="md-btn md-btn-primary"
                        style={{ fontSize: 12 }}
                        onClick={() => {
                          if (!customForm.asset_id && !customForm.asset_type) return;
                          const newItem: AssetRow = {
                            id: `custom-${Date.now()}`,
                            ...customForm,
                            notes: '',
                            is_custom: true,
                          };
                          setCustomItems(ci => [...ci, newItem]);
                          setCustomForm({ asset_id: '', asset_type: '', brand: '', model: '', serial_number: '' });
                          setShowAddCustom(false);
                        }}
                      >Add</button>
                      <button className="md-btn" style={{ fontSize: 12 }} onClick={() => setShowAddCustom(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button className="md-btn" onClick={() => setStep('select')}>
              <span className="icon icon-sm">arrow_back</span> Back
            </button>
            <button
              className="md-btn md-btn-primary"
              disabled={allSelectedRows.length === 0}
              onClick={() => { initAssignments(); setStep('positions'); }}
            >
              Next: Assign Rows ({allSelectedRows.length})
              <span className="icon icon-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: ROW POSITIONS ── */}
      {step === 'positions' && (
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 17, fontWeight: 600, marginTop: 0, color: 'var(--text-1)' }}>
            Assign Row Positions &amp; Notes
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            For each asset, set the PAGE and ROW number where it will be printed on the physical form.
            Row 1 = first data row (after header). Page 1 has 7 rows typically.
          </p>

          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Asset</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-2)', fontWeight: 500, width: 80 }}>Page</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-2)', fontWeight: 500, width: 80 }}>Row</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Notes (overlay)</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a, i) => (
                  <tr key={a.asset_row.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-1)', fontSize: 12, fontFamily: 'monospace' }}>{a.asset_row.asset_id || <em style={{ color: 'var(--primary)', fontStyle: 'normal' }}>custom</em>}</div>
                      <div style={{ color: 'var(--text-2)', fontSize: 12 }}>{a.asset_row.asset_type} · {a.asset_row.brand} {a.asset_row.model}</div>
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                      <input
                        type="number" min={1} max={2} value={a.page}
                        onChange={e => {
                          const val = Math.max(1, Math.min(2, parseInt(e.target.value) || 1));
                          setAssignments(prev => prev.map((x, j) => j === i ? { ...x, page: val } : x));
                        }}
                        style={{ width: 56, textAlign: 'center', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
                      />
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                      <input
                        type="number" min={1} max={20} value={a.target_row}
                        onChange={e => {
                          const val = Math.max(1, Math.min(20, parseInt(e.target.value) || 1));
                          setAssignments(prev => prev.map((x, j) => j === i ? { ...x, target_row: val } : x));
                        }}
                        style={{ width: 56, textAlign: 'center', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <input
                        className="md-input"
                        value={a.note}
                        onChange={e => setAssignments(prev => prev.map((x, j) => j === i ? { ...x, note: e.target.value } : x))}
                        placeholder="Optional note for this row…"
                        style={{ width: '100%', fontSize: 12 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button className="md-btn" onClick={() => setStep('assets')}>
              <span className="icon icon-sm">arrow_back</span> Back
            </button>
            <button className="md-btn md-btn-primary" onClick={() => setStep('calibrate')}>
              Next: Calibration
              <span className="icon icon-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: CALIBRATION ── */}
      {step === 'calibrate' && (
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 17, fontWeight: 600, marginTop: 0, color: 'var(--text-1)' }}>
            Calibration (Optional)
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            Upload an existing form PDF to auto-detect exact column/row positions.
            This makes the overlay perfectly aligned. Skip to use the baked-in defaults.
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <label
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: 'var(--primary-bg)', color: 'var(--primary)', cursor: 'pointer',
                border: '1px solid var(--primary)',
              }}
            >
              <span className="icon icon-sm">upload_file</span>
              {calibLoading ? 'Reading PDF…' : 'Upload form PDF to calibrate'}
              <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleCalibUpload} disabled={calibLoading} />
            </label>

            <button
              className="md-btn"
              onClick={handleCalibGridDownload}
              style={{ fontSize: 13 }}
              title="Download a ruler grid PDF for manual measurement"
            >
              <span className="icon icon-sm">grid_on</span>
              Download calibration grid
            </button>
          </div>

          {calibError && (
            <div style={{ padding: '10px 14px', background: '#fce8e6', color: '#c5221f', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
              <span className="icon icon-sm">error</span> {calibError}
            </div>
          )}

          {calibration ? (
            <div style={{ padding: '12px 16px', background: 'var(--success-bg)', borderRadius: 10, fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 6 }}>
                <span className="icon icon-sm">check_circle</span> Calibration loaded from PDF
              </div>
              {Object.entries(calibration).map(([pageNum, p]) => (
                <div key={pageNum} style={{ color: 'var(--text-2)', marginTop: 4 }}>
                  Page {pageNum}: data_start_y={p.data_start_y.toFixed(2)}mm, row_h={p.avg_row_h.toFixed(3)}mm,
                  {p.num_data_rows} data rows, {p.col_x0.length} cols
                </div>
              ))}
              <button
                style={{ marginTop: 8, fontSize: 12, color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => setCalibration(null)}
              >
                Remove calibration (use defaults)
              </button>
            </div>
          ) : (
            <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text-2)' }}>
              <span className="icon icon-sm">info</span> Using baked-in defaults (measured from standard form)
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button className="md-btn" onClick={() => setStep('positions')}>
              <span className="icon icon-sm">arrow_back</span> Back
            </button>
            <button className="md-btn md-btn-primary" onClick={() => setStep('review')}>
              Next: Review &amp; Generate
              <span className="icon icon-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: REVIEW + GENERATE ── */}
      {step === 'review' && (
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 17, fontWeight: 600, marginTop: 0, color: 'var(--text-1)' }}>
            Review &amp; Generate Overlay
          </h2>

          {/* Summary table */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={{ padding: '7px 10px', textAlign: 'center', color: 'var(--text-2)', fontWeight: 500, width: 55 }}>Pg·Row</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Asset ID</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Type</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Brand / Model</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Serial</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--text-2)', fontWeight: 500 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map(a => (
                  <tr key={a.asset_row.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600, color: 'var(--primary)' }}>{a.page}·{a.target_row}</td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-1)' }}>{a.asset_row.asset_id || '—'}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-2)' }}>{a.asset_row.asset_type}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-2)' }}>{a.asset_row.brand} {a.asset_row.model}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-3)', fontSize: 12 }}>{a.asset_row.serial_number}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-2)', fontSize: 12, fontStyle: a.note ? 'normal' : 'italic' }}>
                      {a.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Calibration status */}
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              {calibration ? 'check_circle' : 'info'}
            </span>
            {calibration ? 'Using calibration from uploaded PDF' : 'Using baked-in default calibration'}
          </div>

          {genError && (
            <div style={{ padding: '10px 14px', background: '#fce8e6', color: '#c5221f', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
              <span className="icon icon-sm">error</span> {genError}
            </div>
          )}

          <div style={{ background: '#fff8e1', border: '1px solid #f9ab00', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b06000', marginBottom: 16 }}>
            <span className="icon icon-sm">warning</span>
            Load the already-printed sheet back into the printer before printing this overlay PDF.
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="md-btn" onClick={() => setStep('calibrate')}>
              <span className="icon icon-sm">arrow_back</span> Back
            </button>
            <button
              className="md-btn md-btn-primary"
              disabled={generating}
              onClick={handleGenerate}
              style={{ minWidth: 180 }}
            >
              <span className="icon icon-sm">{generating ? 'sync' : 'download'}</span>
              {generating ? 'Generating…' : 'Generate & Download Overlay'}
            </button>
            {!generating && (
              <button
                className="md-btn"
                onClick={() => { handleGenerate(); setTimeout(() => handleMarkPrinted(), 2000); }}
                style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid #ceead6' }}
                title="Generate overlay AND mark assets as printed"
              >
                <span className="icon icon-sm">check_circle</span>
                Generate + Mark Printed
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 6: PRINT LOG ── */}
      {step === 'log' && (
        <div style={cardStyle}>
          <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 17, fontWeight: 600, marginTop: 0, color: 'var(--text-1)' }}>
            Print Log
          </h2>

          {!selectedEmp ? (
            <div style={{ color: 'var(--text-3)', padding: 20 }}>Select an employee first.</div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
                {selectedEmp.employee_display} · {docType}
              </div>

              {markMsg && (
                <div style={{ padding: '8px 12px', background: 'var(--success-bg)', borderRadius: 8, fontSize: 13, color: 'var(--success)', marginBottom: 12 }}>
                  {markMsg}
                </div>
              )}

              {(!printLog || printLog.printed_ids.length === 0) ? (
                <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '12px 0' }}>No print history for this employee / doc type.</div>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>
                      {printLog.printed_ids.length} asset(s) marked as printed:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {printLog.printed_ids.map(id => (
                        <span key={id} style={{ fontSize: 12, background: '#ceead6', color: '#1e7e34', padding: '2px 8px', borderRadius: 10, fontFamily: 'monospace' }}>{id}</span>
                      ))}
                    </div>
                  </div>

                  {printLog.history.length > 0 && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginBottom: 6 }}>Print sessions:</div>
                      {printLog.history.map((h, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text-2)', padding: '4px 0', borderTop: '1px solid var(--border)' }}>
                          <span style={{ color: 'var(--text-3)' }}>[{h.timestamp.slice(0, 19).replace('T', ' ')}]</span>
                          {' '}{h.added_ids.length > 0 ? h.added_ids.join(', ') : '(none new)'}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                <button
                  className="md-btn"
                  disabled={logLoading || assignments.length === 0}
                  onClick={handleMarkPrinted}
                  style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid #ceead6' }}
                >
                  <span className="icon icon-sm">check_circle</span>
                  Mark current selection as printed
                </button>
                <button
                  className="md-btn"
                  onClick={handleClearLog}
                  style={{ color: 'var(--error)', border: '1px solid var(--border)' }}
                >
                  <span className="icon icon-sm">delete</span>
                  Clear log
                </button>
                <button
                  className="md-btn"
                  onClick={async () => {
                    if (!selectedEmp) return;
                    setLogLoading(true);
                    const log = await api.getPrintLog(selectedEmp.employee_id || selectedEmp.email, docType);
                    setPrintLog(log);
                    setLogLoading(false);
                  }}
                >
                  <span className="icon icon-sm">refresh</span>
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
