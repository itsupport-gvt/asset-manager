import { useNavigate } from 'react-router-dom';
import type { Asset } from '../lib/types';
import { StatusBadge } from './StatusBadge';

const TYPE_ICON: Record<string, string> = {
  laptop: 'laptop', desktop: 'desktop_windows', monitor: 'monitor',
  'smart tv': 'tv', server: 'dns', printer: 'print',
  'mobile phone': 'smartphone', keyboard: 'keyboard', mouse: 'mouse',
  headset: 'headset', webcam: 'videocam', 'ip phone': 'call', 'land phone': 'call',
  ssd: 'storage', hdd: 'storage', ram: 'memory', memory: 'memory', cpu: 'memory',
  'docking station': 'dock', 'usb hub': 'usb', adapter: 'power', 'power adapter': 'power',
  phone: 'smartphone', tablet: 'tablet', camera: 'camera', server2: 'dns', default: 'devices',
};

interface Props {
  asset: Asset;
  /** When true: hides the assignee chip and shows compact action buttons inline */
  compact?: boolean;
  /** Extra action buttons to render in the footer (used by EmployeePage) */
  actions?: React.ReactNode;
}

export function AssetCard({ asset, compact, actions }: Props) {
  const nav = useNavigate();
  const icon = TYPE_ICON[asset.asset_type?.toLowerCase()] ?? TYPE_ICON.default;

  return (
    <div
      className="md-card"
      style={{ padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* Main clickable area */}
      <div
        onClick={() => nav(`/asset/${encodeURIComponent(asset.asset_id)}`)}
        style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}
      >
        {/* Icon */}
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: 'var(--primary-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span className="icon" style={{ color: 'var(--primary)', fontSize: 22 }}>{icon}</span>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>
            {asset.asset_id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {asset.brand} {asset.model}
          </div>
          {!compact && asset.employee_display && (
            <div style={{ marginTop: 5 }}>
              <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: 'var(--primary-bg)', color: 'var(--primary)', fontWeight: 500 }}>
                <span className="icon" style={{ fontSize: 13 }}>person</span>
                {asset.employee_display}
              </span>
            </div>
          )}
        </div>

        {/* Status badge — right aligned */}
        <StatusBadge status={asset.status} />
      </div>

      {/* Footer row — only shown when actions are provided (EmployeePage) */}
      {actions && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 0,
            borderTop: '1px solid var(--border)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
