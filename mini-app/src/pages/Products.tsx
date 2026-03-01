import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { api } from '../services/api';

interface Product {
  id: string;
  name: string;
  image_url: string;
  price: number;
  description: string;
}

export const Products: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const data = await api.get('/nft/products?limit=9');
      setProducts(data.data?.products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: '20px' }}>🎨 定期产品</h1>

      {loading ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>加载中...</div>
      ) : products.length === 0 ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>暂无产品</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
        }}>
          {products.map(product => (
            <div
              key={product.id}
              style={{
                backgroundColor: theme.bgCard,
                borderRadius: '10px',
                overflow: 'hidden',
                border: `1px solid ${theme.border}`,
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: '100%',
                aspectRatio: '1',
                backgroundColor: theme.bgCardHover,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
              }}>
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : '🖼️'}
              </div>
              <div style={{ padding: '8px' }}>
                <div style={{ color: theme.text, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{product.name}</div>
                <div style={{ color: theme.accent, fontSize: '11px' }}>${parseFloat(String(product.price)).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
