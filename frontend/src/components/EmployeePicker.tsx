import { useState } from 'react';
import type { Employee } from '../lib/types';

interface Props {
  employees: Employee[];
  value: string;
  onChange: (email: string) => void;
  label?: string;
}

export function EmployeePicker({ employees, value, onChange, label = 'Assign To' }: Props) {
  const [query, setQuery] = useState('');

  const filtered = employees.filter(e => {
    if (!query) return false; // Only show dropdown when typing
    const q = query.toLowerCase();
    return (
      (e.full_name || '').toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q) ||
      (e.employee_id || '').includes(q) ||
      (e.designation || '').toLowerCase().includes(q)
    );
  });

  const selected = employees.find(e => e.email === value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', width: '100%' }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>
        {label}<span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>
      </label>

      {/* Selected state */}
      {selected && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', border: '2px solid var(--primary)', borderRadius: 8,
          background: 'var(--primary-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: selected.is_room ? 'var(--success-bg)' : 'var(--primary-bg)',
              border: selected.is_room ? '1px solid var(--success)' : '1px solid var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {selected.is_room
                ? <span className="icon" style={{ fontSize: 16, color: 'var(--success)' }}>meeting_room</span>
                : <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--primary)' }}>{selected.full_name?.[0]?.toUpperCase()}</span>
              }
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.is_room ? 'Office Location' : `${selected.designation} · ${selected.email}`}
              </div>
            </div>
          </div>
          <button
            onClick={() => { onChange(''); setQuery(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 4, borderRadius: 6, flexShrink: 0 }}
            title="Clear"
          >
            <span className="icon icon-sm">close</span>
          </button>
        </div>
      )}

      {/* Search state */}
      {!selected && (
        <>
          <div style={{ position: 'relative' }}>
            <span className="icon icon-sm" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}>search</span>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, email or ID…"
              className="md-input"
              style={{ paddingLeft: 34 }}
            />
          </div>

          {query && (
            <div className="md-card" style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
              maxHeight: 260, overflowY: 'auto', animation: 'fadeIn .15s ease',
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '14px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>
                  No matches for "{query}"
                </div>
              ) : filtered.map(e => (
                <div
                  key={e.email}
                  onClick={() => { onChange(e.email); setQuery(''); }}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = '')}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: e.is_room ? 'var(--success-bg)' : 'var(--primary-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {e.is_room
                      ? <span className="icon" style={{ fontSize: 16, color: 'var(--success)' }}>meeting_room</span>
                      : <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--primary)' }}>{e.full_name?.[0]?.toUpperCase()}</span>
                    }
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-1)' }}>{e.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 6 }}>
                      {e.is_room
                        ? <span style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '0 5px', borderRadius: 4, fontSize: 11 }}>Location</span>
                        : <>
                            {e.employee_id && <span style={{ fontFamily: 'monospace', background: 'var(--surface-2)', padding: '0 5px', borderRadius: 4 }}>{e.employee_id}</span>}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.designation}</span>
                          </>
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
