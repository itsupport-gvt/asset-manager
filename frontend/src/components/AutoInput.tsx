import { useState, useRef, type ChangeEvent } from 'react'

interface Props {
  name: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  suggestions: string[]
  placeholder?: string
  type?: string
  required?: boolean
}

export function AutoInput({ name, value, onChange, suggestions, placeholder, type = 'text', required }: Props) {
  const [open, setOpen]     = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = value.length > 0
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 8)
    : []

  function pick(val: string) {
    const synth = { target: { name, value: val } } as ChangeEvent<HTMLInputElement>
    onChange(synth)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      pick(filtered[active] ?? filtered[0])
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Keep exactly what was typed — bypass the suggestion
      setOpen(false)
    } else if (e.key === 'Tab') {
      // Pick suggestion and stay in field; next Tab moves to next field
      e.preventDefault()
      pick(filtered[active] ?? filtered[0])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type={type}
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        className="md-input"
        onChange={e => { onChange(e); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: 'var(--shadow-2)',
          maxHeight: 240, overflowY: 'auto',
          padding: '4px 0',
        }}>
          {filtered.map((s, i) => (
            <div
              key={s}
              onMouseDown={() => pick(s)}
              style={{
                padding: '10px 14px', fontSize: 14, cursor: 'pointer',
                background: i === active ? 'var(--surface-2)' : 'transparent',
                color: 'var(--text-1)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>history</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s}</span>
              {i === active && (
                <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {(['↵', 'Tab'] as const).map(k => (
                    <span key={k} style={{
                      fontSize: 11, color: 'var(--text-3)',
                      background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4,
                      fontFamily: 'monospace',
                    }}>{k}</span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
