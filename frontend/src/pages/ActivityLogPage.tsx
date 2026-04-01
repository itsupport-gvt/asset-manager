import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { ActivityLogItem, ActivityLogPage } from '../lib/types';

const PAGE_SIZE = 50;

const ACTION_OPTIONS = ['', 'Assign', 'Return', 'Create', 'Update', 'Swap', 'Bulk Return'];

// ── helpers ───────────────────────────────────────────────────────────────────

function actionStyle(action: string): { bg: string; color: string } {
  switch (action.toLowerCase()) {
    case 'assign':      return { bg: 'var(--success-bg, rgba(76,175,80,.12))',     color: 'var(--success, #2e7d32)' };
    case 'return':      return { bg: 'rgba(255,152,0,.12)',                         color: '#b06000' };
    case 'create':      return { bg: 'var(--primary-bg)',                           color: 'var(--primary)' };
    case 'update':      return { bg: 'rgba(156,39,176,.12)',                        color: '#7b1fa2' };
    case 'swap':        return { bg: 'rgba(33,150,243,.12)',                        color: '#1565c0' };
    case 'bulk return': return { bg: 'rgba(255,152,0,.12)',                         color: '#b06000' };
    default:            return { bg: 'var(--surface-2)',                            color: 'var(--text-2)' };
  }
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function triggerDownload(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.click();
}

interface ChangedField { field: string; old: string; new: string; }

function parseChangedFields(raw: string): ChangedField[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as ChangedField[]; } catch { return []; }
}

// ── sub-components ────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const s = actionStyle(action);
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px', borderRadius: 10, fontSize: 11,
      fontWeight: 600, background: s.bg, color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {action}
    </span>
  );
}

function StatusFlow({ from, to }: { from: string; to: string }) {
  if (!from && !to) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
      {from && (
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-3)' }}>
          {from}
        </span>
      )}
      {from && to && <span className="icon" style={{ fontSize: 12, color: 'var(--text-3)' }}>arrow_forward</span>}
      {to && (
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--primary-bg)', color: 'var(--primary)', fontWeight: 600 }}>
          {to}
        </span>
      )}
    </div>
  );
}

function ChangedFieldsDetail({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  const fields = parseChangedFields(raw);
  if (!fields.length) return null;

  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 11, color: '#7b1fa2', display: 'flex', alignItems: 'center', gap: 2,
        }}
      >
        <span className="icon" style={{ fontSize: 13 }}>{open ? 'expand_less' : 'expand_more'}</span>
        {fields.length} field{fields.length !== 1 ? 's' : ''} changed
      </button>
      {open && (
        <div style={{
          marginTop: 5, padding: '8px 10px',
          background: 'rgba(156,39,176,.05)',
          border: '1px solid rgba(156,39,176,.2)',
          borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {fields.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11 }}>
              <span style={{ minWidth: 100, fontWeight: 600, color: 'var(--text-2)', textTransform: 'capitalize', flexShrink: 0 }}>
                {f.field.replace(/_/g, ' ')}
              </span>
              <span style={{ color: 'var(--text-3)', wordBreak: 'break-all' }}>
                {f.old || '(empty)'}
              </span>
              <span className="icon" style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>arrow_forward</span>
              <span style={{ color: 'var(--primary)', fontWeight: 500, wordBreak: 'break-all' }}>
                {f.new || '(empty)'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 16 }}>
      <button className="md-btn" onClick={() => onPage(1)} disabled={page === 1}
        style={{ padding: '6px 10px', fontSize: 12, minWidth: 0 }}>
        <span className="icon icon-sm">first_page</span>
      </button>
      <button className="md-btn" onClick={() => onPage(page - 1)} disabled={page === 1}
        style={{ padding: '6px 10px', fontSize: 12, minWidth: 0 }}>
        <span className="icon icon-sm">chevron_left</span>
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-2)', padding: '0 12px', whiteSpace: 'nowrap' }}>
        Page {page} of {pages}
      </span>
      <button className="md-btn" onClick={() => onPage(page + 1)} disabled={page === pages}
        style={{ padding: '6px 10px', fontSize: 12, minWidth: 0 }}>
        <span className="icon icon-sm">chevron_right</span>
      </button>
      <button className="md-btn" onClick={() => onPage(pages)} disabled={page === pages}
        style={{ padding: '6px 10px', fontSize: 12, minWidth: 0 }}>
        <span className="icon icon-sm">last_page</span>
      </button>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export function ActivityLogPage() {
  const nav = useNavigate();

  // filters
  const [filterQ,        setFilterQ]        = useState('');
  const [filterAction,   setFilterAction]   = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterAssetId,  setFilterAssetId]  = useState('');
  const [filterFrom,     setFilterFrom]     = useState('');
  const [filterTo,       setFilterTo]       = useState('');

  // data
  const [data,    setData]    = useState<ActivityLogPage | null>(null);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getActivity({
        page:      targetPage,
        page_size: PAGE_SIZE,
        action:    filterAction,
        employee:  filterEmployee,
        asset_id:  filterAssetId,
        from_date: filterFrom,
        to_date:   filterTo,
        q:         filterQ,
      });
      setData(result);
      setPage(targetPage);
    } catch (e: any) {
      setError(e.message || 'Failed to load activity log');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterEmployee, filterAssetId, filterFrom, filterTo, filterQ]);

  useEffect(() => { load(1); }, []);  // load on mount

  function handleSearch() { load(1); }

  function handleClear() {
    setFilterQ(''); setFilterAction(''); setFilterEmployee('');
    setFilterAssetId(''); setFilterFrom(''); setFilterTo('');
    setTimeout(() => load(1), 0);
  }

  function handleExport() {
    triggerDownload(api.exportActivityCsvUrl({
      action:    filterAction,
      employee:  filterEmployee,
      asset_id:  filterAssetId,
      from_date: filterFrom,
      to_date:   filterTo,
      q:         filterQ,
    }));
  }

  const hasFilters = filterQ || filterAction || filterEmployee || filterAssetId || filterFrom || filterTo;

  const inputStyle: React.CSSProperties = {
    height: 36, fontSize: 13, padding: '0 10px',
    border: '1px solid var(--border)', borderRadius: 7,
    background: 'var(--surface)', color: 'var(--text-1)',
    outline: 'none', flex: 1, minWidth: 0,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, color: 'var(--text-3)',
    marginBottom: 3, display: 'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0 }}>
            Activity Log
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>
            Full audit trail — assignments, returns, creates, updates, and field-level changes.
          </p>
        </div>
        <button
          onClick={handleExport}
          className="md-btn"
          style={{ gap: 6, fontSize: 13, padding: '8px 16px', flexShrink: 0 }}
        >
          <span className="icon icon-sm">download</span>
          Export CSV
        </button>
      </div>

      {/* Filter card */}
      <div className="md-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <span className="icon icon-sm" style={{ color: 'var(--primary)' }}>filter_list</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: "'Google Sans', sans-serif" }}>Filters</span>
          {hasFilters && (
            <button
              onClick={handleClear}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span className="icon icon-sm">close</span>Clear all
            </button>
          )}
        </div>

        {/* Row 1 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <label style={labelStyle}>Search</label>
            <input
              style={inputStyle}
              placeholder="Asset ID, employee, notes, type…"
              value={filterQ}
              onChange={e => setFilterQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={labelStyle}>Action</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
            >
              {ACTION_OPTIONS.map(a => (
                <option key={a} value={a}>{a || 'All actions'}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 2, minWidth: 160 }}>
            <label style={labelStyle}>Employee (email / name)</label>
            <input
              style={inputStyle}
              placeholder="e.g. john@company.com"
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={labelStyle}>Asset ID</label>
            <input
              style={inputStyle}
              placeholder="e.g. LT-2312-0001"
              value={filterAssetId}
              onChange={e => setFilterAssetId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
        </div>

        {/* Row 2 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={labelStyle}>From date</label>
            <input type="date" style={inputStyle} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={labelStyle}>To date</label>
            <input type="date" style={inputStyle} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          <button
            onClick={handleSearch}
            className="md-btn md-btn-primary"
            style={{ height: 36, padding: '0 20px', fontSize: 13, flexShrink: 0 }}
          >
            <span className="icon icon-sm">search</span>
            Search
          </button>
        </div>
      </div>

      {/* Results info */}
      {data && (
        <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading
            ? <><div style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Loading…</>
            : <>Showing {Math.min((page - 1) * PAGE_SIZE + 1, data.total)}–{Math.min(page * PAGE_SIZE, data.total)} of <strong style={{ color: 'var(--text-1)' }}>{data.total}</strong> entries</>
          }
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
          <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>{error}
        </div>
      )}

      {/* Table */}
      {(!loading || data) && (
        <div className="md-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Timestamp', 'Action', 'Asset', 'Employee', 'Changes & Notes'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left', fontSize: 11,
                      fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap',
                      borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data && data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
                      <span className="icon" style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>history</span>
                      No activity found.{hasFilters ? ' Try clearing filters.' : ''}
                    </td>
                  </tr>
                )}
                {data?.items.map((item: ActivityLogItem) => (
                  <tr key={item.id} style={{ borderTop: '1px solid var(--border)', transition: 'background .1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                    {/* Timestamp */}
                    <td style={{ padding: '9px 14px', color: 'var(--text-3)', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {fmtTime(item.timestamp)}
                    </td>

                    {/* Action badge + status flow */}
                    <td style={{ padding: '9px 14px' }}>
                      <ActionBadge action={item.action} />
                      <StatusFlow from={item.old_status} to={item.new_status} />
                    </td>

                    {/* Asset: type chip + id + label */}
                    <td style={{ padding: '9px 14px' }}>
                      {item.asset_type && (
                        <div style={{
                          display: 'inline-block', fontSize: 10, padding: '1px 6px',
                          borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-3)',
                          fontWeight: 600, marginBottom: 3,
                        }}>
                          {item.asset_type}
                        </div>
                      )}
                      <div>
                        <button
                          onClick={() => nav(`/asset/${encodeURIComponent(item.asset_id)}`)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: 0, color: 'var(--primary)', fontFamily: 'monospace',
                            fontSize: 12, fontWeight: 600,
                          }}
                        >
                          {item.asset_id}
                        </button>
                      </div>
                      {item.asset_label && item.asset_label !== item.asset_id && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{item.asset_label}</div>
                      )}
                    </td>

                    {/* Employee */}
                    <td style={{ padding: '9px 14px', color: 'var(--text-1)' }}>
                      <div>{item.employee_name}</div>
                      {item.employee_email && item.employee_email !== item.employee_name && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.employee_email}</div>
                      )}
                    </td>

                    {/* Changes & Notes */}
                    <td style={{ padding: '9px 14px', color: 'var(--text-2)', maxWidth: 280 }}>
                      {item.notes && (
                        <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.notes}
                        </div>
                      )}
                      {item.changed_fields && (
                        <ChangedFieldsDetail raw={item.changed_fields} />
                      )}
                      {!item.notes && !item.changed_fields && (
                        <span style={{ color: 'var(--text-3)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.pages > 1 && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <Pagination page={page} pages={data.pages} onPage={p => load(p)} />
            </div>
          )}
        </div>
      )}

      {/* Initial loading state */}
      {loading && !data && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 48, color: 'var(--text-2)' }}>
          <div style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          Loading activity log…
        </div>
      )}
    </div>
  );
}
