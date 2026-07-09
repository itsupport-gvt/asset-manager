import type { ReactNode } from 'react'

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0, key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] != null) nodes.push(<strong key={key++}>{m[1]}</strong>)
    else               nodes.push(<em      key={key++}>{m[2]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function MarkdownView({ content }: { content: string }) {
  if (!content?.trim()) return null

  const lines = content.split('\n')
  const nodes: ReactNode[] = []
  let bullets: string[] = []
  let k = 0

  function flushBullets() {
    if (!bullets.length) return
    nodes.push(
      <ul key={k++} style={{ margin: '0 0 8px', paddingLeft: 20 }}>
        {bullets.map((b, i) => <li key={i} style={{ marginBottom: 3, lineHeight: 1.6 }}>{parseInline(b)}</li>)}
      </ul>
    )
    bullets = []
  }

  for (const line of lines) {
    const bm = line.match(/^\s*[-*]\s+(.+)/)
    if (bm) {
      bullets.push(bm[1])
    } else if (!line.trim()) {
      flushBullets()
    } else {
      flushBullets()
      nodes.push(<p key={k++} style={{ margin: '0 0 6px', lineHeight: 1.65 }}>{parseInline(line)}</p>)
    }
  }
  flushBullets()

  return <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{nodes}</div>
}
