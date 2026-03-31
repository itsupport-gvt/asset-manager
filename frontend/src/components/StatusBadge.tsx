interface Props { status: string; }

const STATUS_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  'active':      { bg: 'var(--success-bg)', color: 'var(--success)',  icon: 'check_circle' },
  'in stock':    { bg: 'var(--primary-bg)', color: 'var(--primary)',  icon: 'inventory' },
  'unassigned':  { bg: 'var(--primary-bg)', color: 'var(--primary)',  icon: 'inventory' },
  'missing':     { bg: 'var(--danger-bg)',  color: 'var(--danger)',   icon: 'warning' },
  'archived':    { bg: 'var(--surface-2)',  color: 'var(--text-2)',   icon: 'archive' },
  'retired':     { bg: 'var(--surface-2)',  color: 'var(--text-3)',   icon: 'block' },
};

export function StatusBadge({ status }: Props) {
  const key = status.toLowerCase();
  const s = STATUS_STYLE[key] ?? { bg: 'var(--surface-2)', color: 'var(--text-2)', icon: 'help_outline' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 12,
      background: s.bg, color: s.color,
      fontSize: 12, fontWeight: 500,
    }}>
      <span style={{ fontFamily: 'Material Icons Round', fontSize: 13, lineHeight: 1 }}>{s.icon}</span>
      {status}
    </span>
  );
}
