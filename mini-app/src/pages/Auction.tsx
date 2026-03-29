import React, { useEffect, useState, useCallback } from 'react';
import { theme } from '../theme';
import { useLang } from '../context/LanguageContext';
import {
  getAuctions,
  getAuctionDetail,
  joinAuction,
  getAuctionResults,
  getMyAuctions,
  redeemAuction,
} from '../services/api';

type AuctionView = 'list' | 'detail' | 'results' | 'my';

interface Auction {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  product_image?: string;
  product_value: number;
  participant_count: number;
  per_person_cost: number;
  max_purchases_per_user: number;
  platform_fee_percent: number;
  winner_payout: number;
  current_participants: number;
  status: 'active' | 'completed' | 'expired' | 'cancelled';
  winner_unique_id?: string;
  drawn_at?: string;
  expires_at: string;
  product_description?: string;
  show_in_mini_app?: boolean;
}

interface AuctionResult {
  id: string;
  auction_id: string;
  winner_unique_id?: string;
  product_title?: string;
  product_value?: number;
  payout_amount?: number;
  total_participants?: number;
  is_redeemed: boolean;
  created_at: string;
}

interface MyAuction {
  id: string;
  auction_id: string;
  title: string;
  auction_status: string;
  is_winner: boolean;
  refunded: boolean;
  quantity: number;
  amount: number;
  winner_unique_id?: string;
  winner_payout?: number;
  result_id?: string;
  is_redeemed?: boolean;
}

function useCountdown(expiresAt: string, expiredLabel: string): string {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining(expiredLabel); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return remaining;
}

const statusKeys: Record<string, { textKey: string; color: string }> = {
  active: { textKey: 'auction_active', color: '#22c55e' },
  completed: { textKey: 'auction_completed', color: '#3b82f6' },
  expired: { textKey: 'auction_expired', color: '#6b7280' },
  cancelled: { textKey: 'auction_cancelled', color: '#ef4444' },
};

const AuctionCard: React.FC<{ auction: Auction; onClick: () => void }> = ({ auction, onClick }) => {
  const { t } = useLang();
  const countdown = useCountdown(auction.expires_at, t('auction_expired_label'));
  const progress = auction.participant_count > 0
    ? Math.min((auction.current_participants / auction.participant_count) * 100, 100)
    : 0;
  const stKey = statusKeys[auction.status] || { textKey: auction.status, color: '#888' };
  const stText = t(stKey.textKey);

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        padding: '14px',
        border: `1px solid ${theme.border}`,
        cursor: 'pointer',
        marginBottom: '10px',
      }}
    >
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '8px', flexShrink: 0,
          backgroundColor: theme.bgCardHover,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {(auction.image_url || auction.product_image)
            ? <img src={auction.image_url || auction.product_image} alt={auction.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '28px' }}>🎁</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px', flex: 1 }}>{auction.title}</div>
            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: stKey.color, color: '#fff', marginLeft: '6px', whiteSpace: 'nowrap' }}>{stText}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ color: theme.textSecondary, fontSize: '12px' }}>{t('auction_per_person')}: <b style={{ color: theme.accent }}>${parseFloat(String(auction.per_person_cost)).toFixed(2)}</b></span>
            <span style={{ color: theme.textSecondary, fontSize: '12px' }}>{t('auction_value')}: ${parseFloat(String(auction.product_value)).toFixed(2)}</span>
          </div>
          <div style={{ marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textSecondary, marginBottom: '3px' }}>
              <span>{auction.current_participants}/{auction.participant_count} {t('auction_participants')}</span>
              <span>{auction.status === 'active' ? countdown : ''}</span>
            </div>
            <div style={{ height: '5px', backgroundColor: theme.bgCardHover, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', backgroundColor: theme.accent, borderRadius: '3px' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AuctionDetail: React.FC<{
  auctionId: string;
  onBack: () => void;
}> = ({ auctionId, onBack }) => {
  const { t } = useLang();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [joining, setJoining] = useState(false);
  const [msg, setMsg] = useState('');
  const countdown = useCountdown(auction?.expires_at || new Date().toISOString(), t('auction_expired_label'));

  useEffect(() => {
    getAuctionDetail(auctionId).then(d => setAuction(d.data)).catch(() => {}).finally(() => setLoading(false));
  }, [auctionId]);

  const handleJoin = async () => {
    if (!auction) return;
    setJoining(true);
    setMsg('');
    try {
      await joinAuction(auctionId, qty);
      setMsg('✅ ' + t('auction_join_success'));
      const d = await getAuctionDetail(auctionId);
      setAuction(d.data);
    } catch (e: any) {
      setMsg(`❌ ${e.response?.data?.error || t('auction_join_failed')}`);
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>;
  if (!auction) return <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('auction_not_found')}</div>;

  const progress = auction.participant_count > 0
    ? Math.min((auction.current_participants / auction.participant_count) * 100, 100)
    : 0;
  const stKey = statusKeys[auction.status] || { textKey: auction.status, color: '#888' };

  return (
    <div style={{ padding: '16px', paddingBottom: '80px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '16px', fontWeight: '700', padding: 0, marginBottom: '12px' }}>
        {t('back')}
      </button>

      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', overflow: 'hidden', border: `1px solid ${theme.border}`, marginBottom: '12px' }}>
        <div style={{ width: '100%', height: '200px', backgroundColor: theme.bgCardHover, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {(auction.image_url || auction.product_image)
            ? <img src={auction.image_url || auction.product_image} alt={auction.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '64px' }}>🎁</span>}
        </div>
        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', flex: 1 }}>{auction.title}</h2>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: stKey.color, color: '#fff', marginLeft: '8px' }}>{t(stKey.textKey)}</span>
          </div>
          {auction.description && <p style={{ color: theme.textSecondary, fontSize: '13px', marginBottom: '12px' }}>{auction.description}</p>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div style={{ backgroundColor: theme.bgCardHover, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
              <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{t('auction_value')}</div>
              <div style={{ color: theme.text, fontWeight: '600' }}>${parseFloat(String(auction.product_value)).toFixed(2)}</div>
            </div>
            <div style={{ backgroundColor: theme.bgCardHover, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
              <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{t('auction_per_person')}</div>
              <div style={{ color: theme.accent, fontWeight: '600' }}>${parseFloat(String(auction.per_person_cost)).toFixed(2)}</div>
            </div>
            <div style={{ backgroundColor: theme.bgCardHover, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
              <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{t('auction_cost')}</div>
              <div style={{ color: theme.text, fontWeight: '600' }}>{parseFloat(String(auction.platform_fee_percent)).toFixed(0)}%</div>
            </div>
            <div style={{ backgroundColor: theme.bgCardHover, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
              <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{t('auction_payout')}</div>
              <div style={{ color: '#22c55e', fontWeight: '600' }}>${parseFloat(String(auction.winner_payout)).toFixed(2)}</div>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' }}>
              <span>{auction.current_participants}/{auction.participant_count} {t('auction_participants')}</span>
              {auction.status === 'active' && <span>{countdown}</span>}
            </div>
            <div style={{ height: '8px', backgroundColor: theme.bgCardHover, borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', backgroundColor: theme.accent, borderRadius: '4px' }} />
            </div>
          </div>

          {auction.status === 'completed' && auction.winner_unique_id && (
            <div style={{ backgroundColor: '#fef9c3', borderRadius: '8px', padding: '10px', marginBottom: '12px', textAlign: 'center' }}>
              <span style={{ fontSize: '14px' }}>🏆 {t('auction_winner')}: <b>{auction.winner_unique_id}</b></span>
            </div>
          )}
        </div>
      </div>

      {auction.status === 'active' && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', border: `1px solid ${theme.border}` }}>
          <div style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>{t('auction_join')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{t('auction_qty')}:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: '28px', height: '28px', borderRadius: '50%', border: `1px solid ${theme.border}`, background: theme.bgCardHover, color: theme.text, cursor: 'pointer', fontSize: '16px' }}>-</button>
              <span style={{ color: theme.text, minWidth: '20px', textAlign: 'center' }}>{qty}</span>
              <button onClick={() => setQty(q => Math.min(q + 1, auction.max_purchases_per_user))} style={{ width: '28px', height: '28px', borderRadius: '50%', border: `1px solid ${theme.border}`, background: theme.bgCardHover, color: theme.text, cursor: 'pointer', fontSize: '16px' }}>+</button>
            </div>
            <span style={{ color: theme.textSecondary, fontSize: '12px' }}>({t('product_purchase_limit')} {auction.max_purchases_per_user})</span>
          </div>
          <div style={{ color: theme.textSecondary, fontSize: '13px', marginBottom: '12px' }}>
            {t('auction_total_cost')}: <b style={{ color: theme.accent }}>${(parseFloat(String(auction.per_person_cost)) * qty).toFixed(2)} USDT</b>
          </div>
          {msg && <div style={{ fontSize: '13px', color: msg.startsWith('✅') ? '#22c55e' : '#ef4444', marginBottom: '10px' }}>{msg}</div>}
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              width: '100%', padding: '12px', backgroundColor: theme.accent,
              color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px',
              fontWeight: '600', cursor: joining ? 'not-allowed' : 'pointer',
              opacity: joining ? 0.7 : 1,
            }}
          >
            {joining ? t('processing') : t('auction_join_btn')}
          </button>
        </div>
      )}
    </div>
  );
};

export const Auction: React.FC = () => {
  const { t } = useLang();
  const [view, setView] = useState<AuctionView>('list');
  const [selectedId, setSelectedId] = useState<string>('');
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [results, setResults] = useState<AuctionResult[]>([]);
  const [myAuctions, setMyAuctions] = useState<MyAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string>('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const [activeData, completedData] = await Promise.all([
        getAuctions('active'),
        getAuctions('completed'),
      ]);
      setAuctions([...(activeData.data || []), ...(completedData.data || [])]);
    } catch {
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAuctionResults();
      setResults(data.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMyAuctions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyAuctions();
      setMyAuctions(data.data || []);
    } catch {
      setMyAuctions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'list') fetchList();
    else if (view === 'results') fetchResults();
    else if (view === 'my') fetchMyAuctions();
  }, [view, fetchList, fetchResults, fetchMyAuctions]);

  const handleRedeem = async (resultId: string) => {
    setRedeeming(resultId);
    try {
      await redeemAuction(resultId);
      fetchMyAuctions();
    } catch (e: any) {
      alert(e.response?.data?.error || t('auction_join_failed'));
    } finally {
      setRedeeming('');
    }
  };

  if (view === 'detail') {
    return <AuctionDetail auctionId={selectedId} onBack={() => setView('list')} />;
  }

  return (
    <div style={{ padding: '16px', paddingBottom: '80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h1 style={{ color: theme.text, fontSize: '20px', margin: 0 }}>{t('auction_title')}</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setView('results')} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: view === 'results' ? '#F0B90B' : 'transparent', color: view === 'results' ? '#000' : theme.textSecondary, cursor: 'pointer' }}>{t('auction_tab_results')}</button>
          <button onClick={() => setView('my')} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: view === 'my' ? '#F0B90B' : 'transparent', color: view === 'my' ? '#000' : theme.textSecondary, cursor: 'pointer' }}>{t('auction_tab_my')}</button>
        </div>
      </div>

      {view === 'list' && (
        <>
          {loading
            ? <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
            : auctions.length === 0
              ? <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('auction_no_results')}</div>
              : auctions.map(a => (
                <AuctionCard
                  key={a.id}
                  auction={a}
                  onClick={() => { setSelectedId(a.id); setView('detail'); }}
                />
              ))
          }
        </>
      )}

      {view === 'results' && (
        <>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '16px', fontWeight: '700', padding: 0, marginBottom: '12px' }}>{t('back')}</button>
          {loading
            ? <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
            : results.length === 0
              ? <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('auction_no_results')}</div>
              : results.map(r => (
                <div key={r.id} style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '14px', border: `1px solid ${theme.border}`, marginBottom: '10px' }}>
                  <div style={{ color: theme.text, fontWeight: '600', marginBottom: '6px' }}>{r.product_title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textSecondary }}>
                    <span>{t('auction_winner')}: <b style={{ color: theme.accent }}>{r.winner_unique_id}</b></span>
                    <span>{t('auction_participants')}: {r.total_participants}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                    <span style={{ color: '#22c55e' }}>+${parseFloat(String(r.payout_amount || 0)).toFixed(2)}</span>
                  </div>
                </div>
              ))
          }
        </>
      )}

      {view === 'my' && (
        <>
          <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '16px', fontWeight: '700', padding: 0, marginBottom: '12px' }}>{t('back')}</button>
          {loading
            ? <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
            : myAuctions.length === 0
              ? <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('auction_no_my')}</div>
              : myAuctions.map(a => {
                let statusText = t('loading');
                let statusColor = theme.textSecondary;
                if (a.refunded) { statusText = t('auction_refunded'); statusColor = '#6b7280'; }
                else if (a.is_winner && a.is_redeemed) { statusText = t('auction_redeemed'); statusColor = '#22c55e'; }
                else if (a.is_winner) { statusText = t('auction_won_label'); statusColor = '#f59e0b'; }
                else if (a.auction_status === 'completed') { statusText = t('auction_lost_label'); statusColor = '#6b7280'; }
                else if (a.auction_status === 'expired') { statusText = t('auction_refunded'); statusColor = '#6b7280'; }

                return (
                  <div key={a.id} style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '14px', border: `1px solid ${theme.border}`, marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div style={{ color: theme.text, fontWeight: '600', flex: 1 }}>{a.title}</div>
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: statusColor, color: '#fff', marginLeft: '8px' }}>{statusText}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textSecondary }}>
                      <span>{t('auction_qty')}: {a.quantity} · ${parseFloat(String(a.amount)).toFixed(2)} USDT</span>
                    </div>
                    {a.is_winner && !a.is_redeemed && a.result_id && (
                      <button
                        onClick={() => handleRedeem(a.result_id!)}
                        disabled={redeeming === a.result_id}
                        style={{
                          marginTop: '10px', width: '100%', padding: '8px',
                          backgroundColor: '#f59e0b', color: '#fff', border: 'none',
                          borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                        }}
                      >
                        {redeeming === a.result_id ? t('processing') : `💰 ${t('auction_redeem')} ${parseFloat(String(a.winner_payout || 0)).toFixed(2)} USDT`}
                      </button>
                    )}
                  </div>
                );
              })
          }
        </>
      )}
    </div>
  );
};
