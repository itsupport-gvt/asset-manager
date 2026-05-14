import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Employee, Asset, ActivityLogItem } from '../lib/types';
import { AssetCard } from '../components/AssetCard';

// ── Employee Recent Activity ──────────────────────────────────────────────────
const _EMP_ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  assign:       { bg: 'rgba(76,175,80,.12)',  color: '#2e7d32' },
  return:       { bg: 'rgba(255,152,0,.12)',  color: '#b06000' },
  create:       { bg: 'var(--primary-bg)',    color: 'var(--primary)' },
  update:       { bg: 'rgba(156,39,176,.12)', color: '#7b1fa2' },
  swap:         { bg: 'rgba(33,150,243,.12)', color: '#1565c0' },
  'bulk return':{ bg: 'rgba(255,152,0,.12)',  color: '#b06000' },
};
function EmployeeRecentActivity({ email }: { email: string }) {
  const nav = useNavigate();
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getActivity({ employee: email, page_size: 5 })
      .then(d => setItems(d.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email]);

  if (loading || !items.length) return null;

  return (
    <div className="md-card" style={{ padding: 24, marginTop: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span className="icon" style={{ color: 'var(--primary)', fontSize: 18 }}>history</span>
        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>Recent Activity</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, i) => {
          const s = _EMP_ACTION_COLORS[item.action.toLowerCase()] ?? { bg: 'var(--surface-2)', color: 'var(--text-2)' };
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: s.bg, color: s.color, flexShrink: 0 }}>
                {item.action}
              </span>
              <button
                onClick={() => nav(`/asset/${encodeURIComponent(item.asset_id)}`)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, padding: 0, flexShrink: 0 }}
              >
                {item.asset_id}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.asset_label && item.asset_label !== item.asset_id ? item.asset_label : ''}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                {new Date(item.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => nav(`/activity?employee=${encodeURIComponent(email)}`)}
        style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        View full activity log <span className="icon icon-sm">arrow_forward</span>
      </button>
    </div>
  );
}

const CONDITIONS = ['', 'New', 'Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];
const REASONS = ['Resignation', 'Transfer', 'Offboarding', 'Contract End', 'Other'];

// ── Bulk Return Panel ─────────────────────────────────────────────────────────
function BulkReturnPanel({
  assets, employeeEmail, employeeName, onDone, onCancel,
}: {
  assets: Asset[];
  employeeEmail: string;
  employeeName: string;
  onDone: (returnedIds: string[]) => void;
  onCancel: () => void;
}) {
  const nav = useNavigate();

  // per-asset checked + condition + notes
  const [items, setItems] = useState<Record<string, { checked: boolean; condition: string; notes: string }>>(
    () => Object.fromEntries(assets.map(a => [a.asset_id, { checked: true, condition: '', notes: '' }]))
  );
  const [reason, setReason]     = useState('Resignation');
  const [globalCond, setGlobalCond] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]     = useState<{ returned: string[]; failed: { asset_id: string; reason: string }[] } | null>(null);

  const checkedIds  = Object.entries(items).filter(([, v]) => v.checked).map(([id]) => id);
  const allChecked  = checkedIds.length === assets.length;
  const noneChecked = checkedIds.length === 0;

  function setField(id: string, field: 'checked' | 'condition' | 'notes', val: string | boolean) {
    setItems(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  }

  function applyGlobalCondition() {
    if (!globalCond) return;
    setItems(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => { if (next[id].checked) next[id] = { ...next[id], condition: globalCond }; });
      return next;
    });
  }

  async function submit() {
    if (noneChecked || submitting) return;
    setSubmitting(true);
    try {
      const payload = checkedIds.map(id => ({
        asset_id:  id,
        condition: items[id].condition,
        notes:     items[id].notes,
      }));
      const res = await api.bulkReturn(employeeEmail, { items: payload, reason });
      setResult(res);
    } catch (e: any) {
      alert(`Bulk return failed: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Result screen ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="md-card" style={{ padding: 28, borderLeft: '4px solid var(--success)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span className="icon" style={{ fontSize: 32, color: 'var(--success)' }}>check_circle</span>
          <div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--text-1)' }}>
              Bulk Return Complete
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
              {result.returned.length} asset{result.returned.length !== 1 ? 's' : ''} successfully returned from {employeeName}
            </div>
          </div>
        </div>

        {result.returned.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>RETURNED</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {result.returned.map(id => (
                <span key={id} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: 'var(--success-bg)', color: 'var(--success)', fontFamily: 'monospace', fontWeight: 600 }}>{id}</span>
              ))}
            </div>
          </div>
        )}

        {result.failed.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', marginBottom: 6 }}>FAILED</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {result.failed.map(f => (
                <div key={f.asset_id} style={{ fontSize: 12, color: 'var(--danger)' }}>{f.asset_id} — {f.reason}</div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={() => onDone(result.returned)} className="md-btn md-btn-primary" style={{ fontSize: 13 }}>
            <span className="icon icon-sm">done</span> Done
          </button>
          <button
            onClick={() => nav(`/reports?employee=${encodeURIComponent(employeeEmail)}`)}
            className="md-btn" style={{ fontSize: 13, color: 'var(--primary)', background: 'var(--primary-bg)', border: 'none' }}>
            <span className="icon icon-sm">picture_as_pdf</span> Generate Return Report
          </button>
        </div>
      </div>
    );
  }

  // ── Input screen ──────────────────────────────────────────────────────────
  return (
    <div className="md-card" style={{ padding: 0, overflow: 'hidden', borderLeft: '4px solid #d93025' }}>

      {/* Header */}
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)' }}>
        <span className="icon" style={{ fontSize: 22, color: '#d93025' }}>assignment_return</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>
            Bulk Asset Return — {employeeName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
            {checkedIds.length} of {assets.length} assets selected
          </div>
        </div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: 'var(--text-3)', display: 'flex' }}>
          <span className="icon">close</span>
        </button>
      </div>

      {/* Controls bar */}
      <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', background: 'var(--surface-2)' }}>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>REASON</label>
          <select value={reason} onChange={e => setReason(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>APPLY CONDITION TO ALL</label>
            <select value={globalCond} onChange={e => setGlobalCond(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}>
              <option value="">— pick —</option>
              {CONDITIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={applyGlobalCondition} disabled={!globalCond}
            className="md-btn" style={{ fontSize: 12, padding: '7px 12px', color: 'var(--primary)', background: 'var(--primary-bg)', border: 'none', opacity: globalCond ? 1 : 0.4 }}>
            Apply
          </button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setItems(prev => { const n = { ...prev }; Object.keys(n).forEach(k => n[k] = { ...n[k], checked: true }); return n; })}
            style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--primary)', cursor: 'pointer', padding: '4px 8px' }}>All</button>
          <button onClick={() => setItems(prev => { const n = { ...prev }; Object.keys(n).forEach(k => n[k] = { ...n[k], checked: false }); return n; })}
            style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', padding: '4px 8px' }}>None</button>
        </div>
      </div>

      {/* Asset list */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {assets.map((a, i) => {
          const item = items[a.asset_id];
          return (
            <div key={a.asset_id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 22px',
              borderBottom: i < assets.length - 1 ? '1px solid var(--border)' : 'none',
              background: item.checked ? 'var(--surface)' : 'var(--surface-2)',
              transition: 'background .12s',
            }}>
              <input type="checkbox" checked={item.checked} onChange={e => setField(a.asset_id, 'checked', e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#d93025', flexShrink: 0 }} />

              <div style={{ flex: '0 0 130px' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{a.asset_id}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{a.asset_type}</div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[a.brand, a.model].filter(Boolean).join(' ') || '—'}
                </div>
                {a.serial_number && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>S/N: {a.serial_number}</div>
                )}
              </div>

              <select
                value={item.condition}
                onChange={e => setField(a.asset_id, 'condition', e.target.value)}
                disabled={!item.checked}
                style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text-1)', fontSize: 12, outline: 'none', width: 100, opacity: item.checked ? 1 : 0.4 }}>
                {CONDITIONS.map(c => <option key={c} value={c}>{c || '— cond —'}</option>)}
              </select>

              <input
                type="text"
                value={item.notes}
                onChange={e => setField(a.asset_id, 'notes', e.target.value)}
                placeholder="Notes…"
                disabled={!item.checked}
                style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text-1)', fontSize: 12, outline: 'none', width: 140, opacity: item.checked ? 1 : 0.4 }}
              />
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)' }}>
        <button onClick={submit} disabled={noneChecked || submitting}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px',
            background: '#d93025', color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: noneChecked || submitting ? 'not-allowed' : 'pointer',
            opacity: noneChecked ? 0.5 : 1, transition: 'opacity .15s',
          }}>
          <span className="icon icon-sm">{submitting ? 'hourglass_empty' : 'assignment_return'}</span>
          {submitting ? 'Processing…' : `Return ${checkedIds.length} Asset${checkedIds.length !== 1 ? 's' : ''}`}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Reason: <strong style={{ color: 'var(--text-1)' }}>{reason}</strong>
        </span>
        <button onClick={onCancel} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer', padding: '8px 12px' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Bulk Assign Panel ──────────────────────────────────────────────────────────
function BulkAssignPanel({
  employeeEmail, employeeName, onDone, onCancel,
}: {
  employeeEmail: string;
  employeeName: string;
  onDone: (assignedAssets: Asset[]) => void;
  onCancel: () => void;
}) {
  const [allAvailable, setAllAvailable] = useState<Asset[]>([]);
  const [loading, setLoading]           = useState(true);
  const [q, setQ]                       = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [typeFilter, setTypeFilter]     = useState('');
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [submitting, setSubmitting]     = useState(false);
  const [result, setResult]             = useState<{ assigned: string[]; failed: { asset_id: string; reason: string }[] } | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fix: username is "Not Assigned" for unassigned assets, not empty string
  useEffect(() => {
    api.listAssets('', '').then(all => {
      setAllAvailable(all.filter(a =>
        (!a.username || a.username === 'Not Assigned') &&
        a.status !== 'Active' && a.status !== 'Retired' && a.status !== 'Missing'
      ));
    }).finally(() => setLoading(false));
  }, []);

  const types = Array.from(new Set(allAvailable.map(a => a.asset_type).filter(Boolean))).sort();

  // Main list — filtered by type only (search is handled by dropdown)
  const listItems = allAvailable.filter(a => !typeFilter || a.asset_type === typeFilter);

  // Dropdown suggestions — filtered by query + type (max 8)
  const suggestions = q.trim()
    ? allAvailable.filter(a => {
        if (typeFilter && a.asset_type !== typeFilter) return false;
        const sq = q.toLowerCase();
        return `${a.asset_id} ${a.brand} ${a.model} ${a.serial_number} ${a.asset_type}`.toLowerCase().includes(sq);
      }).slice(0, 8)
    : [];

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSuggestionClick(id: string) {
    toggle(id);
    // keep dropdown open, clear query so user can search next
    setQ('');
  }

  async function submit() {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.bulkAssign(employeeEmail, { asset_ids: Array.from(selected) });
      setResult(res);
    } catch (e: any) {
      alert(`Bulk assign failed: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Result screen ────────────────────────────────────────────────────────
  if (result) {
    const assignedAssets = allAvailable.filter(a => result.assigned.includes(a.asset_id));
    return (
      <div className="md-card" style={{ padding: 28, borderLeft: '4px solid var(--success)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span className="icon" style={{ fontSize: 32, color: 'var(--success)' }}>check_circle</span>
          <div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--text-1)' }}>
              Bulk Assign Complete
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
              {result.assigned.length} asset{result.assigned.length !== 1 ? 's' : ''} assigned to {employeeName}
            </div>
          </div>
        </div>

        {result.assigned.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>ASSIGNED</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {result.assigned.map(id => (
                <span key={id} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: 'var(--success-bg)', color: 'var(--success)', fontFamily: 'monospace', fontWeight: 600 }}>{id}</span>
              ))}
            </div>
          </div>
        )}

        {result.failed.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', marginBottom: 6 }}>FAILED</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {result.failed.map(f => (
                <div key={f.asset_id} style={{ fontSize: 12, color: 'var(--danger)' }}>{f.asset_id} — {f.reason}</div>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => onDone(assignedAssets)} className="md-btn md-btn-primary" style={{ fontSize: 13 }}>
          <span className="icon icon-sm">done</span> Done
        </button>
      </div>
    );
  }

  // ── Input screen ─────────────────────────────────────────────────────────
  const selStyle: React.CSSProperties = {
    padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, outline: 'none',
  };

  const selectedAssets = allAvailable.filter(a => selected.has(a.asset_id));

  return (
    <div className="md-card" style={{ padding: 0, overflow: 'hidden', borderLeft: '4px solid var(--primary)' }}>

      {/* Header */}
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)' }}>
        <span className="icon" style={{ fontSize: 22, color: 'var(--primary)' }}>add_box</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>
            Assign Assets — {employeeName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
            {allAvailable.length} available · {selected.size} selected
          </div>
        </div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: 'var(--text-3)', display: 'flex' }}>
          <span className="icon">close</span>
        </button>
      </div>

      {/* Search + filter bar with dropdown */}
      <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Search with dropdown */}
          <div style={{ flex: '1 1 260px', position: 'relative' }}>
            <span className="icon icon-sm" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', zIndex: 1 }}>search</span>
            <input
              type="text" value={q}
              onChange={e => { setQ(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => { blurTimer.current = setTimeout(() => setDropdownOpen(false), 150); }}
              placeholder="Search assets to add…"
              className="md-input" style={{ paddingLeft: 34, width: '100%' }}
            />
            {/* Live dropdown */}
            {dropdownOpen && q.trim() && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderTop: 'none', borderRadius: '0 0 10px 10px',
                boxShadow: 'var(--shadow-2)', maxHeight: 320, overflowY: 'auto',
              }}
                onMouseDown={e => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); }}
              >
                {loading && (
                  <div style={{ padding: '12px 16px', color: 'var(--text-2)', fontSize: 13 }}>Loading…</div>
                )}
                {!loading && suggestions.length === 0 && (
                  <div style={{ padding: '12px 16px', color: 'var(--text-2)', fontSize: 13 }}>
                    No assets match "{q}"
                  </div>
                )}
                {suggestions.map((a, i) => {
                  const isSelected = selected.has(a.asset_id);
                  return (
                    <div key={a.asset_id}
                      onClick={() => handleSuggestionClick(a.asset_id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 16px', cursor: 'pointer',
                        borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                        background: isSelected ? 'var(--primary-bg)' : 'var(--surface)',
                        transition: 'background .1s',
                      }}>
                      <span className="icon icon-sm" style={{ color: isSelected ? 'var(--primary)' : 'var(--text-3)', flexShrink: 0 }}>
                        {isSelected ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      <div style={{ flex: '0 0 110px' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{a.asset_id}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{a.asset_type}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[a.brand, a.model].filter(Boolean).join(' ') || '—'}
                        </div>
                        {a.serial_number && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>S/N: {a.serial_number}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 11, padding: '2px 7px', borderRadius: 9, fontWeight: 600, flexShrink: 0,
                        background: a.status === 'In Stock' ? 'var(--success-bg)' : 'var(--surface-2)',
                        color: a.status === 'In Stock' ? 'var(--success)' : 'var(--text-2)',
                      }}>{a.status}</span>
                    </div>
                  );
                })}
                {suggestions.length === 8 && (
                  <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
                    Showing top 8 — refine your search
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...selStyle, flex: '0 0 150px' }}>
            <option value="">All types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Selected chips */}
        {selectedAssets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {selectedAssets.map(a => (
              <span key={a.asset_id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 6px 3px 10px', borderRadius: 12,
                  background: 'var(--primary-bg)', border: '1px solid var(--primary)',
                  fontSize: 12, color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 600,
                }}>
                {a.asset_id}
                <button
                  onClick={() => toggle(a.asset_id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 2px', color: 'var(--primary)', display: 'flex', lineHeight: 1 }}>
                  <span className="icon" style={{ fontSize: 14 }}>close</span>
                </button>
              </span>
            ))}
            <button onClick={() => setSelected(new Set())}
              style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', padding: '3px 6px', alignSelf: 'center' }}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Asset list — for browsing (no search query filter, just type) */}
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-2)' }}>
            <div style={{ display: 'inline-block', width: 22, height: 22, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        )}
        {!loading && listItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-2)', fontSize: 13 }}>
            <span className="icon" style={{ fontSize: 32, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>inventory_2</span>
            No available assets{typeFilter ? ` of type "${typeFilter}"` : ''}
          </div>
        )}
        {listItems.map((a, i) => {
          const checked = selected.has(a.asset_id);
          return (
            <div key={a.asset_id}
              onClick={() => toggle(a.asset_id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 22px',
                borderBottom: i < listItems.length - 1 ? '1px solid var(--border)' : 'none',
                background: checked ? 'var(--primary-bg)' : 'var(--surface)',
                cursor: 'pointer', transition: 'background .1s',
              }}>
              <input type="checkbox" checked={checked} readOnly
                onClick={e => e.stopPropagation()}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)', flexShrink: 0, pointerEvents: 'none' }} />

              <div style={{ flex: '0 0 130px' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>{a.asset_id}</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{a.asset_type}</div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[a.brand, a.model].filter(Boolean).join(' ') || '—'}
                </div>
                {a.serial_number && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>S/N: {a.serial_number}</div>
                )}
              </div>

              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, flexShrink: 0,
                background: a.status === 'In Stock' ? 'var(--success-bg)' : 'var(--surface-2)',
                color: a.status === 'In Stock' ? 'var(--success)' : 'var(--text-2)',
              }}>{a.status}</span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)' }}>
        <button onClick={submit} disabled={selected.size === 0 || submitting}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px',
            background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: selected.size === 0 || submitting ? 'not-allowed' : 'pointer',
            opacity: selected.size === 0 ? 0.5 : 1, transition: 'opacity .15s',
          }}>
          <span className="icon icon-sm">{submitting ? 'hourglass_empty' : 'add_box'}</span>
          {submitting ? 'Assigning…' : `Assign ${selected.size} Asset${selected.size !== 1 ? 's' : ''}`}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {allAvailable.length} available
        </span>
        <button onClick={onCancel} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer', padding: '8px 12px' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Employee Page ─────────────────────────────────────────────────────────────
export function EmployeePage() {
  const { email } = useParams<{ email: string }>();
  const nav = useNavigate();
  const [emp, setEmp]         = useState<Employee | null>(null);
  const [assets, setAssets]   = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [showBulkReturn, setShowBulkReturn] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);

  const targetEmail = decodeURIComponent(email ?? '');

  function load() {
    if (!targetEmail) return;
    setLoading(true);
    const encodedEmail = encodeURIComponent(targetEmail);
    Promise.all([
      api.getEmployees().then(res => setEmp(res.find(e => e.email === targetEmail) || null)),
      fetch(`/api/employee/${encodedEmail}/assets`).then(r => r.json()),
    ])
      .then(([_, myAssets]) => { setAssets(myAssets); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, [targetEmail]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12, color: 'var(--text-2)' }}>
      <div style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      Loading data…
    </div>
  );

  if (error || !emp) return (
    <div style={{ maxWidth: 800, margin: '40px auto', textAlign: 'center' }}>
      <span className="icon" style={{ fontSize: 48, color: 'var(--danger)', marginBottom: 16 }}>error_outline</span>
      <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, color: 'var(--text-1)' }}>Record Not Found</h2>
      <p style={{ color: 'var(--text-2)' }}>{error || "This person or location couldn't be loaded."}</p>
      <button onClick={() => nav('/employees')} className="md-btn md-btn-primary" style={{ marginTop: 20 }}>Back to Directory</button>
    </div>
  );

  const isRoom = emp.is_room;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Profile Card */}
      <div className="md-card" style={{ padding: 32, display: 'flex', alignItems: 'flex-start', gap: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: -50, width: 300, height: 300, background: isRoom ? 'var(--success-bg)' : 'var(--primary-bg)', borderRadius: '50%', opacity: 0.5, pointerEvents: 'none' }} />

        <div style={{ width: 80, height: 80, borderRadius: '50%', flexShrink: 0, background: isRoom ? 'var(--success-bg)' : 'var(--primary-bg)', border: isRoom ? '2px solid var(--success)' : '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-1)' }}>
          {isRoom
            ? <span className="icon" style={{ fontSize: 36, color: 'var(--success)' }}>meeting_room</span>
            : <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 32, color: 'var(--primary)' }}>{emp.full_name?.[0]?.toUpperCase()}</span>
          }
        </div>

        <div style={{ flex: 1, zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 28, color: 'var(--text-1)', margin: 0 }}>{emp.full_name}</h1>
            {isRoom
              ? <span style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>Location</span>
              : <span style={{ background: 'var(--surface-2)', color: 'var(--text-2)', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>ID: {emp.employee_id}</span>
            }
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 14 }}>
              <span className="icon icon-sm">{isRoom ? 'domain' : 'work'}</span>
              <span>{emp.designation || (isRoom ? 'Office Space' : 'Standard Employee')}</span>
            </div>
            {!isRoom && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 14 }}>
                <span className="icon icon-sm">mail</span>
                <a href={`mailto:${emp.email}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{emp.email}</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assets Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: 18, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="icon" style={{ color: 'var(--primary)', fontSize: 20 }}>devices</span>
            Assigned Equipment ({assets.length})
          </h2>
          {!showBulkReturn && !showBulkAssign && !isRoom && (
            <div style={{ display: 'flex', gap: 8 }}>
              {assets.length > 0 && (
                <button
                  onClick={() => setShowBulkReturn(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#fce8e6', color: '#d93025', border: '1px solid #f5c6c2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <span className="icon icon-sm">assignment_return</span>
                  Bulk Return
                </button>
              )}
              <button onClick={() => setShowBulkAssign(true)} className="md-btn" style={{ padding: '6px 12px', fontSize: 13, background: 'var(--primary-bg)', color: 'var(--primary)' }}>
                <span className="icon icon-sm">add</span> Assign Assets
              </button>
            </div>
          )}
        </div>

        {/* Bulk Return Panel */}
        {showBulkReturn && assets.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <BulkReturnPanel
              assets={assets}
              employeeEmail={targetEmail}
              employeeName={emp.full_name}
              onDone={(returnedIds) => {
                setShowBulkReturn(false);
                setAssets(prev => prev.filter(a => !returnedIds.includes(a.asset_id)));
              }}
              onCancel={() => setShowBulkReturn(false)}
            />
          </div>
        )}

        {/* Bulk Assign Panel */}
        {showBulkAssign && (
          <div style={{ marginBottom: 20 }}>
            <BulkAssignPanel
              employeeEmail={targetEmail}
              employeeName={emp.full_name}
              onDone={(assignedAssets) => {
                setShowBulkAssign(false);
                setAssets(prev => [...prev, ...assignedAssets.map(a => ({ ...a, status: 'Active' as const }))]);

              }}
              onCancel={() => setShowBulkAssign(false)}
            />
          </div>
        )}

        {assets.length === 0 ? (
          <div className="md-card" style={{ padding: 40, textAlign: 'center' }}>
            <span className="icon" style={{ fontSize: 40, color: 'var(--text-3)', marginBottom: 12 }}>inventory_2</span>
            <div style={{ fontWeight: 500, color: 'var(--text-2)' }}>No equipment currently assigned.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {assets.map(a => (
              <AssetCard key={a.asset_id} asset={a} compact
                actions={
                  <>
                    <button onClick={() => nav(`/return/${encodeURIComponent(a.asset_id)}`)}
                      style={{ flex: 1, padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'none', border: 'none', borderRight: '1px solid var(--border)', color: '#b06000', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      <span className="icon icon-sm">assignment_return</span> Return
                    </button>
                    <button onClick={() => nav(`/swap/${encodeURIComponent(a.asset_id)}`)}
                      style={{ flex: 1, padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      <span className="icon icon-sm">swap_horiz</span> Swap
                    </button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {!isRoom && <EmployeeRecentActivity email={targetEmail} />}
    </div>
  );
}
