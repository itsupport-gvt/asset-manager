import { useState, useEffect } from 'react';

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
    if (!Number.isFinite(n)) return 'Invalid value';
    return '';
  }

  function handleNumChange(raw: string) {
    const err = validate(raw);
    setError(err);
    setNum(raw);
    if (!err) {
      onChange(raw.trim() ? `${raw} ${unit}` : '');
    }
  }

  function handleUnitChange(u: string) {
    setUnit(u);
    if (!error && num.trim()) {
      onChange(`${num} ${u}`);
    }
  }

  const borderColor = error ? 'var(--danger)' : 'var(--border)';
  const focusBorderColor = error ? 'var(--danger)' : 'var(--primary)';

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
            background: 'var(--surface-2)', border: `1px solid ${borderColor}`,
            borderRadius: '6px 0 0 6px', color: 'var(--text-1)',
            fontSize: 13, outline: 'none',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = focusBorderColor)}
          onBlur={e => (e.currentTarget.style.borderColor = borderColor)}
        />
        <select
          value={unit}
          onChange={e => handleUnitChange(e.target.value)}
          style={{
            padding: '8px 8px', background: 'var(--surface-3)',
            border: `1px solid ${borderColor}`, borderLeft: 'none',
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

export const RAM_UNITS     = ['GB', 'MB'];
export const STORAGE_UNITS = ['GB', 'TB', 'MB'];
export const SCREEN_UNITS  = ['in', 'cm'];
