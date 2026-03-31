import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Employee } from '../lib/types';

export function EmployeeManagerPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'people' | 'locations'>('people');
    const nav = useNavigate();

    useEffect(() => {
        api.getEmployees()
            .then(emps => { setEmployees(emps); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    }, []);

    const theList = employees.filter(e => {
        if (activeTab === 'people' && e.is_room) return false;
        if (activeTab === 'locations' && !e.is_room) return false;
        if (!q) return true;
        const s = q.toLowerCase();
        return (e.full_name || '').toLowerCase().includes(s) || (e.email || '').toLowerCase().includes(s) || (e.employee_id || '').includes(s);
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header and Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 24, color: 'var(--text-1)', margin: 0 }}>Directory</h1>
                    <p style={{ color: 'var(--text-2)', fontSize: 14, margin: '4px 0 0' }}>Manage people and office locations.</p>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <span className="icon icon-sm" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}>search</span>
                        <input
                            type="text" value={q} onChange={e => setQ(e.target.value)}
                            placeholder="Search directory..."
                            className="md-input"
                            style={{ paddingLeft: 34, width: 240, borderRadius: 24, background: 'var(--surface)' }}
                        />
                    </div>
                    <button onClick={() => nav('/new-employee')} className="md-btn md-btn-primary" style={{ padding: '8px 16px' }}>
                        <span className="icon icon-sm">person_add</span> Add New
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
                <button
                    onClick={() => setActiveTab('people')}
                    style={{
                        padding: '8px 16px', borderRadius: 24, fontSize: 13, fontWeight: activeTab === 'people' ? 600 : 500,
                        background: activeTab === 'people' ? 'var(--primary-bg)' : 'transparent',
                        color: activeTab === 'people' ? 'var(--primary)' : 'var(--text-2)',
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s'
                    }}
                >
                    <span className="icon icon-sm">group</span> People ({employees.filter(e => !e.is_room).length})
                </button>
                <button
                    onClick={() => setActiveTab('locations')}
                    style={{
                        padding: '8px 16px', borderRadius: 24, fontSize: 13, fontWeight: activeTab === 'locations' ? 600 : 500,
                        background: activeTab === 'locations' ? 'var(--success-bg)' : 'transparent',
                        color: activeTab === 'locations' ? 'var(--success)' : 'var(--text-2)',
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .2s'
                    }}
                >
                    <span className="icon icon-sm">meeting_room</span> Locations ({employees.filter(e => e.is_room).length})
                </button>
            </div>

            {error && <div style={{ color: 'var(--danger)', background: 'var(--danger-bg)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

            {/* Table */}
            <div className="md-card" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>{activeTab === 'people' ? 'Name' : 'Location Name'}</th>
                                {activeTab === 'people' && <th style={{ padding: '12px 16px', fontWeight: 600 }}>ID</th>}
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>{activeTab === 'people' ? 'Role' : 'Type'}</th>
                                {activeTab === 'people' && <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email</th>}
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>Loading...</td></tr>
                            ) : theList.length === 0 ? (
                                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>No {activeTab} found.</td></tr>
                            ) : (
                                theList.map(e => (
                                    <tr key={e.email} style={{ borderBottom: '1px solid var(--border)', transition: 'background .15s' }} onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: e.is_room ? 'var(--success-bg)' : 'var(--primary-bg)', color: e.is_room ? 'var(--success)' : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                                                {e.is_room ? <span className="icon icon-sm">meeting_room</span> : e.full_name[0]?.toUpperCase()}
                                            </div>
                                            <Link to={`/employee/${encodeURIComponent(e.email)}`} style={{ textDecoration: 'none', color: 'inherit' }}>{e.full_name}</Link>
                                        </td>
                                        {activeTab === 'people' && <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}><span style={{ fontFamily: 'monospace', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>{e.employee_id}</span></td>}
                                        <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>{e.designation}</td>
                                        {activeTab === 'people' && <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>{e.email}</td>}
                                        <td style={{ padding: '12px 16px' }}>
                                            <Link to={`/employee/${encodeURIComponent(e.email)}`} className="md-btn md-btn-outlined" style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}>
                                                Manage {activeTab === 'people' ? 'User' : 'Room'}
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
