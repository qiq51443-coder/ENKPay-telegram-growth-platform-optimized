import React from 'react';
import { theme } from '../theme';

interface LoadingScreenProps {
  progress: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ progress }) => {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: theme.bgPrimary,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
    }}>
      <style>{`
        @keyframes enkpay-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      {/* Pixel art logo */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: '2px',
        }}>
          {Array.from({ length: 64 }).map((_, i) => {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const isLit = (row + col) % 2 === 0 || (row === 3 && col >= 2 && col <= 5);
            return (
              <div key={i} style={{
                backgroundColor: isLit ? theme.accent : theme.bgCard,
                borderRadius: '1px',
              }} />
            );
          })}
        </div>
        <div style={{
          fontSize: '22px',
          fontWeight: 'bold',
          color: theme.text,
          letterSpacing: '2px',
        }}>
          LOADING
        </div>
      </div>

      {/* Spinner */}
      <div style={{
        width: '32px',
        height: '32px',
        border: `3px solid ${theme.bgCard}`,
        borderTopColor: theme.accent,
        borderRadius: '50%',
        animation: 'enkpay-spin 0.8s linear infinite',
      }} />

      {/* Progress bar */}
      <div style={{
        width: '200px',
        height: '8px',
        backgroundColor: theme.bgCard,
        borderRadius: '4px',
        overflow: 'hidden',
        border: `1px solid ${theme.border}`,
      }}>
        <div style={{
          width: `${progress}%`,
          height: '100%',
          backgroundColor: theme.accent,
          borderRadius: '4px',
          transition: 'width 0.1s ease',
        }} />
      </div>

      <div style={{ color: theme.textSecondary, fontSize: '14px' }}>
        {progress}%
      </div>

      <div style={{ color: theme.textSecondary, fontSize: '12px', opacity: 0.7 }}>
        加载中，请稍候... / Loading, please wait...
      </div>
    </div>
  );
};
