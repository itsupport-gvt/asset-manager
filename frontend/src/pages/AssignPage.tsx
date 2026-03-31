import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Employee } from '../lib/types';
import { EmployeePicker } from '../components/EmployeePicker';

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];
const selStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer',
};

export function AssignPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const assetId = decodeURIComponent(id ?? '');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empEmail, setEmpEmail]   = useState('');
  const [condition, setCondition] = useState('');
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => { api.getEmployees().then(setEmployees).catch(e => setError(e.message)); }, []);

  async function submit() {
    if (!empEmail) { setError('Please select a person or location'); return; }
    setLoading(true); setError('');
    try {
      const res = await api.assignAsset({ asset_id: assetId, employee_email: empEmail, condition, notes });
      nav(`/asset/${encodeURIComponent(assetId)}`, { state: { toast: `Assigned — ${res.assignment_id}` } });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Assign failed');
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
          <span className="icon" style={{ color: 'var(--primary)', fontSize: 26 }}>person_add</span>
          Assign Asset
        </h1>
      </div>

      {/* Asset info banner */}
      <div style={{
        padding: '12px 16px', borderRadius: 10, background: 'var(--primary-bg)',
        border: '1px solid rgba(26,115,232,.2)', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span className="icon" style={{ color: 'var(--primary)', fontSize: 22 }}>devices</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Assigning asset</div>
          <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>{assetId}</div>
        </div>
      </div>

      {/* Form */}
      <div className="md-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <EmployeePicker employees={employees} value={empEmail} onChange={setEmpEmail} />

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Condition at Assignment</label>
          <select value={condition} onChange={e => setCondition(e.target.value)} style={selStyle}>
            <option value="">— Unchanged —</option>
            {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Initialization Notes</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="md-input" style={{ resize: 'vertical', minHeight: 76, padding: '10px 14px' }}
            placeholder="e.g. Clean installed Windows 11 PRO, updated BIOS."
          />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
            <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>{error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => nav(-1)} className="md-btn md-btn-outlined" style={{ flex: 1 }}>Cancel</button>
          <button onClick={submit} disabled={loading} className="md-btn md-btn-primary" style={{ flex: 2 }}>
            <span className="icon icon-sm">{loading ? 'hourglass_empty' : 'check_circle'}</span>
            {loading ? 'Assigning…' : 'Confirm Assignment'}
          </button>
        </div>
      </div>
    </div>
  );
}
