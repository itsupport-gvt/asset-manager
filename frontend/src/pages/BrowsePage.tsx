import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Asset } from '../lib/types';
import { AssetCard } from '../components/AssetCard';

export function BrowsePage() {
  const [searchParams] = useSearchParams();
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [q, setQ]             = useState(searchParams.get('q') || '');
  const [status, setStatus]   = useState(searchParams.get('status') || '');
  const [assetType, setAssetType] = useState(searchParams.get('type') || '');
  const [assignee, setAssignee]   = useState('');
  const [ramFilter, setRamFilter] = useState('');
  const [storageFilter, setStorageFilter] = useState('');

  useEffect(() => {
    api.listAssets('', '').then(setAllAssets).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const types    = useMemo(() => Array.from(new Set(allAssets.map(a => a.asset_type).filter(Boolean))).sort(), [allAssets]);
  const assignees = useMemo(() => Array.from(new Set(allAssets.map(a => a.employee_display || a.username).filter(x => x && x !== 'Not Assigned'))).sort(), [allAssets]);

  const filtered = useMemo(() => allAssets.filter(a => {
    if (status && a.status.toLowerCase() !== status.toLowerCase()) return false;
    if (assetType && a.asset_type !== assetType) return false;
    if (assignee && (a.employee_display || a.username) !== assignee) return false;
    if (ramFilter && !(a.memory_ram || '').toLowerCase().includes(ramFilter.toLowerCase())) return false;
    if (storageFilter && !(a.storage || '').toLowerCase().includes(storageFilter.toLowerCase())) return false;
    if (q) {
      const sq = q.toLowerCase().replace(/-/g, '');
      const text = `${a.asset_id.replace(/-/g, '')} ${a.asset_id} ${a.brand} ${a.model} ${a.serial_number} ${a.employee_display} ${a.location} ${a.storage} ${a.memory_ram} ${a.processor} ${a.graphics} ${a.os}`.toLowerCase();
      if (!text.includes(sq)) return false;
    }
    return true;
  }), [allAssets, q, status, assetType, assignee, ramFilter, storageFilter]);

  const selStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0 }}>
            Asset Directory
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4 }}>
            {loading ? 'Loading…' : `${filtered.length} of ${allAssets.length} assets`}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="md-card-flat" style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        {/* Search */}
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <span className="icon icon-sm" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}>search</span>
          <input
            type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search assets, serials, people…"
            className="md-input" style={{ paddingLeft: 34 }}
          />
        </div>

        <div style={{ flex: '1 1 140px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={selStyle}>
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="In Stock">In Stock</option>
            <option value="Unassigned">Unassigned</option>
            <option value="Missing">Missing</option>
            <option value="Retired">Retired</option>
          </select>
        </div>

        <div style={{ flex: '1 1 140px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Type</label>
          <select value={assetType} onChange={e => setAssetType(e.target.value)} style={selStyle}>
            <option value="">All types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div style={{ flex: '1 1 160px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Assignee</label>
          <select value={assignee} onChange={e => setAssignee(e.target.value)} style={selStyle}>
            <option value="">All people</option>
            {assignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div style={{ flex: '1 1 120px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>RAM</label>
          <select value={ramFilter} onChange={e => setRamFilter(e.target.value)} style={selStyle}>
            <option value="">Any RAM</option>
            {['4 GB','8 GB','16 GB','32 GB','64 GB'].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div style={{ flex: '1 1 130px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Storage</label>
          <select value={storageFilter} onChange={e => setStorageFilter(e.target.value)} style={selStyle}>
            <option value="">Any storage</option>
            {['128 GB','256 GB','512 GB','1 TB','2 TB'].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {(q || status || assetType || assignee || ramFilter || storageFilter) && (
          <button className="md-btn md-btn-outlined" style={{ fontSize: 12, padding: '8px 14px', alignSelf: 'flex-end' }}
            onClick={() => { setQ(''); setStatus(''); setAssetType(''); setAssignee(''); setRamFilter(''); setStorageFilter(''); }}>
            <span className="icon icon-sm">filter_alt_off</span> Clear
          </button>
        )}
      </div>

      {/* Asset Grid */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-2)' }}>
          <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 12 }}>Loading assets…</p>
        </div>
      )}
      {error && (
        <div style={{ padding: 16, background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, fontSize: 13 }}>
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-2)' }}>
          <span className="icon" style={{ fontSize: 48, color: 'var(--text-3)' }}>search_off</span>
          <p style={{ marginTop: 8 }}>No assets match your filters</p>
        </div>
      )}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map(a => <AssetCard key={a.asset_id} asset={a} />)}
        </div>
      )}
    </div>
  );
}