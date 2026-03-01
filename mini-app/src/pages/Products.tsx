import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { api } from '../services/api';

interface Product {
  id: string;
  name: string;
  title?: string;
  image_url?: string;
  cover_image_url?: string;
  price: number;
  description?: string;
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {products.map(product => {
            const img = product.cover_image_url || product.image_url;
            const name = product.title || product.name;
            return (
              <div
                key={product.id}
                onClick={() => setSelected(product)}
                style={{
                  backgroundColor: theme.bgCard, borderRadius: '10px', overflow: 'hidden',
                  border: `1px solid ${theme.border}`, cursor: 'pointer',
                }}
              >
                <div style={{ width: '100%', aspectRatio: '1', backgroundColor: theme.bgCardHover, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>
                  {img ? <img src={img} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🖼️'}
                </div>
                <div style={{ padding: '8px' }}>
                  <div style={{ color: theme.text, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{name}</div>
                  <div style={{ color: theme.accent, fontSize: '11px' }}>${parseFloat(String(product.price)).toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product detail modal */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200, padding: '16px' }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '400px', border: `1px solid ${theme.border}` }}
            onClick={e => e.stopPropagation()}
          >
            {(selected.cover_image_url || selected.image_url) && (
              <img src={selected.cover_image_url || selected.image_url} alt={selected.title || selected.name} style={{ width: '100%', borderRadius: '10px', marginBottom: '12px', maxHeight: '200px', objectFit: 'cover' }} />
            )}
            <h2 style={{ color: theme.text, fontSize: '18px', marginBottom: '8px' }}>{selected.title || selected.name}</h2>
            {selected.description && <p style={{ color: theme.textSecondary, fontSize: '13px', lineHeight: '1.6', marginBottom: '12px' }}>{selected.description}</p>}
            <div style={{ color: theme.accent, fontWeight: '600', fontSize: '16px', marginBottom: '16px' }}>
              价格：${parseFloat(String(selected.price)).toFixed(2)} USDT
            </div>
            <button
              onClick={() => setSelected(null)}
              style={{ width: '100%', padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px' }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
