import { useNavigate } from 'react-router-dom';
import type { Asset } from '../lib/types';
import { StatusBadge } from './StatusBadge';

const CONDITION_STYLE: Record<string, { bg: string; color: string }> = {
  new:       { bg: '#e6f4ea', color: '#1e7e34' },
  excellent: { bg: '#e8f5e9', color: '#2e7d32' },
  good:      { bg: '#e3f2fd', color: '#1565c0' },
  fair:      { bg: '#fff8e1', color: '#f57f17' },
  poor:      { bg: '#fce4ec', color: '#c62828' },
  damaged:   { bg: '#ffebee', color: '#b71c1c' },
};

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
  compact?: boolean;
  actions?: React.ReactNode;
}

export function AssetCard({ asset, compact, actions }: Props) {
  const nav = useNavigate();
  const icon = TYPE_ICON[asset.asset_type?.toLowerCase()] ?? TYPE_ICON.default;

  return (
    <div
      className="md-card"
      style={{
        padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', height: '100%',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-3)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-1)')}
    >
      <div
        onClick={() => nav(`/asset/${encodeURIComponent(asset.asset_id)}`)}
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: 'var(--primary-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span className="icon" style={{ color: 'var(--primary)', fontSize: 22 }}>{icon}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 14,
              color: 'var(--text-1)', lineHeight: 1.2,
            }}>
              {asset.asset_id}
            </div>
            <div style={{
              fontSize: 12, color: 'var(--text-2)', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {[asset.brand, asset.model].filter(Boolean).join(' ') || '—'}
            </div>
          </div>
          <StatusBadge status={asset.status} />
        </div>

        {/* Spec tags */}
        {!compact && (asset.asset_type || asset.memory_ram || asset.storage || asset.condition) && (
          <div style={{ padding: '0 16px 10px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {asset.asset_type && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 6,
                background: 'var(--surface-2)', color: 'var(--text-3)', fontWeight: 500,
              }}>
                {asset.asset_type}
              </span>
            )}
            {asset.memory_ram && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 6,
                background: 'var(--surface-2)', color: 'var(--text-2)', fontWeight: 500,
              }}>
                {asset.memory_ram}
              </span>
            )}
            {asset.storage && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 6,
                background: 'var(--surface-2)', color: 'var(--text-2)', fontWeight: 500,
              }}>
                {asset.storage}
              </span>
            )}
            {asset.condition && (() => {
              const cs = CONDITION_STYLE[asset.condition.toLowerCase()] ?? { bg: 'var(--surface-2)', color: 'var(--text-2)' };
              return (
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
                  background: cs.bg, color: cs.color,
                }}>
                  {asset.condition}
                </span>
              );
            })()}
          </div>
        )}

        {/* Assignee — always shown when not compact so rows align */}
        {!compact && (
          <div style={{
            marginTop: 'auto', padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 6,
            minHeight: 36,
          }}>
            {asset.employee_display ? (
              <>
                <span className="icon" style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>person</span>
                <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {asset.employee_display}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Unassigned</span>
            )}
          </div>
        )}
      </div>

      {actions && (
        <div
          style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--border)' }}
          onClick={e => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
