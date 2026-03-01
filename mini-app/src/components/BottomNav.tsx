import React from 'react';
import { theme } from '../theme';

type TabKey = 'trading' | 'auction' | 'products' | 'charity' | 'profile';

interface BottomNavProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'trading', label: '即时交易', icon: '📈' },
  { key: 'auction', label: '竞拍', icon: '🎯' },
  { key: 'products', label: '定期产品', icon: '🎨' },
  { key: 'charity', label: '公益活动', icon: '❤️' },
  { key: 'profile', label: '个人中心', icon: '👤' },
];

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '60px',
      backgroundColor: theme.bgCard,
      borderTop: `1px solid ${theme.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      zIndex: 100,
    }}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          style={{
            flex: 1,
            height: '100%',
            border: 'none',
            background: 'none',
            color: activeTab === tab.key ? theme.accent : theme.textSecondary,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            cursor: 'pointer',
            transition: 'color 0.2s',
          }}
        >
          <span style={{ fontSize: '20px' }}>{tab.icon}</span>
          <span style={{ fontSize: '10px', fontWeight: activeTab === tab.key ? '600' : '400' }}>
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
};
