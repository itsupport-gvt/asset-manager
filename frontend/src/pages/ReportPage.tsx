import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import type { Employee, ReportRow, ReportPreview } from '../lib/types';

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
  row, checked, onChange,
}: { row: ReportRow; checked: boolean; onChange: (v: boolean) => void }) {
  const isCharger = row.is_charger;
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
      cursor: 'pointer', borderRadius: 8, transition: 'background .12s',
      background: checked ? (isCharger ? 'rgba(0,0,0,.03)' : 'var(--primary-bg)') : 'transparent',
      marginLeft: isCharger ? 24 : 0,
      opacity: isCharger ? 0.85 : 1,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: 'var(--primary)', flexShrink: 0 }}
      />
      {isCharger && (
        <span className="icon icon-sm" style={{ color: 'var(--text-3)', fontSize: 16 }}>subdirectory_arrow_right</span>
      )}
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

  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  useEffect(() => {
    api.getEmployees().then(emps => setEmployees(emps.filter(e => !e.is_room)));
  }, []);

  // Load preview whenever employee changes
  useEffect(() => {
    if (!selectedEmp) { setPreview(null); return; }
    setLoadingPreview(true);
    setPreviewError('');
    setExcluded(new Set());
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

  async function generate() {
    if (!selectedEmp || !preview) return;
    setGenerating(true);
    setGenError('');
    try {
      const excludedIds = (preview.rows)
        .filter(r => !isChecked(r))
        .map(r => r.asset_id)
        .filter(Boolean);
      const blob = await api.generateReport({
        employee_email: selectedEmp.email,
        doc_type: docType,
        excluded_ids: excludedIds,
      });
      const name = selectedEmp.full_name.replace(/\s+/g, '_');
      const empId = selectedEmp.employee_id || '';
      downloadBlob(blob, `${docType}_${name}_${empId}.pdf`);
    } catch (e: any) {
      setGenError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
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
                  />
                ))}
              </div>
            )}
          </div>
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

      {/* Generate button */}
      {selectedEmp && preview && preview.rows.length > 0 && (
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={generate}
            disabled={generating || includedCount === 0}
            className="md-btn md-btn-primary"
            style={{ flex: 1, fontSize: 14, padding: '12px 24px' }}
          >
            <span className="icon icon-sm">{generating ? 'hourglass_empty' : 'picture_as_pdf'}</span>
            {generating ? 'Generating PDF…' : `Generate & Download ${docType} PDF`}
          </button>
        </div>
      )}
    </div>
  );
}
