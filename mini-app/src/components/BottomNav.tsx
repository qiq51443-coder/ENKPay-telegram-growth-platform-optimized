import React from 'react';
import { useLang } from '../context/LanguageContext';

type TabKey = 'trading' | 'auction' | 'products' | 'charity' | 'profile';

interface BottomNavProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

const ACTIVE_COLOR = '#F0B90B';
const INACTIVE_COLOR = '#8899AA';

const TradingIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? ACTIVE_COLOR : INACTIVE_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const AuctionIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? ACTIVE_COLOR : INACTIVE_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M8 8V6a4 4 0 0 1 8 0v2" />
    <line x1="12" y1="13" x2="12" y2="16" />
    <circle cx="12" cy="13" r="1" fill={active ? ACTIVE_COLOR : INACTIVE_COLOR} stroke="none" />
  </svg>
);

const ProductsIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? ACTIVE_COLOR : INACTIVE_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const CharityIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? ACTIVE_COLOR : INACTIVE_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const ProfileIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? ACTIVE_COLOR : INACTIVE_COLOR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const tabDefs: Array<{ key: TabKey; labelKey: string; Icon: React.FC<{ active: boolean }> }> = [
  { key: 'trading', labelKey: 'nav_trading', Icon: TradingIcon },
  { key: 'auction', labelKey: 'nav_auction', Icon: AuctionIcon },
  { key: 'products', labelKey: 'nav_products', Icon: ProductsIcon },
  { key: 'charity', labelKey: 'nav_charity', Icon: CharityIcon },
  { key: 'profile', labelKey: 'nav_profile', Icon: ProfileIcon },
];

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const { t } = useLang();

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '60px',
      backgroundColor: 'rgba(26, 39, 66, 0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderTop: '1px solid rgba(42, 58, 90, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      zIndex: 100,
    }}>
      {tabDefs.map(({ key, labelKey, Icon }) => {
        const isActive = activeTab === key;
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            style={{
              flex: 1,
              height: '100%',
              border: 'none',
              background: 'none',
              color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              cursor: 'pointer',
              transition: 'color 0.2s',
              padding: 0,
            }}
          >
            <Icon active={isActive} />
            <span style={{ fontSize: '10px', fontWeight: isActive ? '600' : '400', color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR }}>
              {t(labelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
};
