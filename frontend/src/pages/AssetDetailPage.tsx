import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Asset, ActivityLogItem } from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';

const TYPE_ICON: Record<string, string> = {
  laptop: 'laptop', desktop: 'desktop_windows', monitor: 'monitor',
  'smart tv': 'tv', server: 'dns', printer: 'print',
  'mobile phone': 'smartphone', keyboard: 'keyboard', mouse: 'mouse',
  headset: 'headset', webcam: 'videocam', 'ip phone': 'call', 'land phone': 'call',
  ssd: 'storage', hdd: 'storage', ram: 'memory', memory: 'memory',
  cpu: 'memory', gpu: 'memory', 'docking station': 'dock', 'usb hub': 'usb',
  adapter: 'power', 'power adapter': 'power',
};
function assetIcon(type: string) { return TYPE_ICON[type?.toLowerCase()] ?? 'devices'; }

const CONDITION_COLOR: Record<string, { bg: string; text: string; icon: string }> = {
  new: { bg: '#e6f4ea', text: '#1e7e34', icon: 'new_releases' },
  excellent: { bg: '#e8f5e9', text: '#2e7d32', icon: 'verified' },
  good: { bg: '#e3f2fd', text: '#1565c0', icon: 'thumb_up' },
  fair: { bg: '#fff8e1', text: '#f57f17', icon: 'warning_amber' },
  poor: { bg: '#fce4ec', text: '#c62828', icon: 'report' },
  damaged: { bg: '#ffebee', text: '#b71c1c', icon: 'broken_image' },
};
function conditionStyle(cond: string) {
  return CONDITION_COLOR[cond?.toLowerCase()] ?? { bg: 'var(--surface-2)', text: 'var(--text-2)', icon: 'help' };
}

function InfoRow({ icon, label, value, mono, link, highlight }: {
  icon: string; label: string; value?: string; mono?: boolean;
  link?: string; highlight?: { bg: string; text: string };
}) {
  if (!value || value === 'None' || value === 'Not Assigned') return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span className="icon icon-sm" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{icon}</span>
      <span style={{ width: 148, flexShrink: 0, fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
      {highlight ? (
        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600, background: highlight.bg, color: highlight.text }}>{value}</span>
      ) : link ? (
        <Link to={link} style={{ fontSize: 13, color: 'var(--primary)', fontFamily: mono ? 'monospace' : undefined, textDecoration: 'none', fontWeight: 500 }}>
          {value}
        </Link>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--text-1)', fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{value}</span>
      )}
    </div>
  );
}

function formatDate(val?: string): string {
  if (!val) return '';
  // Excel serial date (e.g. 46092)
  const n = Number(val);
  if (!isNaN(n) && n > 30000 && n < 60000) {
    const dt = new Date((n - 25569) * 86400 * 1000);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  // ISO or other parseable date string
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return val;
}

function formatPrice(val?: string): string {
  if (!val) return '';
  const n = parseFloat(val.replace(/[^\d.]/g, ''));
  if (isNaN(n)) return val;
  return `AED ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function SectionHeader({ icon, title, color = 'var(--primary)' }: { icon: string; title: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '2px solid var(--border)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="icon" style={{ color, fontSize: 18 }}>{icon}</span>
      </div>
      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>{title}</span>
    </div>
  );
}

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  assign:       { bg: 'rgba(76,175,80,.12)',  color: '#2e7d32' },
  return:       { bg: 'rgba(255,152,0,.12)',  color: '#b06000' },
  create:       { bg: 'var(--primary-bg)',    color: 'var(--primary)' },
  update:       { bg: 'rgba(156,39,176,.12)', color: '#7b1fa2' },
  swap:         { bg: 'rgba(33,150,243,.12)', color: '#1565c0' },
  'bulk return':{ bg: 'rgba(255,152,0,.12)',  color: '#b06000' },
};
function miniActionBadge(action: string) {
  const s = ACTION_COLORS[action.toLowerCase()] ?? { bg: 'var(--surface-2)', color: 'var(--text-2)' };
  return (
    <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      {action}
    </span>
  );
}
function fmtShort(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function AssetRecentActivity({ assetId }: { assetId: string }) {
  const nav = useNavigate();
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getActivity({ asset_id: assetId, page_size: 5 })
      .then(d => setItems(d.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) return null;
  if (!items.length) return null;

  return (
    <div className="md-card" style={{ padding: 22 }}>
      <SectionHeader icon="history" title="Recent Activity" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {items.map((item, i) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '8px 0',
            borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {miniActionBadge(item.action)}
                <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{item.employee_name}</span>
                {item.old_status && item.new_status && (
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{item.old_status} → {item.new_status}</span>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtShort(item.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => nav(`/activity?asset_id=${encodeURIComponent(assetId)}`)}
        style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        View all activity <span className="icon icon-sm">arrow_forward</span>
      </button>
    </div>
  );
}

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  async function syncAsset(assetId: string) {
    setSyncing(true); setSyncMsg('');
    try {
      const r = await fetch(`/api/asset/${encodeURIComponent(assetId)}/sync`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'Sync failed');
      setSyncMsg('Synced to Excel ✓');
    } catch (e: any) {
      setSyncMsg(e.message || 'Sync failed');
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 4000);
  }

  useEffect(() => {
    if (!id) return;
    api.getAsset(decodeURIComponent(id))
      .then(setAsset)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12, color: 'var(--text-2)' }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      Loading asset details…
    </div>
  );
  if (error) return <div style={{ padding: 16, background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10 }}>{error}</div>;
  if (!asset) return null;

  const isAssigned = (asset.status || '').toLowerCase() === 'active';
  const cond = conditionStyle(asset.condition);
  const icon = assetIcon(asset.asset_type);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Back Button */}
      <button onClick={() => nav(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: 0, width: 'fit-content' }}>
        <span className="icon icon-sm">arrow_back</span> Back
      </button>

      {/* ── Hero Header Card ─── */}
      <div className="md-card" style={{ padding: 28, position: 'relative', overflow: 'hidden' }}>
        {/* Decorative gradient blob */}
        <div style={{ position: 'absolute', top: -80, right: -60, width: 280, height: 280, background: 'var(--primary-bg)', borderRadius: '50%', opacity: .6, pointerEvents: 'none' }} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {/* Big icon */}
            <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--primary-bg)', border: '2px solid rgba(26,115,232,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'var(--shadow-1)' }}>
              <span className="icon" style={{ color: 'var(--primary)', fontSize: 36 }}>{icon}</span>
            </div>
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <h1 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 26, color: 'var(--text-1)', margin: 0 }}>{asset.asset_id}</h1>
                <StatusBadge status={asset.status} />
                {asset.condition && (
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: cond.bg, color: cond.text, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="icon" style={{ fontSize: 14 }}>{cond.icon}</span>
                    {asset.condition}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 14, color: 'var(--text-2)', margin: 0, fontWeight: 500 }}>
                {[asset.brand, asset.model].filter(Boolean).join(' ')}
                {asset.asset_type && <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12 }}>{asset.asset_type}</span>}
              </p>
              {asset.serial_number && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 0', fontFamily: 'monospace' }}>SN: {asset.serial_number}</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {!isAssigned && (
              <button onClick={() => nav(`/assign/${encodeURIComponent(asset.asset_id)}`)} className="md-btn md-btn-primary">
                <span className="icon icon-sm">person_add</span> Assign
              </button>
            )}
            {isAssigned && (
              <>
                <button onClick={() => nav(`/swap/${encodeURIComponent(asset.asset_id)}`)} className="md-btn" style={{ background: 'var(--primary-bg)', color: 'var(--primary)', border: '1px solid rgba(26,115,232,.2)' }}>
                  <span className="icon icon-sm">swap_horiz</span> Swap
                </button>
                <button onClick={() => nav(`/return/${encodeURIComponent(asset.asset_id)}`)} className="md-btn" style={{ background: 'var(--warn-bg)', color: '#b06000', border: '1px solid rgba(249,171,0,.3)' }}>
                  <span className="icon icon-sm">assignment_return</span> Return
                </button>
              </>
            )}
            <button onClick={() => nav(`/edit/${encodeURIComponent(asset.asset_id)}`)} className="md-btn md-btn-outlined">
              <span className="icon icon-sm">edit</span> Edit
            </button>
            <button
              onClick={() => syncAsset(asset.asset_id)}
              disabled={syncing}
              className="md-btn"
              title="Push this asset to Excel now"
              style={{ background: 'var(--surface-2)', color: syncing ? 'var(--text-3)' : 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              <span className="icon icon-sm" style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
                {syncing ? 'sync' : 'cloud_upload'}
              </span>
              {syncing ? 'Syncing…' : 'Sync to Excel'}
            </button>
            {syncMsg && (
              <span style={{ fontSize: 12, color: syncMsg.includes('✓') ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="icon icon-sm">{syncMsg.includes('✓') ? 'check_circle' : 'error'}</span>
                {syncMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Detail Grid ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>

        {/* Assignment Card */}
        <div className="md-card" style={{ padding: 22 }}>
          <SectionHeader icon="person" title="Assignment" color={isAssigned ? 'var(--success)' : 'var(--text-3)'} />
          {isAssigned && asset.employee_display ? (
            <div style={{ marginBottom: 16 }}>
              <Link
                to={`/employee/${encodeURIComponent(asset.username)}`}
                style={{ textDecoration: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--success-bg)', border: '1px solid #ceead6', transition: 'opacity .15s' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', border: '2px solid var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--success)' }}>{asset.employee_display[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>{asset.employee_display}</div>
                    <div style={{ fontSize: 11, color: 'var(--success)', opacity: .7 }}>Click to view profile →</div>
                  </div>
                </div>
              </Link>
            </div>
          ) : (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', marginBottom: 14, fontSize: 13, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="icon icon-sm">person_off</span> Not currently assigned
            </div>
          )}
          <InfoRow icon="badge" label="Assignment ID" value={asset.assignment_id} mono />
          <InfoRow icon="event" label="Date Assigned" value={formatDate(asset.date_assigned)} />
          <InfoRow icon="place" label="Location" value={asset.location} />
        </div>

        {/* Hardware Card */}
        <div className="md-card" style={{ padding: 22 }}>
          <SectionHeader icon="memory" title="Hardware Details" />
          <InfoRow icon="tag"           label="Asset Type"    value={asset.asset_type} />
          <InfoRow icon="qr_code"       label="Serial Number" value={asset.serial_number} mono />
          <InfoRow icon="construction"  label="Condition"     value={asset.condition} highlight={cond} />
          <InfoRow icon="developer_board" label="Processor"   value={asset.processor} />
          <InfoRow icon="memory"        label="RAM"           value={asset.memory_ram} />
          <InfoRow icon="videogame_asset" label="Graphics"    value={asset.graphics} />
          <InfoRow icon="monitor"       label="Screen Size"   value={asset.screen_size} />
          <InfoRow icon="laptop_windows" label="OS"           value={asset.os} />
          <InfoRow icon="storage"       label="Primary Drive" value={asset.storage} />
          <InfoRow icon="storage"       label="Secondary Drive" value={asset.storage_2} />
        </div>

        {/* Charger Card — Laptop only */}
        {asset.asset_type === 'Laptop' && (asset.charger_model || asset.charger_serial || asset.charger_notes) && (
          <div className="md-card" style={{ padding: 22, borderLeft: '3px solid var(--primary)' }}>
            <SectionHeader icon="power" title="Charger Details" />
            <InfoRow icon="tag" label="Charger Model" value={asset.charger_model} />
            <InfoRow icon="qr_code" label="Charger Serial" value={asset.charger_serial} mono />
            {asset.charger_notes && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="icon icon-sm">sticky_note_2</span> Notes
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-1)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{asset.charger_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Purchase Card */}
        <div className="md-card" style={{ padding: 22 }}>
          <SectionHeader icon="receipt_long" title="Purchase Details" color="#b06000" />
          <InfoRow icon="calendar_today" label="Purchase Date"  value={formatDate(asset.purchase_date)} />
          <InfoRow icon="payments"       label="Purchase Price" value={formatPrice(asset.purchase_price)} />
          <InfoRow icon="storefront"     label="Vendor"         value={asset.vendor} />
          <InfoRow icon="receipt"        label="Invoice Ref"    value={asset.invoice_ref} mono />
          <InfoRow icon="shield"         label="Warranty End"   value={formatDate(asset.warranty_end)} />
        </div>

        {/* Recent Activity */}
        <AssetRecentActivity assetId={asset.asset_id} />

        {/* Notes & Security — only show if there's data */}
        {(asset.notes || asset.pin_password) && (
          <div className="md-card" style={{ padding: 22 }}>
            <SectionHeader icon="lock" title="Notes & Security" color="var(--danger)" />
            {asset.pin_password && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', marginBottom: 14, border: '1px solid rgba(220,53,69,.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="icon icon-sm">key</span> PIN / Password
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 15, color: 'var(--text-1)', fontWeight: 600, letterSpacing: 1 }}>{asset.pin_password}</span>
              </div>
            )}
            {asset.notes && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="icon icon-sm">sticky_note_2</span> Notes
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-1)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{asset.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Asset ID QR Code row ─── */}
      <div className="md-card" style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="icon" style={{ color: 'var(--primary)', fontSize: 24 }}>qr_code_2</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>Asset QR Code</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Scan to open this asset on any device</div>
          </div>
        </div>
        <img
          src={`/api/asset-qr/${encodeURIComponent(asset.asset_id)}`}
          alt="Asset QR"
          style={{ width: 80, height: 80, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', padding: 4, objectFit: 'contain' }}
          onError={e => (e.currentTarget.style.display = 'none')}
        />
      </div>
    </div>
  );
}
