import { useState, useEffect } from 'react';

// ── SpecInput — generic number + unit dropdown ────────────────────────────────
export function SpecInput({
  label, value, onChange, units, placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  units: string[];
  placeholder?: string;
  required?: boolean;
}) {
  function parse(v: string) {
    const m = (v || '').trim().match(/^(\d+(?:\.\d+)?)\s*(.+)?$/);
    if (m) {
      const matchedUnit = units.find(u => u.toLowerCase() === (m[2] || '').toLowerCase());
      return { num: m[1], unit: matchedUnit || units[0] };
    }
    return { num: '', unit: units[0] };
  }

  const parsed = parse(value);
  const [num, setNum] = useState(parsed.num);
  const [unit, setUnit] = useState(parsed.unit);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = parse(value);
    setNum(p.num);
    setUnit(p.unit);
  }, [value]);

  function validate(raw: string): string {
    if (raw === '') return '';
    const n = parseFloat(raw);
    if (isNaN(n)) return 'Must be a number';
    if (n < 0) return 'Must be 0 or greater';
    return '';
  }

  function handleNumChange(raw: string) {
    const err = validate(raw);
    setError(err);
    setNum(raw);
    if (!err) onChange(raw.trim() ? `${raw} ${unit}` : '');
  }

  const borderC = error ? 'var(--danger)' : 'var(--border)';

  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
      </label>
      <div style={{ display: 'flex' }}>
        <input
          type="number" min="0" step="any" value={num}
          onChange={e => handleNumChange(e.target.value)}
          placeholder={placeholder || '0'}
          style={{
            flex: 1, minWidth: 0, padding: '8px 10px',
            background: 'var(--surface-2)', border: `1px solid ${borderC}`,
            borderRadius: '6px 0 0 6px', color: 'var(--text-1)', fontSize: 13, outline: 'none',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = error ? 'var(--danger)' : 'var(--primary)')}
          onBlur={e => (e.currentTarget.style.borderColor = borderC)}
        />
        <select
          value={unit}
          onChange={e => { setUnit(e.target.value); if (!error && num.trim()) onChange(`${num} ${e.target.value}`); }}
          style={{
            padding: '8px 8px', background: 'var(--surface-3)',
            border: `1px solid ${borderC}`, borderLeft: 'none',
            borderRadius: '0 6px 6px 0', color: 'var(--text-1)',
            fontSize: 12, outline: 'none', cursor: 'pointer', flexShrink: 0,
          }}
        >
          {units.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      {error && (
        <p style={{ fontSize: 11, color: 'var(--danger)', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span className="icon" style={{ fontSize: 13 }}>error_outline</span>{error}
        </p>
      )}
    </div>
  );
}

// ── StorageInput — number + capacity unit + drive type ────────────────────────
// Stores value as e.g. "512 GB NVMe SSD" or "1 TB HDD" or "512 GB"

function parseStorage(v: string) {
  const m = (v || '').trim().match(/^(\d+(?:\.\d+)?)\s+(GB|TB|MB)\s*(.*)$/i);
  if (m) {
    const unit = STORAGE_UNITS.find(u => u.toLowerCase() === m[2].toLowerCase()) || 'GB';
    return { num: m[1], unit, driveType: m[3].trim() };
  }
  return { num: '', unit: 'GB', driveType: '' };
}

export function StorageInput({
  label, value, onChange, optional = false, placeholder = '0',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  placeholder?: string;
}) {
  const parsed = parseStorage(value);
  const [num, setNum] = useState(parsed.num);
  const [unit, setUnit] = useState(parsed.unit);
  const [driveType, setDriveType] = useState(parsed.driveType);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = parseStorage(value);
    setNum(p.num);
    setUnit(p.unit);
    setDriveType(p.driveType);
  }, [value]);

  function emit(n: string, u: string, t: string) {
    if (!n.trim()) { onChange(''); return; }
    onChange(t ? `${n} ${u} ${t}` : `${n} ${u}`);
  }

  function handleNumChange(raw: string) {
    const n = parseFloat(raw);
    const err = raw !== '' && (isNaN(n) || n < 0) ? 'Must be a positive number' : '';
    setError(err);
    setNum(raw);
    if (!err) emit(raw, unit, driveType);
  }

  const borderC = error ? 'var(--danger)' : 'var(--border)';
  const labelColor = optional ? 'var(--text-3)' : 'var(--text-2)';

  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: labelColor, marginBottom: 4 }}>
        {label}
        {optional && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: 'var(--text-3)', background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 4 }}>optional</span>}
      </label>
      <div style={{ display: 'flex' }}>
        {/* Capacity number */}
        <input
          type="number" min="0" step="any" value={num}
          onChange={e => handleNumChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, minWidth: 0, padding: '8px 10px',
            background: 'var(--surface-2)', border: `1px solid ${borderC}`,
            borderRadius: '6px 0 0 6px', color: 'var(--text-1)', fontSize: 13, outline: 'none',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = error ? 'var(--danger)' : 'var(--primary)')}
          onBlur={e => (e.currentTarget.style.borderColor = borderC)}
        />
        {/* Capacity unit: GB / TB / MB */}
        <select
          value={unit}
          onChange={e => { setUnit(e.target.value); emit(num, e.target.value, driveType); }}
          style={{ padding: '8px 6px', background: 'var(--surface-3)', border: `1px solid ${borderC}`, borderLeft: 'none', color: 'var(--text-1)', fontSize: 12, outline: 'none', cursor: 'pointer' }}
        >
          {STORAGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        {/* Drive type: NVMe SSD / SSD / HDD / … */}
        <select
          value={driveType}
          onChange={e => { setDriveType(e.target.value); emit(num, unit, e.target.value); }}
          style={{
            padding: '8px 6px', background: 'var(--surface-3)',
            border: `1px solid ${borderC}`, borderLeft: 'none',
            borderRadius: '0 6px 6px 0',
            color: driveType ? 'var(--text-1)' : 'var(--text-3)',
            fontSize: 12, outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">— Type —</option>
          {DRIVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {error && (
        <p style={{ fontSize: 11, color: 'var(--danger)', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span className="icon" style={{ fontSize: 13 }}>error_outline</span>{error}
        </p>
      )}
    </div>
  );
}

export const RAM_UNITS     = ['GB', 'MB'];
export const STORAGE_UNITS = ['GB', 'TB', 'MB'];
export const SCREEN_UNITS  = ['in', 'cm'];
export const DRIVE_TYPES   = ['NVMe SSD', 'SSD', 'HDD', 'eMMC', 'Flash', 'NVMe'];
