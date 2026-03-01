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
  const [selected, setSelected] = useState<Product | null>(null);

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
              onClick={() => setSelected(product)}
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

      {/* Product detail modal */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            zIndex: 200, padding: '0',
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              backgroundColor: theme.bgCard,
              borderRadius: '16px 16px 0 0',
              padding: '20px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: `1px solid ${theme.border}`,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: '100%', height: '220px', backgroundColor: theme.bgCardHover, borderRadius: '10px', overflow: 'hidden', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {selected.image_url
                ? <img src={selected.image_url} alt={selected.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '64px' }}>🖼️</span>}
            </div>
            <h2 style={{ color: theme.text, fontSize: '18px', marginBottom: '8px' }}>{selected.name}</h2>
            <div style={{ color: theme.accent, fontSize: '20px', fontWeight: '700', marginBottom: '12px' }}>${parseFloat(String(selected.price)).toFixed(2)}</div>
            {selected.description && (
              <p style={{ color: theme.textSecondary, fontSize: '13px', lineHeight: '1.6', marginBottom: '16px' }}>{selected.description}</p>
            )}
            <button
              onClick={() => setSelected(null)}
              style={{
                width: '100%', padding: '12px', backgroundColor: theme.bgCardHover,
                color: theme.text, border: `1px solid ${theme.border}`,
                borderRadius: '8px', fontSize: '14px', cursor: 'pointer',
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
