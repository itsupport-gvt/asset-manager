import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../lib/api';
import type { Employee, ReportRow, ReportPreview } from '../lib/types';

function todayReturnNote(): string {
  const d = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `Returned ${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

interface ReturnItem {
  asset_id: string;
  asset_type: string;
  brand: string;
  model: string;
  serial_number: string;
  note: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── sub-components ────────────────────────────────────────────────────────────

function TypeBadge({ type, isCharger }: { type: string; isCharger: boolean }) {
  const color = isCharger
    ? { bg: 'var(--surface-2)', text: 'var(--text-3)' }
    : { bg: 'var(--primary-bg)', text: 'var(--primary)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11,
      fontWeight: 500, background: color.bg, color: color.text,
    }}>{type}</span>
  );
}

function AssetRowItem({
  row, checked, onChange, note, onNoteChange,
}: {
  row: ReportRow; checked: boolean; onChange: (v: boolean) => void;
  note: string; onNoteChange: (v: string) => void;
}) {
  const isCharger = row.is_charger;
  return (
    <div style={{ marginLeft: isCharger ? 24 : 0, opacity: isCharger ? 0.85 : 1 }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
        cursor: 'pointer', borderRadius: 8, transition: 'background .12s',
        background: checked ? (isCharger ? 'rgba(0,0,0,.03)' : 'var(--primary-bg)') : 'transparent',
      }}>
        <input
          type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: 'var(--primary)', flexShrink: 0 }}
        />
        {isCharger && <span className="icon icon-sm" style={{ color: 'var(--text-3)', fontSize: 16 }}>subdirectory_arrow_right</span>}
        <TypeBadge type={row.asset_type} isCharger={isCharger} />
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)', flexShrink: 0 }}>
          {row.asset_id || '—'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[row.brand, row.model].filter(Boolean).join(' ') || row.asset_type}
        </span>
        {row.serial_number && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', flexShrink: 0 }}>
            S/N: {row.serial_number}
          </span>
        )}
      </label>
      {/* Per-row notes — blank by default, not pulled from Excel */}
      {!isCharger && (
        <div style={{ paddingLeft: 44, paddingRight: 16, paddingBottom: 6 }}>
          <input
            type="text"
            value={note}
            onChange={e => { e.stopPropagation(); onNoteChange(e.target.value); }}
            onClick={e => e.stopPropagation()}
            placeholder="Add note for this line (optional)…"
            style={{
              width: '100%', boxSizing: 'border-box',
              height: 28, fontSize: 11, padding: '0 8px',
              border: `1px solid ${note ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 5, background: 'var(--surface)',
              color: 'var(--text-1)', outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export function ReportPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [docType, setDocType] = useState<'Handover' | 'Return'>('Handover');

  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [excluded,    setExcluded]    = useState<Set<string>>(new Set());
  const [rowNotes,    setRowNotes]    = useState<Record<string, string>>({});
  const [generating,  setGenerating]  = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);
  const [genError, setGenError] = useState('');

  // ── Returns section ────────────────────────────────────────────────────────
  const [showReturns,    setShowReturns]    = useState(false);
  const [returnItems,    setReturnItems]    = useState<ReturnItem[]>([]);
  const [returnSearch,   setReturnSearch]   = useState('');
  const [returnSearching, setReturnSearching] = useState(false);
  const [returnSearchErr, setReturnSearchErr] = useState('');
  const returnInputRef = useRef<HTMLInputElement>(null);

  // ── Return confirmation dialog ─────────────────────────────────────────────
  const [returnDialogOpen,  setReturnDialogOpen]  = useState(false);
  const [returningToDb,     setReturningToDb]     = useState(false);
  const [returnDbError,     setReturnDbError]     = useState('');
  const [pendingGenDocx,    setPendingGenDocx]    = useState(false);

  useEffect(() => {
    api.getEmployees().then(emps => setEmployees(emps.filter(e => !e.is_room)));
  }, []);

  // Load preview whenever employee changes
  useEffect(() => {
    if (!selectedEmp) { setPreview(null); return; }
    setLoadingPreview(true);
    setPreviewError('');
    setExcluded(new Set());
    setRowNotes({});
    setReturnItems([]);
    setShowReturns(false);
    setReturnSearch('');
    api.reportPreview(selectedEmp.email)
      .then(p => setPreview(p))
      .catch(e => setPreviewError(e.message))
      .finally(() => setLoadingPreview(false));
  }, [selectedEmp]);

  const filtered = useMemo(() =>
    employees.filter(e =>
      `${e.full_name} ${e.employee_id} ${e.email}`.toLowerCase().includes(search.toLowerCase())
    ), [employees, search]);

  function toggleRow(row: ReportRow) {
    const key = row.asset_id || `charger-${row.model}-${row.serial_number}`;
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function isChecked(row: ReportRow) {
    const key = row.asset_id || `charger-${row.model}-${row.serial_number}`;
    return !excluded.has(key);
  }

  function selectAll() { setExcluded(new Set()); }
  function selectNone() {
    const all = new Set((preview?.rows ?? []).map(r => r.asset_id || `charger-${r.model}-${r.serial_number}`));
    setExcluded(all);
  }

  const includedCount = (preview?.rows ?? []).filter(r => isChecked(r)).length;

  function buildBody() {
    const excludedIds = (preview?.rows ?? [])
      .filter(r => !isChecked(r)).map(r => r.asset_id).filter(Boolean);
    return {
      employee_email: selectedEmp!.email,
      doc_type: docType,
      excluded_ids: excludedIds,
      row_notes: rowNotes,
      extra_rows: returnItems.map(r => ({
        asset_id: r.asset_id, asset_type: r.asset_type,
        brand: r.brand, model: r.model,
        serial_number: r.serial_number, notes: r.note,
      })),
    };
  }

  async function generate() {
    if (!selectedEmp || !preview) return;
    setGenerating(true);
    setGenError('');
    try {
      const blob = await api.generateReport(buildBody());
      const name = selectedEmp.full_name.replace(/\s+/g, '_');
      downloadBlob(blob, `${docType}_${name}_${selectedEmp.employee_id || ''}.pdf`);
    } catch (e: any) {
      setGenError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function generateDocx() {
    if (!selectedEmp || !preview) return;
    setGeneratingDocx(true);
    setGenError('');
    try {
      const blob = await api.generateReportDocx(buildBody());
      const name = selectedEmp.full_name.replace(/\s+/g, '_');
      downloadBlob(blob, `${docType}_${name}_${selectedEmp.employee_id || ''}.docx`);
    } catch (e: any) {
      setGenError(e.message || 'Word generation failed');
    } finally {
      setGeneratingDocx(false);
    }
  }

  function handleGenerateClick(isDocx = false) {
    if (returnItems.length > 0) {
      setReturnDbError('');
      setPendingGenDocx(isDocx);
      setReturnDialogOpen(true);
    } else {
      isDocx ? generateDocx() : generate();
    }
  }

  async function handleReturnInDbAndGenerate() {
    setReturningToDb(true);
    setReturnDbError('');
    for (const item of returnItems) {
      try {
        await api.returnAsset({ asset_id: item.asset_id, notes: item.note });
      } catch (e: any) {
        setReturnDbError(`Failed to return ${item.asset_id}: ${e.message}`);
        setReturningToDb(false);
        return;
      }
    }
    setReturnDialogOpen(false);
    setReturningToDb(false);
    pendingGenDocx ? generateDocx() : generate();
  }

  async function handleAddReturn() {
    const id = returnSearch.trim();
    if (!id) return;
    if (returnItems.some(r => r.asset_id.toLowerCase() === id.toLowerCase())) {
      setReturnSearchErr('Already added');
      return;
    }
    setReturnSearching(true);
    setReturnSearchErr('');
    try {
      const asset = await api.getAsset(id);
      setReturnItems(prev => [...prev, {
        asset_id: asset.asset_id,
        asset_type: asset.asset_type,
        brand: asset.brand || '',
        model: asset.model || '',
        serial_number: asset.serial_number || '',
        note: todayReturnNote(),
      }]);
      setReturnSearch('');
      returnInputRef.current?.focus();
    } catch (e: any) {
      setReturnSearchErr(e.message || 'Asset not found');
    } finally {
      setReturnSearching(false);
    }
  }

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div>
        <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0 }}>
          Report Generator
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4 }}>
          Generate handover or return PDFs directly from the asset database.
        </p>
      </div>

      {/* Configuration card */}
      <div className="md-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span className="icon" style={{ color: 'var(--primary)', fontSize: 18 }}>tune</span>
          <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>Configuration</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'end' }}>

          {/* Employee selector */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>
              Employee <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={selectedEmp ? selectedEmp.employee_display || selectedEmp.full_name : search}
                onChange={e => {
                  setSearch(e.target.value);
                  setSelectedEmp(null);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                placeholder="Search by name or employee ID…"
                className="md-input"
                style={{ width: '100%', paddingLeft: 14 }}
              />
              {dropdownOpen && filtered.length > 0 && (
                <div className="md-card" style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  maxHeight: 240, overflowY: 'auto', zIndex: 500, padding: 4,
                }}>
                  {filtered.slice(0, 20).map(emp => (
                    <button
                      key={emp.email}
                      onMouseDown={() => { setSelectedEmp(emp); setSearch(''); setDropdownOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '9px 12px', background: 'none', border: 'none',
                        borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                        color: 'var(--text-1)', fontSize: 13,
                      }}
                    >
                      <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>person</span>
                      <span style={{ flex: 1 }}>{emp.full_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>{emp.employee_id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Doc type toggle */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>
              Document Type
            </label>
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {(['Handover', 'Return'] as const).map(dt => (
                <button
                  key={dt}
                  onClick={() => setDocType(dt)}
                  style={{
                    padding: '9px 20px', border: 'none', cursor: 'pointer', fontSize: 13,
                    fontWeight: docType === dt ? 600 : 400,
                    background: docType === dt ? 'var(--primary)' : 'var(--surface)',
                    color: docType === dt ? '#fff' : 'var(--text-2)',
                    transition: 'background .15s, color .15s',
                  }}
                >
                  {dt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Asset preview */}
      {selectedEmp && (
        <div className="md-card" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Preview header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="icon" style={{ color: 'var(--primary)', fontSize: 18 }}>checklist</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>
                Assets for {selectedEmp.full_name}
              </div>
              {preview && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                  {preview.employee.designation} · {preview.asset_count} asset{preview.asset_count !== 1 ? 's' : ''} · {includedCount} selected
                </div>
              )}
            </div>
            {preview && preview.rows.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={selectAll} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--primary)', cursor: 'pointer', padding: '4px 8px' }}>All</button>
                <button onClick={selectNone} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', padding: '4px 8px' }}>None</button>
              </div>
            )}
          </div>

          {/* Content */}
          <div style={{ minHeight: 80 }}>
            {loadingPreview && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, color: 'var(--text-2)' }}>
                <div style={{ width: 20, height: 20, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                Loading assets…
              </div>
            )}
            {previewError && (
              <div style={{ padding: 20, color: 'var(--danger)', fontSize: 13 }}>
                <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>{previewError}
              </div>
            )}
            {!loadingPreview && preview && preview.rows.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
                <span className="icon" style={{ fontSize: 40, display: 'block', marginBottom: 8 }}>inbox</span>
                No assets currently assigned to this employee.
              </div>
            )}
            {!loadingPreview && preview && preview.rows.length > 0 && (
              <div style={{ padding: '8px 4px' }}>
                {preview.rows.map((row, i) => (
                  <AssetRowItem
                    key={`${row.asset_id}-${i}`}
                    row={row}
                    checked={isChecked(row)}
                    onChange={() => toggleRow(row)}
                    note={rowNotes[row.asset_id] ?? ''}
                    onNoteChange={v => setRowNotes(prev => ({ ...prev, [row.asset_id]: v }))}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Returns section ── */}
      {selectedEmp && (
        <div className="md-card" style={{ padding: 0, overflow: 'hidden' }}>
          <button
            onClick={() => setShowReturns(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 20px', background: showReturns ? '#fce8e6' : 'var(--surface)',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              borderBottom: showReturns ? '1px solid #f4b8b4' : 'none',
            }}
          >
            <span className="icon" style={{ color: showReturns ? '#c5221f' : 'var(--text-3)', fontSize: 18 }}>undo</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: 14, color: showReturns ? '#c5221f' : 'var(--text-2)' }}>
                Include returned assets (optional)
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                Add previously returned assets to appear at the bottom of the report
              </div>
            </div>
            {returnItems.length > 0 && (
              <span style={{ fontSize: 12, background: '#c5221f', color: '#fff', borderRadius: 10, padding: '2px 8px', fontWeight: 600 }}>
                {returnItems.length}
              </span>
            )}
            <span className="icon" style={{ fontSize: 18, color: 'var(--text-3)' }}>{showReturns ? 'expand_less' : 'expand_more'}</span>
          </button>

          {showReturns && (
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px' }}>
                Search for assets by ID (they'll appear as additional rows at the bottom of the report with a return note).
              </p>

              {/* Search bar */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  ref={returnInputRef}
                  className="md-input"
                  value={returnSearch}
                  onChange={e => { setReturnSearch(e.target.value); setReturnSearchErr(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddReturn(); }}
                  placeholder="Enter asset ID (e.g. LT-2507-0001)…"
                  style={{ flex: 1, fontSize: 13 }}
                  disabled={returnSearching}
                />
                <button
                  className="md-btn"
                  onClick={handleAddReturn}
                  disabled={!returnSearch.trim() || returnSearching}
                  style={{ background: 'var(--primary-bg)', color: 'var(--primary)', border: '1px solid var(--primary)', whiteSpace: 'nowrap' }}
                >
                  {returnSearching
                    ? <span className="icon icon-sm" style={{ animation: 'spin 1s linear infinite' }}>sync</span>
                    : <span className="icon icon-sm">add</span>
                  }
                  Add
                </button>
              </div>

              {returnSearchErr && (
                <div style={{ fontSize: 12, color: '#c5221f', marginBottom: 10 }}>
                  <span className="icon icon-sm" style={{ verticalAlign: 'middle' }}>error</span> {returnSearchErr}
                </div>
              )}

              {/* Added return items */}
              {returnItems.length > 0 && (
                <div style={{ border: '1px solid #f4b8b4', borderRadius: 10, overflow: 'hidden' }}>
                  {returnItems.map((item, i) => (
                    <div
                      key={item.asset_id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i > 0 ? '1px solid #f4b8b4' : 'none', background: '#fff8f8' }}
                    >
                      <span style={{ fontSize: 10, background: '#fce8e6', color: '#c5221f', padding: '2px 6px', borderRadius: 6, fontWeight: 600, flexShrink: 0 }}>RETURN</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--text-1)', flexShrink: 0 }}>{item.asset_id}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{item.asset_type} · {item.brand} {item.model}</span>
                      <input
                        className="md-input"
                        value={item.note}
                        onChange={e => setReturnItems(prev => prev.map((r, j) => j === i ? { ...r, note: e.target.value } : r))}
                        style={{ width: 220, fontSize: 12, borderColor: '#f4b8b4' }}
                        placeholder="Return note…"
                      />
                      <button
                        onClick={() => setReturnItems(prev => prev.filter((_, j) => j !== i))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0 }}
                        title="Remove"
                      >
                        <span className="icon" style={{ fontSize: 18 }}>close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {returnItems.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>
                  No return items added yet.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selectedEmp && (
        <div className="md-card" style={{ padding: 48, textAlign: 'center' }}>
          <span className="icon" style={{ fontSize: 48, color: 'var(--text-3)', display: 'block', marginBottom: 12 }}>person_search</span>
          <p style={{ color: 'var(--text-2)', fontSize: 14, margin: 0 }}>Select an employee above to preview their assets.</p>
        </div>
      )}

      {/* Error */}
      {genError && (
        <div style={{ padding: '10px 16px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
          <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>{genError}
        </div>
      )}

      {/* Generate buttons */}
      {selectedEmp && preview && (preview.rows.length > 0 || returnItems.length > 0) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => handleGenerateClick(false)}
            disabled={generating || generatingDocx || (includedCount === 0 && returnItems.length === 0)}
            className="md-btn md-btn-primary"
            style={{ flex: 1, minWidth: 200, fontSize: 14, padding: '12px 24px' }}
          >
            <span className="icon icon-sm">{generating ? 'hourglass_empty' : 'picture_as_pdf'}</span>
            {generating ? 'Generating PDF…' : `Generate & Download ${docType} PDF`}
          </button>
          <button
            onClick={() => handleGenerateClick(true)}
            disabled={generatingDocx || generating || (includedCount === 0 && returnItems.length === 0)}
            className="md-btn"
            style={{ fontSize: 14, padding: '12px 24px', background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
          >
            <span className="icon icon-sm">{generatingDocx ? 'hourglass_empty' : 'description'}</span>
            {generatingDocx ? 'Generating Word…' : 'Download Word (.docx)'}
          </button>
        </div>
      )}

      {/* ── Return confirmation dialog ── */}
      {returnDialogOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, maxWidth: 480, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 600, color: 'var(--text-1)' }}>
              Return assets in system?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px' }}>
              The following assets are included as returns in this report. Do you also want to update their status to <strong>In Stock</strong> in the database?
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
              {returnItems.map(item => (
                <div key={item.asset_id} style={{ fontSize: 12, background: '#fce8e6', color: '#c5221f', padding: '3px 10px', borderRadius: 10 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.asset_id}</span>
                  <span style={{ marginLeft: 6, color: '#a0463a', fontSize: 11 }}>{item.note}</span>
                </div>
              ))}
            </div>

            {returnDbError && (
              <div style={{ padding: '8px 12px', background: '#fce8e6', color: '#c5221f', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
                <span className="icon icon-sm">error</span> {returnDbError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="md-btn md-btn-primary"
                disabled={returningToDb}
                onClick={handleReturnInDbAndGenerate}
                style={{ background: '#c5221f', borderColor: '#c5221f' }}
              >
                <span className="icon icon-sm">{returningToDb ? 'sync' : 'undo'}</span>
                {returningToDb ? 'Returning…' : 'Return in DB + Download'}
              </button>
              <button
                className="md-btn"
                disabled={returningToDb}
                onClick={() => { setReturnDialogOpen(false); pendingGenDocx ? generateDocx() : generate(); }}
              >
                <span className="icon icon-sm">download</span>
                Print only
              </button>
              <button
                className="md-btn"
                disabled={returningToDb}
                onClick={() => setReturnDialogOpen(false)}
                style={{ marginLeft: 'auto' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
