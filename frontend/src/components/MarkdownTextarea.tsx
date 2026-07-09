import { useRef, type KeyboardEvent } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  name?: string
}

const KBD: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: 10, padding: '1px 5px',
  background: 'var(--surface-3)', border: '1px solid var(--border)',
  borderRadius: 3, marginRight: 3,
}

const FOCUSABLE = [
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function shiftFocus(from: HTMLElement, direction: 1 | -1) {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(el => el.offsetParent !== null) // exclude hidden elements
  const idx = all.indexOf(from)
  if (idx === -1) return
  const target = all[idx + direction]
  if (target) target.focus()
}

export function MarkdownTextarea({ value, onChange, placeholder, rows = 6, name }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function wrapSel(before: string, after: string) {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const sel = value.slice(s, e)
    onChange(value.slice(0, s) + before + sel + after + value.slice(e))
    requestAnimationFrame(() => {
      el.focus()
      const newCursor = sel ? e + before.length : s + before.length
      el.setSelectionRange(sel ? s + before.length : newCursor, newCursor)
    })
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); wrapSel('**', '**'); return }
      if (e.key === 'i') { e.preventDefault(); wrapSel('*', '*'); return }
      if (e.key === 'Tab') {
        e.preventDefault()
        if (ref.current) shiftFocus(ref.current, e.shiftKey ? -1 : 1)
        return
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const el = ref.current!
      const s = el.selectionStart
      const next = value.slice(0, s) + '  ' + value.slice(el.selectionEnd)
      onChange(next)
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
      return
    }

    if (e.key === 'Enter') {
      const el = ref.current!
      const s = el.selectionStart
      const lineStart = value.lastIndexOf('\n', s - 1) + 1
      const line = value.slice(lineStart, s)
      const m = line.match(/^(\s*[-*]\s)/)
      if (!m) return
      e.preventDefault()
      const prefix = m[1]
      // Empty bullet line → break out of list
      if (line.trim() === prefix.trimEnd()) {
        const next = value.slice(0, lineStart) + '\n' + value.slice(el.selectionEnd)
        onChange(next)
        requestAnimationFrame(() => el.setSelectionRange(lineStart + 1, lineStart + 1))
      } else {
        const ins = '\n' + prefix
        const next = value.slice(0, s) + ins + value.slice(el.selectionEnd)
        onChange(next)
        requestAnimationFrame(() => el.setSelectionRange(s + ins.length, s + ins.length))
      }
    }
  }

  return (
    <div>
      <textarea
        ref={ref}
        name={name}
        value={value}
        onChange={ev => onChange(ev.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder ?? 'Add notes…  Supports: - bullet lists, **bold**, *italic*'}
        rows={rows}
        className="md-textarea"
        style={{ fontFamily: "'Roboto Mono', 'Courier New', monospace", fontSize: 12.5, lineHeight: 1.65, resize: 'vertical' }}
        spellCheck
      />
      <div style={{ marginTop: 5, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {([['Ctrl+B', 'bold'], ['Ctrl+I', 'italic'], ['- item', 'bullet list'], ['Tab', 'indent'], ['Ctrl+Tab', 'next field']] as const).map(([k, v]) => (
          <span key={k} style={{ fontSize: 11, color: 'var(--text-3)' }}>
            <kbd style={KBD}>{k}</kbd>{v}
          </span>
        ))}
      </div>
    </div>
  )
}
