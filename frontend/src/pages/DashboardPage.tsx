import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadialBarChart, RadialBar,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardStats {
  total_assets: number;
  total_employees: number;
  assigned_count: number;
  unassigned_count: number;
  pending_sync: number;
  by_status: Record<string, number>;
  by_type: { type: string; count: number }[];
  by_condition: Record<string, number>;
  top_assignees: { name: string; email: string; count: number }[];
  recent_activity: {
    asset_id: string; asset_label: string; action: string;
    employee: string; timestamp: string;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  'Active': '#1a73e8', 'In Stock': '#188038', 'Missing': '#d93025',
  'Retired': '#80868b', 'Unassigned': '#f29900',
};
const COND_COLORS: Record<string, string> = {
  'New': '#1a73e8', 'Excellent': '#188038', 'Good': '#34a853',
  'Fair': '#f29900', 'Poor': '#e37400', 'Damaged': '#d93025',
};
const TYPE_COLORS = ['#1a73e8','#188038','#9c27b0','#f29900','#00bcd4','#ff5722','#607d8b','#e91e63','#4caf50','#ff9800','#795548','#009688'];
const FALLBACK = ['#1a73e8','#188038','#f29900','#d93025','#9c27b0','#00bcd4','#ff5722','#607d8b'];

function formatTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function browse(nav: ReturnType<typeof useNavigate>, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  nav(qs ? `/?${qs}` : '/');
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color, onClick, accent }: {
  icon: string; label: string; value: number | string;
  sub?: string; color?: string; onClick?: () => void; accent?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div className="md-card" onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
        cursor: onClick ? 'pointer' : 'default', position: 'relative', overflow: 'hidden',
        borderLeft: accent ? `4px solid ${accent}` : undefined,
        transition: 'box-shadow .15s, transform .15s',
        boxShadow: hov && onClick ? 'var(--shadow-3)' : 'var(--shadow-1)',
        transform: hov && onClick ? 'translateY(-1px)' : 'none',
      }}>
      {color && <div style={{ position: 'absolute', top: 0, right: 0, width: 70, height: '100%', background: `linear-gradient(135deg, transparent 40%, ${color}12 100%)`, pointerEvents: 'none' }} />}
      <div style={{ width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: color ? `${color}1a` : 'var(--primary-bg)', flexShrink: 0 }}>
        <span className="icon" style={{ fontSize: 21, color: color || 'var(--primary)' }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-1)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
      </div>
      {onClick && <span className="icon icon-sm" style={{ color: 'var(--text-3)', opacity: hov ? 1 : 0, transition: 'opacity .15s', flexShrink: 0 }}>chevron_right</span>}
    </div>
  );
}

function SectionHeader({ icon, title, action, onAction }: { icon: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span className="icon" style={{ color: 'var(--primary)', fontSize: 18 }}>{icon}</span>
      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: 14, color: 'var(--text-1)', flex: 1 }}>{title}</span>
      {action && onAction && (
        <button onClick={onAction} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--primary)', padding: '2px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
          {action}<span className="icon icon-sm" style={{ fontSize: 14 }}>arrow_forward</span>
        </button>
      )}
    </div>
  );
}

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, boxShadow: 'var(--shadow-2)' }}>
      <div style={{ fontWeight: 600, color: p.payload.fill }}>{p.name}</div>
      <div>{p.value} assets · {p.payload.pct}%</div>
    </div>
  );
};

const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, boxShadow: 'var(--shadow-2)' }}>
      <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 2 }}>{label}</div>
      <div style={{ color: payload[0].fill }}>{payload[0].value} assets</div>
      <div style={{ fontSize: 11, color: 'var(--primary)', marginTop: 2 }}>Click to filter ›</div>
    </div>
  );
};

function ClickableLegend({ items, filterKey, nav }: { items: { name: string; value: number; fill: string; pct: number }[]; filterKey: 'status' | 'type'; nav: ReturnType<typeof useNavigate> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
      {items.map(item => (
        <div key={item.name} onClick={() => browse(nav, { [filterKey]: item.name })}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderRadius: 6, padding: '4px 6px', transition: 'background .12s' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.fill, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-1)', flex: 1 }}>{item.name}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{item.value}</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)', width: 28, textAlign: 'right' }}>{item.pct}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const nav = useNavigate();

  function load() {
    setLoading(true);
    fetch('/api/stats').then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, color: 'var(--text-2)' }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      Loading dashboard…
    </div>
  );
  if (error) return (
    <div style={{ textAlign: 'center', padding: 48, color: 'var(--danger)' }}>
      <span className="icon" style={{ fontSize: 36 }}>error</span>
      <p style={{ marginTop: 12 }}>{error}</p>
      <button onClick={load} className="md-btn md-btn-primary" style={{ marginTop: 16 }}>Retry</button>
    </div>
  );
  if (!stats) return null;

  const assignRate   = stats.total_assets > 0 ? Math.round((stats.assigned_count / stats.total_assets) * 100) : 0;
  const inStockCount = stats.by_status['In Stock']  ?? 0;
  const missingCount = stats.by_status['Missing']   ?? 0;
  const retiredCount = stats.by_status['Retired']   ?? 0;

  const statusPieData = Object.entries(stats.by_status).filter(([, v]) => v > 0).map(([name, value], i) => ({
    name, value, pct: stats.total_assets > 0 ? Math.round((value / stats.total_assets) * 100) : 0,
    fill: STATUS_COLORS[name] || FALLBACK[i % FALLBACK.length],
  }));

  const condTotal = Object.values(stats.by_condition).reduce((a, b) => a + b, 0);
  const condPieData = Object.entries(stats.by_condition).filter(([, v]) => v > 0).map(([name, value], i) => ({
    name, value, pct: condTotal > 0 ? Math.round((value / condTotal) * 100) : 0,
    fill: COND_COLORS[name] || FALLBACK[i % FALLBACK.length],
  }));

  const typeBarData = stats.by_type.slice(0, 12).map((d, i) => ({ name: d.type, Assets: d.count, fill: TYPE_COLORS[i % TYPE_COLORS.length] }));
  const radialData  = [{ value: assignRate }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0 }}>Dashboard</h1>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 2 }}>
            {stats.total_assets} assets · {stats.total_employees} employees ·&nbsp;
            <span style={{ color: 'var(--text-3)' }}>click cards &amp; charts to filter</span>
          </p>
        </div>
        <button onClick={load} className="md-btn" style={{ gap: 6, fontSize: 13, color: 'var(--primary)', background: 'var(--primary-bg)', border: 'none' }}>
          <span className="icon icon-sm">refresh</span>Refresh
        </button>
      </div>

      {/* KPI row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard icon="inventory_2"  label="Total Assets"   value={stats.total_assets}    accent="#1a73e8" onClick={() => browse(nav, {})} />
        <KpiCard icon="check_circle" label="Assigned"       value={stats.assigned_count}  accent="#188038" color="#188038" sub={`${assignRate}% utilisation`} onClick={() => browse(nav, { status: 'Active' })} />
        <KpiCard icon="inbox"        label="In Stock"       value={inStockCount}           accent="#1a73e8" color="#1a73e8" sub="Ready to assign"              onClick={() => browse(nav, { status: 'In Stock' })} />
        <KpiCard icon="group"        label="Employees"      value={stats.total_employees}  accent="#9c27b0" color="#9c27b0" sub={`${stats.top_assignees.length} with assets`} onClick={() => nav('/employees')} />
      </div>

      {/* KPI row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <KpiCard icon="report_problem" label="Missing"      value={missingCount}  accent="#d93025" color="#d93025" onClick={() => browse(nav, { status: 'Missing' })} />
        <KpiCard icon="archive"        label="Retired"      value={retiredCount}  accent="#80868b" color="#80868b" onClick={() => browse(nav, { status: 'Retired' })} />
        <KpiCard icon="cloud_upload"   label="Pending Sync" value={stats.pending_sync} sub="Not yet in Excel"
          accent={stats.pending_sync > 0 ? '#f29900' : '#188038'}
          color={stats.pending_sync  > 0 ? '#f29900' : '#188038'} />

        {/* Utilisation radial */}
        <div className="md-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: '4px solid #1a73e8' }}>
          <div style={{ width: 58, height: 58, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="55%" outerRadius="90%"
                startAngle={90} endAngle={90 - (360 * assignRate / 100)} data={radialData}>
                <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'var(--surface-2)' }}>
                  <Cell fill="#1a73e8" />
                </RadialBar>
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-1)', lineHeight: 1.1 }}>{assignRate}%</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Fleet Utilisation</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{stats.assigned_count}/{stats.total_assets} in use</div>
          </div>
        </div>
      </div>

      {/* Donut charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="md-card" style={{ padding: 18 }}>
          <SectionHeader icon="donut_large" title="Status Distribution" action="Browse" onAction={() => browse(nav, {})} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 148, height: 148, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={66} paddingAngle={3} dataKey="value"
                    onClick={(d) => d?.name && browse(nav, { status: String(d.name) })}>
                    {statusPieData.map((e, i) => <Cell key={i} fill={e.fill} style={{ cursor: 'pointer' }} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ClickableLegend items={statusPieData} filterKey="status" nav={nav} />
          </div>
        </div>

        <div className="md-card" style={{ padding: 18 }}>
          <SectionHeader icon="health_and_safety" title="Condition Breakdown" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 148, height: 148, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={condPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={66} paddingAngle={3} dataKey="value">
                    {condPieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ClickableLegend items={condPieData} filterKey="type" nav={nav} />
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="md-card" style={{ padding: 18 }}>
        <SectionHeader icon="bar_chart" title="Assets by Type" action="Browse all" onAction={() => browse(nav, {})} />
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={typeBarData} margin={{ top: 4, right: 12, left: -14, bottom: 0 }} barCategoryGap="26%"
              onClick={(d) => { if (d?.activeLabel) browse(nav, { type: String(d.activeLabel) }); }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--primary-bg)' }} />
              <Bar dataKey="Assets" radius={[5, 5, 0, 0]} style={{ cursor: 'pointer' }}>
                {typeBarData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {stats.by_type.slice(0, 12).map((t, i) => (
            <button key={t.type} onClick={() => browse(nav, { type: t.type })} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
              borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: `${TYPE_COLORS[i % TYPE_COLORS.length]}18`, color: TYPE_COLORS[i % TYPE_COLORS.length],
            }}>
              <b>{t.count}</b>{t.type}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Top Assignees */}
        <div className="md-card" style={{ padding: 18 }}>
          <SectionHeader icon="person_pin" title="Top Assignees" action="All people" onAction={() => nav('/employees')} />
          {stats.top_assignees.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: 13 }}>No assets assigned yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stats.top_assignees.map((a, i) => {
                const pct = Math.round((a.count / (stats.top_assignees[0]?.count || 1)) * 100);
                const c   = TYPE_COLORS[i % TYPE_COLORS.length];
                return (
                  <div key={a.email} style={{ padding: '8px 0', borderBottom: i < stats.top_assignees.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <button onClick={() => nav(`/employee/${encodeURIComponent(a.email)}`)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 500, color: 'var(--primary)', textAlign: 'left' }}>
                        {a.name}
                      </button>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: c, padding: '1px 7px', borderRadius: 10 }}>{a.count}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 4, transition: 'width .5s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="md-card" style={{ padding: 18 }}>
          <SectionHeader icon="history" title="Recent Activity" />
          {stats.recent_activity.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: 13 }}>No activity yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stats.recent_activity.map((a, i) => {
                const isA = a.action === 'Assign', isR = a.action === 'Return';
                const ic  = isA ? 'person_add' : isR ? 'assignment_return' : 'swap_horiz';
                const fg  = isA ? 'var(--success)' : isR ? '#b06000' : 'var(--primary)';
                const bg  = isA ? 'var(--success-bg)' : isR ? 'var(--warn-bg)' : 'var(--primary-bg)';
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < stats.recent_activity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg }}>
                      <span className="icon icon-sm" style={{ color: fg, fontSize: 14 }}>{ic}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <button onClick={() => nav(`/asset/${encodeURIComponent(a.asset_id)}`)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                          {a.asset_label || a.asset_id}
                        </button>
                        <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 6, fontWeight: 600, background: bg, color: fg }}>{a.action}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.employee}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{formatTime(a.timestamp)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
