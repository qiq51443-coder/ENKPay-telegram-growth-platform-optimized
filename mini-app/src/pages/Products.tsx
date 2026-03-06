import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { api } from '../services/api';
import { useLang } from '../context/LanguageContext';

interface Product {
  id: string;
  name: string;
  image_url: string;
  price: number;
  description: string;
  daily_yield_rate?: number;
  term_days?: number;
  current_holders?: number;
  max_holders?: number;
  is_purchase_limited?: boolean;
  max_purchases_per_user?: number;
  status?: string;
}

function getGradient(price: number): string {
  if (price < 500) return 'linear-gradient(135deg, #1a5e36, #27ae60)';
  if (price < 2000) return 'linear-gradient(135deg, #1a3a5e, #2980b9)';
  return 'linear-gradient(135deg, #4a1a5e, #8e44ad)';
}

function formatAmount(price: number): string {
  return '$' + price.toLocaleString('en-US');
}

export const Products: React.FC = () => {
  const { t } = useLang();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPurchase, setShowPurchase] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseMsg, setPurchaseMsg] = useState('');

  const selected = products.find(p => p.id === selectedId) || null;

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const data = await api.get('/nft/products?limit=9');
      setProducts(data.data?.data || data.data?.products || []);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!selected) return;
    setPurchasing(true);
    setPurchaseMsg('');
    try {
      await api.post(`/nft/products/${selected.id}/purchase`, {});
      setPurchaseMsg('✅ ' + t('product_purchase_success'));
      setTimeout(() => {
        setShowPurchase(false);
        setPurchaseMsg('');
      }, 2000);
    } catch (e: any) {
      setPurchaseMsg(`❌ ${e?.response?.data?.error || t('product_purchase_failed')}`);
    } finally {
      setPurchasing(false);
    }
  };

  if (selectedId && selected) {
    const holders = selected.current_holders ?? 0;
    const maxHolders = selected.max_holders ?? 100;
    const holdersProgress = maxHolders > 0 ? Math.min((holders / maxHolders) * 100, 100) : 0;
    const dailyRate = selected.daily_yield_rate ?? 0.005;
    const termDays = selected.term_days ?? 30;
    const expectedYield = selected.price * dailyRate * termDays;

    return (
      <div style={{ paddingBottom: '80px' }}>
        {/* Back button */}
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setSelectedId(null)}
            style={{ background: 'none', border: 'none', color: theme.textSecondary, fontSize: '16px', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            {t('back')}
          </button>
        </div>

        {/* Product image */}
        <div style={{ width: '100%', height: '220px', backgroundColor: theme.bgCardHover, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {selected.image_url
            ? <img src={selected.image_url} alt={selected.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ background: getGradient(selected.price), width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>💰</div>
          }
        </div>

        <div style={{ padding: '16px' }}>
          {/* Title + status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', margin: 0 }}>{selected.name}</h2>
            <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', backgroundColor: theme.success, color: '#fff' }}>
              {selected.status === 'active' || !selected.status ? t('product_active') : t('product_offline')}
            </span>
          </div>

          {/* Holders progress */}
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '14px', marginBottom: '12px', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{t('product_holders')}: {holders}</span>
              <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{t('product_total')}: {maxHolders}</span>
            </div>
            <div style={{ height: '6px', backgroundColor: theme.border, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${holdersProgress}%`, height: '100%', backgroundColor: '#F0B90B', borderRadius: '3px' }} />
            </div>
          </div>

          {/* Details */}
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '14px', marginBottom: '12px', border: `1px solid ${theme.border}` }}>
            {[
              [t('product_term'), `${termDays} ${t('product_term_days')}`],
              [t('product_daily_rate'), `${(dailyRate * 100).toFixed(2)}%`],
              [t('product_min_purchase'), formatAmount(selected.price)],
              [t('product_expected_yield'), `$${expectedYield.toFixed(2)}`],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{label}</span>
                <span style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Purchase limit info */}
          {selected.is_purchase_limited && (
            <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>
              {t('product_purchase_limit')} {selected.max_purchases_per_user ?? 1} {t('product_purchase_limit_times')}
            </div>
          )}

          {/* Description */}
          {selected.description && (
            <p style={{ color: theme.textSecondary, fontSize: '13px', lineHeight: '1.6', marginBottom: '16px' }}>
              {selected.description}
            </p>
          )}

          {/* Purchase button */}
          <button
            onClick={() => setShowPurchase(true)}
            style={{
              width: '100%', padding: '14px', backgroundColor: '#F0B90B', color: '#000',
              border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            {t('product_purchase_btn')}
          </button>
        </div>

        {/* Purchase confirm modal */}
        {showPurchase && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', width: '320px', maxWidth: '90vw' }}>
              <h3 style={{ color: theme.text, margin: '0 0 16px' }}>{t('product_confirm_purchase')}</h3>
              {[
                [t('product_label'), selected.name],
                [t('product_amount'), formatAmount(selected.price)],
                [t('product_term'), `${termDays} ${t('product_term_days')}`],
                [t('product_expected_yield'), `$${expectedYield.toFixed(2)}`],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                  <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{label}</span>
                  <span style={{ color: theme.text, fontSize: '13px' }}>{val}</span>
                </div>
              ))}
              {purchaseMsg && (
                <div style={{ color: purchaseMsg.startsWith('✅') ? '#22c55e' : '#ef4444', fontSize: '13px', textAlign: 'center', marginTop: '12px' }}>{purchaseMsg}</div>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  onClick={() => { setShowPurchase(false); setPurchaseMsg(''); }}
                  style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handlePurchase}
                  disabled={purchasing}
                  style={{ flex: 1, padding: '12px', backgroundColor: '#F0B90B', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', opacity: purchasing ? 0.7 : 1 }}
                >
                  {purchasing ? t('processing') : t('product_confirm_purchase')}
                </button>
              </div>
              {!purchaseMsg && (
                <p style={{ color: theme.textSecondary, fontSize: '11px', textAlign: 'center', marginTop: '8px' }}>
                  {t('product_auto_yield_msg')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', paddingBottom: '80px' }}>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: '20px' }}>{t('products_title')}</h1>

      {loading ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
      ) : products.length === 0 ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('no_products')}</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
        }}>
          {products.map(product => (
            <div
              key={product.id}
              onClick={() => setSelectedId(product.id)}
              style={{
                background: getGradient(product.price),
                borderRadius: '10px',
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: `1px solid ${theme.border}`,
              }}
            >
              <span style={{ color: '#fff', fontWeight: '700', fontSize: '16px', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                {formatAmount(product.price)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
