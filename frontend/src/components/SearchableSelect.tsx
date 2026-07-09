import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from 'react'

export interface SearchableOption {
  value:     string
  label:     string
  sublabel?: string
}

interface Props {
  value:        string
  onChange:     (value: string) => void
  options:      SearchableOption[]
  placeholder?: string
  disabled?:    boolean
  allowClear?:  boolean
  /** Show a small affordance even when no options match (e.g. "No tenants"). */
  emptyLabel?:  string
  /** Forwarded to inner input for accessibility / form integration. */
  name?:        string
  required?:    boolean
}

/**
 * Combobox: native-select look but with type-to-filter.
 * - Click or focus opens the dropdown
 * - Type to filter (matches label or sublabel, case-insensitive)
 * - ArrowUp/Down navigates, Enter/Tab selects, Esc closes
 * - Click outside closes
 */
export function SearchableSelect({
  value, onChange, options, placeholder = 'Select…',
  disabled = false, allowClear = false, emptyLabel = 'No matches',
  name, required,
}: Props) {
  const [open,   setOpen]   = useState(false)
  const [query,  setQuery]  = useState('')
  const [active, setActive] = useState(0)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => options.find(o => o.value === value) ?? null,
    [options, value],
  )

  // When closed, the input shows the selected label; when open, the user's query.
  const displayValue = open ? query : (selected?.label ?? '')

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel ?? '').toLowerCase().includes(q),
    )
  }, [options, query])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Keep the active option in view when navigating with the keyboard
  useEffect(() => {
    if (!open || !listRef.current) return
    const node = listRef.current.children[active] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function pick(opt: SearchableOption) {
    onChange(opt.value)
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setQuery('')
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault()
        setOpen(true)
        setActive(0)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[active]) pick(filtered[active])
    } else if (e.key === 'Tab') {
      // Tab always closes without selecting — let focus move to the next field
      setOpen(false); setQuery('')
    } else if (e.key === 'Escape') {
      setOpen(false); setQuery('')
    }
  }

  function handleFocus() {
    if (disabled) return
    // Don't auto-open on focus — only open on click or keyboard (ArrowDown/Enter).
    // This prevents Tab-through from accidentally activating the dropdown.
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const showClear = allowClear && !!value && !disabled

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        name={name}
        required={required}
        disabled={disabled}
        value={displayValue}
        placeholder={placeholder}
        className="md-input"
        style={{ paddingRight: showClear ? 60 : 36, cursor: disabled ? 'not-allowed' : 'text' }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0) }}
        onFocus={handleFocus}
        onClick={() => { if (!disabled) { setOpen(true); setActive(0) } }}
        onKeyDown={handleKey}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />

      {/* Trailing icons: clear + chevron */}
      <div style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', alignItems: 'center', gap: 2, pointerEvents: 'none',
      }}>
        {showClear && (
          <button
            type="button"
            onClick={clear}
            tabIndex={-1}
            title="Clear"
            style={{
              pointerEvents: 'auto',
              background: 'transparent', border: 'none', cursor: 'pointer',
              width: 24, height: 24, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-3)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent';     e.currentTarget.style.color = 'var(--text-3)' }}
          >
            <span className="icon icon-sm">close</span>
          </button>
        )}
        <span className="icon icon-sm" style={{ color: 'var(--text-3)', transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          expand_more
        </span>
      </div>

      {open && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: 'var(--shadow-2)',
            maxHeight: 280, overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-3)' }}>
              {emptyLabel}
            </div>
          ) : (
            filtered.map((o, i) => {
              const isActive   = i === active
              const isSelected = o.value === value
              return (
                <div
                  key={o.value}
                  onMouseDown={() => pick(o)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    background: isActive ? 'var(--surface-2)' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14,
                      color: 'var(--text-1)',
                      fontWeight: isSelected ? 500 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {o.label}
                    </div>
                    {o.sublabel && (
                      <div style={{
                        fontSize: 12, color: 'var(--text-3)', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{o.sublabel}</div>
                    )}
                  </div>
                  {isSelected && (
                    <span className="icon icon-sm" style={{ color: 'var(--primary)', flexShrink: 0 }}>check</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
