import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Asset, Employee } from '../lib/types';
import { EmployeePicker } from '../components/EmployeePicker';

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];
const RETURN_STATUSES = ['In Stock', 'Under Repair', 'Damaged', 'Retired', 'Lost'];

const selStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer',
};

type Mode = 'person' | 'stock';

export function SwapPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const assetId = decodeURIComponent(id ?? '');

  const [mode, setMode]         = useState<Mode>('person');
  const [asset, setAsset]       = useState<Asset | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Person-swap fields
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [condition, setCondition]     = useState('');
  const [notes, setNotes]             = useState('');

  // Stock-swap fields
  const [returnStatus, setReturnStatus]       = useState('In Stock');
  const [stockSearch, setStockSearch]         = useState('');
  const [stockAssets, setStockAssets]         = useState<Asset[]>([]);
  const [stockLoading, setStockLoading]       = useState(false);
  const [replacementId, setReplacementId]     = useState('');
  const [replacementAsset, setReplacementAsset] = useState<Asset | null>(null);

  useEffect(() => {
    api.getAsset(assetId).then(setAsset).catch(e => setError(e.message));
    api.getEmployees().then(setEmployees).catch(() => {});
  }, [assetId]);

  // Search in-stock assets for stock-swap replacement
  useEffect(() => {
    if (mode !== 'stock') return;
    setStockLoading(true);
    api.searchAssets({ status: 'In Stock', q: stockSearch, page_size: '30' } as Record<string, string>)
      .then(results => setStockAssets(results.filter(a => a.asset_id !== assetId)))
      .catch(() => setStockAssets([]))
      .finally(() => setStockLoading(false));
  }, [mode, stockSearch, assetId]);

  async function submit() {
    if (mode === 'person' && !newEmpEmail) { setError('Please select the new person'); return; }
    if (mode === 'stock' && !replacementId) { setError('Please select a replacement asset'); return; }

    setLoading(true); setError('');
    try {
      await api.swapAsset({
        mode,
        asset_id: assetId,
        ...(mode === 'person' ? { new_employee_email: newEmpEmail } : {}),
        ...(mode === 'stock'  ? { replacement_asset_id: replacementId, return_status: returnStatus } : {}),
        condition,
        notes,
      });
      nav(`/asset/${encodeURIComponent(assetId)}`, {
        state: { toast: mode === 'person' ? 'Asset swapped to new person' : 'Stock swap complete' },
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Swap failed');
    } finally { setLoading(false); }
  }

  const tabBtn = (m: Mode, label: string, icon: string) => (
    <button
      onClick={() => { setMode(m); setError(''); }}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
        fontWeight: mode === m ? 700 : 400,
        fontFamily: "'Google Sans', sans-serif",
        background: mode === m ? 'var(--primary-bg)' : 'transparent',
        color: mode === m ? 'var(--primary)' : 'var(--text-2)',
        transition: 'all .15s',
      }}
    >
      <span className="icon icon-sm">{icon}</span>{label}
    </button>
  );

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <button
          onClick={() => nav(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 12 }}
        >
          <span className="icon icon-sm">arrow_back</span> Back
        </button>
        <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="icon" style={{ color: 'var(--primary)', fontSize: 26 }}>swap_horiz</span>
          Swap Asset
        </h1>
      </div>

      {/* Current asset banner */}
      <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--primary-bg)', border: '1px solid rgba(26,115,232,.2)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="icon" style={{ color: 'var(--primary)', fontSize: 22 }}>devices</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Current asset</div>
          <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>
            {asset ? `${asset.brand} ${asset.model}` : assetId}
          </div>
          {asset && (
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>
              {assetId} · Assigned to <strong>{asset.employee_display || asset.username}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 4 }}>
        {tabBtn('person', 'Person Swap', 'people')}
        {tabBtn('stock', 'Stock Swap', 'sync_alt')}
      </div>

      {/* Mode description */}
      <div style={{ fontSize: 13, color: 'var(--text-2)', padding: '0 2px', lineHeight: 1.6 }}>
        {mode === 'person'
          ? 'Transfer this asset to a different person. The asset stays the same — only the assignee changes.'
          : 'Return this asset to stock (e.g. damaged / defective) and assign a different in-stock asset to the same person.'}
      </div>

      {/* Form */}
      <div className="md-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Person Swap ─────────────────────────────────────────────────── */}
        {mode === 'person' && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>
                New Assignee
              </label>
              <EmployeePicker employees={employees} value={newEmpEmail} onChange={setNewEmpEmail} />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Condition</label>
              <select value={condition} onChange={e => setCondition(e.target.value)} style={selStyle}>
                <option value="">— Unchanged —</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </>
        )}

        {/* ── Stock Swap ──────────────────────────────────────────────────── */}
        {mode === 'stock' && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>
                Return Status (for current asset)
              </label>
              <select value={returnStatus} onChange={e => setReturnStatus(e.target.value)} style={selStyle}>
                {RETURN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>
                Replacement Asset <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(In Stock)</span>
              </label>
              <input
                type="text"
                value={stockSearch}
                onChange={e => { setStockSearch(e.target.value); setReplacementId(''); setReplacementAsset(null); }}
                placeholder="Search by asset ID, brand, model…"
                className="md-input"
                style={{ width: '100%', marginBottom: 8 }}
              />

              {replacementAsset ? (
                <div style={{
                  padding: '10px 14px', borderRadius: 8, background: 'var(--success-bg)',
                  border: '1px solid #ceead6', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span className="icon icon-sm" style={{ color: 'var(--success)' }}>check_circle</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
                      {replacementAsset.brand} {replacementAsset.model}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>{replacementAsset.asset_id}</div>
                  </div>
                  <button
                    onClick={() => { setReplacementId(''); setReplacementAsset(null); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
                  >
                    <span className="icon icon-sm">close</span>
                  </button>
                </div>
              ) : (
                <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                  {stockLoading ? (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Loading…</div>
                  ) : stockAssets.length === 0 ? (
                    <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>No in-stock assets found</div>
                  ) : stockAssets.map(a => (
                    <button
                      key={a.asset_id}
                      onClick={() => { setReplacementId(a.asset_id); setReplacementAsset(a); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', width: '100%', textAlign: 'left',
                        transition: 'background .1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>devices</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
                          {a.brand} {a.model}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>
                          {a.asset_id} · {a.condition}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10,
                        background: 'var(--success-bg)', color: 'var(--success)', fontWeight: 600,
                      }}>In Stock</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Condition of Replacement</label>
              <select value={condition} onChange={e => setCondition(e.target.value)} style={selStyle}>
                <option value="">— Unchanged —</option>
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </>
        )}

        {/* Shared: Notes */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Notes</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="md-input" style={{ resize: 'vertical', minHeight: 72, padding: '10px 14px' }}
            placeholder={mode === 'person' ? 'Reason for swap, handover notes…' : 'Reason for replacing asset (e.g. defective screen, battery issue)…'}
          />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
            <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>{error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => nav(-1)} className="md-btn md-btn-outlined" style={{ flex: 1 }}>Cancel</button>
          <button
            onClick={submit}
            disabled={loading || (mode === 'person' ? !newEmpEmail : !replacementId)}
            className="md-btn md-btn-primary"
            style={{ flex: 2 }}
          >
            <span className="icon icon-sm">{loading ? 'hourglass_empty' : 'swap_horiz'}</span>
            {loading ? 'Processing…' : mode === 'person' ? 'Confirm Person Swap' : 'Confirm Stock Swap'}
          </button>
        </div>
      </div>
    </div>
  );
}
