import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { CreateEmployeeRequest } from '../lib/types';

export function NewEmployeePage() {
    const nav = useNavigate();
    const [form, setForm] = useState<CreateEmployeeRequest>({ employee_id: '', full_name: '', email: '', designation: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [isRoom, setIsRoom] = useState(false);

    const set = (key: keyof CreateEmployeeRequest) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value }));

    async function submit() {
        if (!form.full_name) { setError('Name is required'); return; }

        // For rooms, generate a synthetic email automatically if not provided
        const payload = { ...form };
        if (isRoom) {
            if (!payload.email) {
                payload.email = `room:${payload.full_name.toLowerCase().replace(/[^a-z0-9]/g, '_')}@local`;
            }
            if (!payload.designation) {
                payload.designation = 'Office Location';
            }
        } else if (!form.email) {
            setError('Email is required for employees');
            return;
        }

        setLoading(true); setError('');
        try {
            await api.createEmployee(payload);
            nav('/employees', { state: { toast: `Added ${payload.full_name}` } });
        } catch (e: any) {
            setError(e.message || 'Failed to create record');
            setLoading(false);
        }
    }

    return (
        <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header */}
            <div>
                <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="icon" style={{ color: 'var(--primary)', fontSize: 26 }}>person_add</span>
                    Add Directory Entry
                </h1>
                <p style={{ color: 'var(--text-2)', fontSize: 14, marginTop: 4 }}>Register a new employee or office location.</p>
            </div>

            {/* Form Card */}
            <div className="md-card" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Toggle Switch */}
                <div style={{ display: 'flex', gap: 8, background: 'var(--surface-2)', padding: 4, borderRadius: 12, marginBottom: 8 }}>
                    <button
                        onClick={() => { setIsRoom(false); setError(''); }}
                        style={{
                            flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            background: !isRoom ? 'var(--surface)' : 'transparent',
                            color: !isRoom ? 'var(--primary)' : 'var(--text-2)',
                            boxShadow: !isRoom ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                            transition: 'all .2s'
                        }}
                    >
                        <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>person</span>
                        Person
                    </button>
                    <button
                        onClick={() => { setIsRoom(true); setError(''); }}
                        style={{
                            flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            background: isRoom ? 'var(--surface)' : 'transparent',
                            color: isRoom ? 'var(--success)' : 'var(--text-2)',
                            boxShadow: isRoom ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                            transition: 'all .2s'
                        }}
                    >
                        <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>meeting_room</span>
                        Office Location
                    </button>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>
                        {isRoom ? 'Location Name' : 'Full Name'} <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                        type="text" value={form.full_name} onChange={set('full_name')}
                        placeholder={isRoom ? "e.g. Engineering Room 2" : "e.g. Jane Doe"}
                        className="md-input"
                    />
                </div>

                {!isRoom && (
                    <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>
                            Email Address <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <input
                            type="email" value={form.email} onChange={set('email')}
                            placeholder="e.g. jane@company.com"
                            className="md-input"
                        />
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {!isRoom && (
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Employee ID</label>
                            <input
                                type="text" value={form.employee_id} onChange={set('employee_id')}
                                placeholder="Optional"
                                className="md-input"
                            />
                        </div>
                    )}
                    <div style={{ gridColumn: isRoom ? '1 / -1' : undefined }}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>
                            {isRoom ? 'Location Type / Zone' : 'Designation / Role'}
                        </label>
                        <input
                            type="text" value={form.designation} onChange={set('designation')}
                            placeholder={isRoom ? "e.g. Server Room" : "e.g. Software Engineer"}
                            className="md-input"
                        />
                    </div>
                </div>

                {error && (
                    <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
                        <span className="icon icon-sm" style={{ verticalAlign: 'middle', marginRight: 6 }}>error</span>{error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button onClick={() => nav(-1)} className="md-btn md-btn-outlined" style={{ flex: 1 }}>Cancel</button>
                    <button onClick={submit} disabled={loading} className="md-btn md-btn-primary" style={{ flex: 2, background: isRoom ? 'var(--success)' : 'var(--primary)' }}>
                        <span className="icon icon-sm">{loading ? 'hourglass_empty' : 'check'}</span>
                        {loading ? 'Saving…' : 'Save Record'}
                    </button>
                </div>
            </div>
        </div>
    );
}
