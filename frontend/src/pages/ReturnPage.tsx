import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Asset } from '../lib/types';

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];
const selStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer',
};

export function ReturnPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const assetId = decodeURIComponent(id ?? '');

  const [asset, setAsset]         = useState<Asset | null>(null);
  const [condition, setCondition] = useState('');
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    api.getAsset(assetId).then(a => { setAsset(a); setCondition(a.condition); }).catch(e => setError(e.message));
  }, [assetId]);

  async function submit() {
    setLoading(true); setError('');
    try {
      const res = await api.returnAsset({ asset_id: assetId, condition, notes });
      nav(`/asset/${encodeURIComponent(assetId)}`, { state: { toast: `Returned from ${res.returned_from}` } });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Return failed');
    } finally { setLoading(false); }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <button onClick={() => nav(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 12 }}>
          <span className="icon icon-sm">arrow_back</span> Back
        </button>
        <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="icon" style={{ color: '#b06000', fontSize: 26 }}>assignment_return</span>
          Return Asset
        </h1>
      </div>

      {/* Asset info banner */}
      <div style={{
        padding: '12px 16px', borderRadius: 10, background: 'var(--warn-bg)',
        border: '1px solid rgba(249,171,0,.3)', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="icon" style={{ color: '#b06000', fontSize: 22 }}>devices</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#b06000', textTransform: 'uppercase', letterSpacing: '.4px' }}>Processing return</div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>{assetId}</div>
          </div>
        </div>
        {asset?.employee_display && (
          <div style={{ paddingTop: 8, borderTop: '1px solid rgba(249,171,0,.2)', fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="icon icon-sm" style={{ color: '#b06000' }}>person</span>
            Currently assigned to: <strong style={{ color: 'var(--text-1)' }}>{asset.employee_display}</strong>
          </div>
        )}
      </div>

      {/* Form */}
      <div className="md-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Condition on Return</label>
          <select value={condition} onChange={e => setCondition(e.target.value)} style={selStyle}>
            <option value="">— Unchanged —</option>
            {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Return Notes</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="md-input" style={{ resize: 'vertical', minHeight: 76, padding: '10px 14px' }}
            placeholder="Record any damage, missing components, etc."
          />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
            <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>{error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => nav(-1)} className="md-btn md-btn-outlined" style={{ flex: 1 }}>Cancel</button>
          <button onClick={submit} disabled={loading} className="md-btn" style={{ flex: 2, background: '#f9ab00', color: '#000', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .6 : 1 }}>
            <span className="icon icon-sm">{loading ? 'hourglass_empty' : 'assignment_return'}</span>
            {loading ? 'Processing…' : 'Confirm Return'}
          </button>
        </div>
      </div>
    </div>
  );
}
