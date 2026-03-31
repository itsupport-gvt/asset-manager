import { useRef, useState, useEffect } from 'react';
import { useScannerContext } from '../lib/scanner';

interface Props {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string; suggestions?: string[];
}

export function ScanField({ label, value, onChange, placeholder, required, type = 'text', suggestions }: Props) {
  const listId = suggestions?.length ? `sf-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined;
  const { lastFieldScan, clearFieldScan, activeFieldId, setActiveFieldId } = useScannerContext();
  const [showPicker, setShowPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isActive = activeFieldId === label;

  useEffect(() => {
    if (lastFieldScan && lastFieldScan.mode === 'field_scan' && isActive) setShowPicker(true);
  }, [lastFieldScan, isActive]);

  const tokens: string[] = lastFieldScan && 'value' in lastFieldScan && lastFieldScan.value
    ? [lastFieldScan.value, ...(lastFieldScan.tokens || [])].filter((t, i, a) => a.indexOf(t) === i)
    : [];

  function pickToken(token: string) {
    onChange(token);
    setShowPicker(false);
    clearFieldScan();
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && showPicker && tokens.length > 0) {
      e.preventDefault();
      pickToken(tokens[0]);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', width: '100%' }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>
        {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
      </label>

      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setActiveFieldId(label)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          list={listId}
          className="md-input"
          style={{ paddingRight: 36, borderColor: isActive ? 'var(--primary)' : undefined, boxShadow: isActive ? '0 0 0 3px rgba(26,115,232,.12)' : undefined }}
        />
        {listId && <datalist id={listId}>{suggestions!.map(s => <option key={s} value={s} />)}</datalist>}

        <span
          title="This field accepts scan input"
          className="icon icon-sm"
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            color: isActive ? 'var(--primary)' : 'var(--text-3)',
            transition: 'color .2s', pointerEvents: 'none',
          }}
        >
          photo_camera
        </span>
      </div>

      {showPicker && tokens.length > 0 && (
        <div className="md-card" style={{ position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0, zIndex: 50, overflow: 'hidden', animation: 'fadeIn .2s ease' }}>
          <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 500, color: 'var(--text-2)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Tap to fill field</span>
            <button onClick={() => { setShowPicker(false); clearFieldScan(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 0, lineHeight: 1 }}>
              <span className="icon icon-sm">close</span>
            </button>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {tokens.map((t, i) => (
              <div
                key={i}
                onClick={() => pickToken(t)}
                style={{
                  padding: '10px 14px', fontSize: 13, cursor: 'pointer',
                  borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: i === 0 ? 'var(--primary-bg)' : undefined,
                  color: i === 0 ? 'var(--primary)' : 'var(--text-1)',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
                {i === 0 && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 8, flexShrink: 0, color: 'var(--primary)' }}>Best Match</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}