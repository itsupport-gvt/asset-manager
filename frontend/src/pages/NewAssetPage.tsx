import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ScanField } from '../components/ScanField';
import type { CreateAssetRequest } from '../lib/types';

const ASSET_TYPES = [
    'Laptop', 'Desktop', 'Monitor', 'Keyboard', 'Mouse', 'Docking Station',
    'Server', 'Printer', 'Smart TV', 'Mobile Phone', 'Motherboard', 'SSD',
    'HDD', 'RAM', 'CPU', 'GPU', 'USB Hub', 'Adapter', 'Power Adapter',
    'Webcam', 'Headset', 'Land Phone', 'IP Phone',
];
const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Damaged'];
const STATUSES = ['In Stock', 'Active', 'Unassigned', 'Missing', 'Retired'];

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

export function NewAssetPage() {
    const nav = useNavigate();
    const [form, setForm] = useState<CreateAssetRequest>({
        asset_type: '', status: 'In Stock', condition: 'New',
        brand: '', model: '', serial_number: '', storage: '', memory_ram: '',
        purchase_date: '', purchase_price: '', vendor: '', invoice_ref: '',
        warranty_end: '', location: '', notes: '', pin_password: '',
        charger_model: '', charger_serial: '', charger_notes: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const set = (key: keyof CreateAssetRequest) => (val: string) => setForm(f => ({ ...f, [key]: val }));
    const sel = (key: keyof CreateAssetRequest) => (e: React.ChangeEvent<HTMLSelectElement>) => set(key)(e.target.value);

    async function submit() {
        if (!form.asset_type) { setError('Asset Type is required'); return; }
        setLoading(true); setError('');
        try {
            const res = await api.createAsset(form);
            nav(`/asset/${encodeURIComponent(res.asset_id)}`);
        } catch (e: any) {
            setError(e.message || 'Failed to create asset');
            setLoading(false);
        }
    }

    return (
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
                <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0 }}>Register New Asset</h1>
                <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4 }}>Add a new piece of IT equipment to the inventory.</p>
            </div>

            {/* Classification */}
            <div className="md-card" style={{ padding: 24 }}>
                <SectionTitle icon="category" title="Classification" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Asset Type <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <select value={form.asset_type} onChange={sel('asset_type')} style={selStyle}>
                            <option value="">— Select type —</option>
                            {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Status</label>
                        <select value={form.status} onChange={sel('status')} style={selStyle}>
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Condition</label>
                        <select value={form.condition} onChange={sel('condition')} style={selStyle}>
                            <option value="New">New</option>
                            {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Hardware */}
            <div className="md-card" style={{ padding: 24 }}>
                <SectionTitle icon="memory" title="Hardware Details" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <ScanField label="Brand" value={form.brand} onChange={set('brand')} placeholder="e.g. Dell" />
                    <ScanField label="Model" value={form.model} onChange={set('model')} placeholder="e.g. XPS 13" />
                    <div style={{ gridColumn: '1 / -1' }}>
                        <ScanField label="Serial Number" value={form.serial_number} onChange={set('serial_number')} />
                    </div>
                    <ScanField label="Storage" value={form.storage || ''} onChange={set('storage')} placeholder="e.g. 512GB SSD" />
                    <ScanField label="Memory (RAM)" value={form.memory_ram || ''} onChange={set('memory_ram')} placeholder="e.g. 16GB" />
                </div>
            </div>

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
                            value={form.notes} onChange={e => set('notes')(e.target.value)} rows={3}
                            className="md-input" style={{ resize: 'vertical', minHeight: 80, padding: '10px 14px' }}
                            placeholder="Any extra details..."
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
                    <span className="icon icon-sm">{loading ? 'hourglass_empty' : 'add'}</span>
                    {loading ? 'Registering…' : 'Register Asset'}
                </button>
            </div>
        </div>
    );
}
