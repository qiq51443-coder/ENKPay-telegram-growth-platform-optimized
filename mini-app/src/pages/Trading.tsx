import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { api } from '../services/api';

interface TradingPair {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
}

export const Trading: React.FC = () => {
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPairs();
  }, []);

  const fetchPairs = async () => {
    try {
      const data = await api.get('/trading/pairs');
      setPairs(data.data?.pairs || []);
    } catch {
      // Use mock data if API fails
      setPairs([
        { id: '1', symbol: 'BTC/USDT', name: 'Bitcoin', price: 65000, change_24h: 2.5 },
        { id: '2', symbol: 'ETH/USDT', name: 'Ethereum', price: 3200, change_24h: -1.2 },
        { id: '3', symbol: 'BNB/USDT', name: 'BNB', price: 420, change_24h: 0.8 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: '20px' }}>📈 即时交易</h1>

      {loading ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pairs.map(pair => (
            <div
              key={pair.id}
              style={{
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                padding: '16px',
                border: `1px solid ${theme.border}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>{pair.symbol}</div>
                  <div style={{ color: theme.textSecondary, fontSize: '12px' }}>{pair.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: theme.text, fontWeight: '600' }}>${pair.price.toLocaleString()}</div>
                  <div style={{ color: pair.change_24h >= 0 ? theme.success : theme.danger, fontSize: '13px' }}>
                    {pair.change_24h >= 0 ? '+' : ''}{pair.change_24h}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
