import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ScanField } from '../components/ScanField';
import { SpecInput, RAM_UNITS, STORAGE_UNITS, SCREEN_UNITS } from '../components/SpecInput';
import type { CreateAssetRequest } from '../lib/types';

const PREFIX_TO_TYPE: Record<string, string> = {
  'LT': 'Laptop', 'DT': 'Desktop', 'MO': 'Monitor',
  'KB': 'Keyboard', 'MS': 'Mouse', 'DS': 'Docking Station',
  'SV': 'Server', 'PR': 'Printer', 'TV': 'Smart TV',
  'MP': 'Mobile Phone', 'MB': 'Motherboard', 'SS': 'SSD',
  'HD': 'HDD', 'RM': 'RAM', 'CP': 'CPU', 'GP': 'GPU',
  'UH': 'USB Hub', 'AD': 'Adapter', 'PA': 'Power Adapter',
  'WC': 'Webcam', 'HS': 'Headset', 'LP': 'Land Phone',
};

const ASSET_TYPES = [
  'Laptop','Desktop','Monitor','Keyboard','Mouse','Docking Station',
  'Server','Printer','Smart TV','Mobile Phone','Motherboard','SSD',
  'HDD','RAM','CPU','GPU','USB Hub','Adapter','Power Adapter',
  'Webcam','Headset','Land Phone','IP Phone',
];
const CONDITIONS = ['Excellent','Good','Fair','Poor','Damaged'];
const STATUSES   = ['In Stock','Active','Unassigned','Missing','Retired'];
const OS_OPTIONS = ['Windows 11', 'Windows 10', 'Windows 11 Pro', 'Windows 10 Pro', 'macOS', 'Ubuntu', 'Debian', 'Chrome OS', 'Other'];
const SPEC_TYPES = new Set(['Laptop', 'Desktop', 'Server']);

const selStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8,
  background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, outline: 'none', cursor: 'pointer',
};

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <span className="icon" style={{ color: 'var(--primary)', fontSize: 18 }}>{icon}</span>
      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{title}</span>
    </div>
  );
}

export function EditAssetPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const assetId = decodeURIComponent(id ?? '');

  const [form, setForm] = useState<Partial<CreateAssetRequest> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getAsset(assetId).then(asset => setForm({
      asset_type: asset.asset_type || PREFIX_TO_TYPE[assetId.split('-')[0]?.toUpperCase()] || '',
      status: asset.status, condition: asset.condition,
      brand: asset.brand, model: asset.model, serial_number: asset.serial_number,
      storage: asset.storage, memory_ram: asset.memory_ram,
      processor: asset.processor, graphics: asset.graphics,
      screen_size: asset.screen_size, os: asset.os,
      purchase_date: asset.purchase_date, purchase_price: asset.purchase_price,
      vendor: asset.vendor, invoice_ref: asset.invoice_ref,
      warranty_end: asset.warranty_end, location: asset.location,
      notes: asset.notes, pin_password: asset.pin_password,
      charger_model: asset.charger_model, charger_serial: asset.charger_serial,
      charger_notes: asset.charger_notes,
    })).catch(e => setError(e.message));
  }, [id]);

  const set = (key: keyof CreateAssetRequest) => (val: string) =>
    setForm(f => f ? { ...f, [key]: val } : null);
  const sel = (key: keyof CreateAssetRequest) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    set(key)(e.target.value);

  async function submit() {
    if (!form) return;
    setLoading(true); setError('');
    try {
      await api.updateAsset(assetId, form);
      nav(`/asset/${encodeURIComponent(assetId)}`);
    } catch (e: any) {
      setError(e.message || 'Update failed');
      setLoading(false);
    }
  }

  if (!form) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12, color: 'var(--text-2)' }}>
      <div style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      Loading…
    </div>
  );

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <button onClick={() => nav(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 12 }}>
          <span className="icon icon-sm">arrow_back</span> Back
        </button>
        <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0 }}>
          Edit Asset
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4, fontFamily: 'monospace' }}>{assetId}</p>
      </div>

      {/* Classification */}
      <div className="md-card" style={{ padding: 24 }}>
        <SectionTitle icon="category" title="Classification" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Asset Type</label>
            <select value={form.asset_type || ''} onChange={sel('asset_type')} style={selStyle}>
              <option value="">— Select type —</option>
              {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Status</label>
            <select value={form.status || ''} onChange={sel('status')} style={selStyle}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Condition</label>
            <select value={form.condition || ''} onChange={sel('condition')} style={selStyle}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Hardware */}
      <div className="md-card" style={{ padding: 24 }}>
        <SectionTitle icon="memory" title="Hardware Details" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ScanField label="Brand" value={form.brand || ''} onChange={set('brand')} />
          <ScanField label="Model" value={form.model || ''} onChange={set('model')} />
          <div style={{ gridColumn: '1 / -1' }}>
            <ScanField label="Serial Number" value={form.serial_number || ''} onChange={set('serial_number')} />
          </div>
          <SpecInput label="Storage" value={form.storage || ''} onChange={set('storage')} units={STORAGE_UNITS} placeholder="512" />
          <SpecInput label="Memory (RAM)" value={form.memory_ram || ''} onChange={set('memory_ram')} units={RAM_UNITS} placeholder="16" />
        </div>
      </div>

      {/* Technical Specs — Laptop / Desktop / Server */}
      {SPEC_TYPES.has(form.asset_type || '') && (
        <div className="md-card" style={{ padding: 24, borderLeft: '3px solid var(--primary)' }}>
          <SectionTitle icon="developer_board" title="Technical Specifications" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ScanField label="Processor" value={form.processor || ''} onChange={set('processor')} placeholder="e.g. Intel Core i7-1355U" />
            <ScanField label="Graphics" value={form.graphics || ''} onChange={set('graphics')} placeholder="e.g. NVIDIA RTX 3060" />
            <SpecInput label="Screen Size" value={form.screen_size || ''} onChange={set('screen_size')} units={SCREEN_UNITS} placeholder="15.6" />
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Operating System</label>
              <select value={form.os || ''} onChange={e => set('os')(e.target.value)} style={{ ...selStyle, width: '100%' }}>
                <option value="">— Select OS —</option>
                {OS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Purchase */}
      <div className="md-card" style={{ padding: 24 }}>
        <SectionTitle icon="receipt_long" title="Purchase Details" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ScanField label="Purchase Date" value={form.purchase_date || ''} onChange={set('purchase_date')} type="date" />
          <ScanField label="Purchase Price" value={form.purchase_price || ''} onChange={set('purchase_price')} />
          <ScanField label="Vendor" value={form.vendor || ''} onChange={set('vendor')} />
          <ScanField label="Invoice Reference" value={form.invoice_ref || ''} onChange={set('invoice_ref')} />
          <ScanField label="Warranty End" value={form.warranty_end || ''} onChange={set('warranty_end')} type="date" />
        </div>
      </div>

      {/* Additional */}
      <div className="md-card" style={{ padding: 24 }}>
        <SectionTitle icon="tune" title="Additional Info" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ScanField label="Location" value={form.location || ''} onChange={set('location')} />
          <ScanField label="PIN / Password" value={form.pin_password || ''} onChange={set('pin_password')} />
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Notes</label>
            <textarea
              value={form.notes || ''} onChange={e => set('notes')(e.target.value)} rows={3}
              className="md-input" style={{ resize: 'vertical', minHeight: 80, padding: '10px 14px' }}
            />
          </div>
        </div>
      </div>

      {/* Charger Details — Laptop only */}
      {form.asset_type === 'Laptop' && (
        <div className="md-card" style={{ padding: 24, borderLeft: '3px solid var(--primary)' }}>
          <SectionTitle icon="power" title="Charger Details" />
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16, marginTop: -8 }}>
            Track the charger bundled with this laptop.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ScanField label="Charger Model" value={form.charger_model || ''} onChange={set('charger_model')} placeholder="e.g. Dell 65W USB-C" />
            <ScanField label="Charger Serial Number" value={form.charger_serial || ''} onChange={set('charger_serial')} placeholder="e.g. CH-XXXXXX" />
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Charger Notes</label>
              <textarea
                value={form.charger_notes || ''} onChange={e => set('charger_notes')(e.target.value)} rows={2}
                className="md-input" style={{ resize: 'vertical', minHeight: 60, padding: '10px 14px' }}
                placeholder="e.g. Charger missing, cable frayed..."
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
          <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>{error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => nav(-1)} className="md-btn md-btn-outlined" style={{ flex: 1 }}>Cancel</button>
        <button onClick={submit} disabled={loading} className="md-btn md-btn-primary" style={{ flex: 2 }}>
          <span className="icon icon-sm">{loading ? 'hourglass_empty' : 'save'}</span>
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}