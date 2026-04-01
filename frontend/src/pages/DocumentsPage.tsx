import { useState } from 'react';
import { ReportPage } from './ReportPage';
import { OverlayPage } from './OverlayPage';

type DocTab = 'report' | 'overlay';

const TABS: { key: DocTab; label: string; icon: string }[] = [
  { key: 'report',  label: 'Report Generator', icon: 'picture_as_pdf' },
  { key: 'overlay', label: 'Print Overlay',     icon: 'print'          },
];

export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<DocTab>('report');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid var(--border)',
        marginBottom: 24,
        gap: 0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 22px',
                border: 'none',
                borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -2,
                background: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                fontFamily: "'Google Sans', sans-serif",
                color: active ? 'var(--primary)' : 'var(--text-2)',
                transition: 'color .15s, border-color .15s',
                borderRadius: 0,
              }}
            >
              <span className="icon" style={{ fontSize: 18 }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/*
        Both sub-pages stay mounted at all times via display:none/block.
        This preserves full state (OverlayPage 6-step wizard) when switching tabs.
      */}
      <div style={{ display: activeTab === 'report' ? 'block' : 'none' }}>
        <ReportPage />
      </div>
      <div style={{ display: activeTab === 'overlay' ? 'block' : 'none' }}>
        <OverlayPage />
      </div>

    </div>
  );
}
