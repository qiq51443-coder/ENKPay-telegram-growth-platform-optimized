import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import {
  getAuctions,
  getAuctionDetail,
  getAuctionParticipants,
  getAuctionResults,
  getMyAuctions,
  joinAuction,
  redeemAuction,
  getUserProfile,
} from '../services/api';

interface AuctionItem {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
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
}

interface AuctionResult {
  id: string;
  auction_id: string;
  auction_title: string;
  winner_unique_id?: string;
  product_value: number;
  payout_amount: number;
  total_participants: number;
  is_redeemed: boolean;
  created_at: string;
}

interface MyAuction {
  auction_id: string;
  title: string;
  auction_status: string;
  quantity: number;
  amount: number;
  is_winner: boolean;
  refunded: boolean;
  winner_unique_id?: string;
  expires_at: string;
  result_id?: string;
  payout_amount?: number;
  is_redeemed?: boolean;
}

type ViewMode = 'list' | 'detail' | 'results' | 'my';

// Countdown hook
function useCountdown(expiresAt: string): string {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calc = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('已截止'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${d}天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return timeLeft;
}

const statusLabel = (status: string) => {
  const map: Record<string, { text: string; color: string }> = {
    active: { text: '进行中', color: theme.success },
    completed: { text: '已完成', color: '#4A90D9' },
    expired: { text: '已过期', color: theme.textSecondary },
    cancelled: { text: '已取消', color: '#E74C3C' },
  };
  return map[status] || { text: status, color: theme.textSecondary };
};

// ────────────────────────────────
// AuctionCard sub-component
// ────────────────────────────────
const AuctionCard: React.FC<{ auction: AuctionItem; onClick: () => void }> = ({ auction, onClick }) => {
  const progress = (auction.current_participants / auction.participant_count) * 100;
  const { text: sText, color: sColor } = statusLabel(auction.status);
  const timeLeft = useCountdown(auction.expires_at);

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        padding: '16px',
        border: `1px solid ${theme.border}`,
        cursor: 'pointer',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <h3 style={{ color: theme.text, fontSize: '15px', flex: 1 }}>{auction.title}</h3>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: sColor, color: '#fff', marginLeft: '8px', whiteSpace: 'nowrap' }}>
          {sText}
        </span>
      </div>

      {auction.image_url && (
        <img src={auction.image_url} alt={auction.title} style={{ width: '100%', borderRadius: '8px', marginBottom: '8px', maxHeight: '140px', objectFit: 'cover' }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <div style={{ color: theme.textSecondary, fontSize: '11px' }}>藏品价值</div>
          <div style={{ color: theme.accent, fontWeight: '600' }}>{Number(auction.product_value).toFixed(2)} USDT</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: theme.textSecondary, fontSize: '11px' }}>每人费用</div>
          <div style={{ color: theme.text, fontWeight: '600' }}>{Number(auction.per_person_cost).toFixed(2)} USDT</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: theme.textSecondary, fontSize: '12px' }}>参与进度</span>
          <span style={{ color: theme.accent, fontSize: '12px' }}>{auction.current_participants}/{auction.participant_count}</span>
        </div>
        <div style={{ height: '6px', backgroundColor: theme.bgCardHover, borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', backgroundColor: theme.accent, borderRadius: '3px', transition: 'width 0.3s' }} />
        </div>
      </div>

      {auction.status === 'active' && (
        <div style={{ color: theme.textSecondary, fontSize: '11px' }}>⏱ 剩余：{timeLeft}</div>
      )}
    </div>
  );
};

// ────────────────────────────────
// Detail view
// ────────────────────────────────
interface DetailViewProps {
  auctionId: string;
  userId?: string;
  onBack: () => void;
}

const DetailView: React.FC<DetailViewProps> = ({ auctionId, userId, onBack }) => {
  const [auction, setAuction] = useState<AuctionItem | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [qty, setQty] = useState(1);
  const [joining, setJoining] = useState(false);
  const [msg, setMsg] = useState('');
  const timeLeft = useCountdown(auction?.expires_at || '');

  useEffect(() => {
    getAuctionDetail(auctionId).then(d => setAuction(d.data)).catch(() => {});
    getAuctionParticipants(auctionId).then(d => setParticipants(d.data || [])).catch(() => {});
  }, [auctionId]);

  const handleJoin = async () => {
    if (!userId || !auction) return;
    setJoining(true);
    setMsg('');
    try {
      await joinAuction(auction.id, userId, qty);
      setMsg('✅ 参与成功！');
      const updated = await getAuctionDetail(auctionId);
      setAuction(updated.data);
      const updatedParticipants = await getAuctionParticipants(auctionId);
      setParticipants(updatedParticipants.data || []);
    } catch (err: any) {
      setMsg(`❌ ${err.response?.data?.error || '参与失败'}`);
    } finally {
      setJoining(false);
    }
  };

  if (!auction) return <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>加载中...</div>;

  const progress = (auction.current_participants / auction.participant_count) * 100;
  const { text: sText, color: sColor } = statusLabel(auction.status);

  return (
    <div style={{ padding: '16px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '15px', marginBottom: '12px' }}>
        ← 返回
      </button>

      {auction.image_url && (
        <img src={auction.image_url} alt={auction.title} style={{ width: '100%', borderRadius: '10px', marginBottom: '12px', maxHeight: '200px', objectFit: 'cover' }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <h2 style={{ color: theme.text, fontSize: '18px', flex: 1 }}>{auction.title}</h2>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: sColor, color: '#fff', marginLeft: '8px' }}>{sText}</span>
      </div>

      {auction.description && (
        <p style={{ color: theme.textSecondary, fontSize: '13px', marginBottom: '12px' }}>{auction.description}</p>
      )}

      <div style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '12px', marginBottom: '12px', border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <div style={{ color: theme.textSecondary, fontSize: '11px' }}>藏品价值</div>
            <div style={{ color: theme.accent, fontWeight: '600' }}>{Number(auction.product_value).toFixed(2)} USDT</div>
          </div>
          <div>
            <div style={{ color: theme.textSecondary, fontSize: '11px' }}>每人费用</div>
            <div style={{ color: theme.text, fontWeight: '600' }}>{Number(auction.per_person_cost).toFixed(2)} USDT</div>
          </div>
          <div>
            <div style={{ color: theme.textSecondary, fontSize: '11px' }}>平台慈善抽成</div>
            <div style={{ color: theme.text }}>{Number(auction.platform_fee_percent).toFixed(0)}%</div>
          </div>
          <div>
            <div style={{ color: theme.textSecondary, fontSize: '11px' }}>赢家可兑换</div>
            <div style={{ color: theme.success, fontWeight: '600' }}>{Number(auction.winner_payout).toFixed(2)} USDT</div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: theme.textSecondary, fontSize: '12px' }}>参与进度</span>
          <span style={{ color: theme.accent, fontSize: '12px' }}>{auction.current_participants}/{auction.participant_count}</span>
        </div>
        <div style={{ height: '8px', backgroundColor: theme.bgCardHover, borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', backgroundColor: theme.accent, borderRadius: '4px', transition: 'width 0.3s' }} />
        </div>
      </div>

      {auction.status === 'active' && (
        <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '12px' }}>⏱ 剩余时间：{timeLeft}</div>
      )}

      {auction.status === 'completed' && auction.winner_unique_id && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '12px', marginBottom: '12px', border: `1px solid ${theme.accent}` }}>
          <div style={{ color: theme.accent, fontWeight: '600', marginBottom: '4px' }}>🏆 开奖结果</div>
          <div style={{ color: theme.text, fontSize: '14px' }}>获奖者 ID：{auction.winner_unique_id}</div>
          {auction.drawn_at && <div style={{ color: theme.textSecondary, fontSize: '12px' }}>开奖时间：{new Date(auction.drawn_at).toLocaleString('zh-CN')}</div>}
        </div>
      )}

      {/* Participants */}
      <h3 style={{ color: theme.text, fontSize: '14px', marginBottom: '8px' }}>参与者 ({participants.length})</h3>
      <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '12px' }}>
        {participants.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
            <span style={{ color: theme.text, fontSize: '13px' }}>{p.unique_id}</span>
            <span style={{ color: theme.textSecondary, fontSize: '12px' }}>x{p.quantity}</span>
          </div>
        ))}
        {participants.length === 0 && <div style={{ color: theme.textSecondary, fontSize: '13px' }}>暂无参与者</div>}
      </div>

      {/* Join button */}
      {auction.status === 'active' && userId && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ color: theme.text, fontSize: '13px' }}>购买份数：</span>
            <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgCardHover, color: theme.text, cursor: 'pointer' }}>-</button>
            <span style={{ color: theme.text, minWidth: '20px', textAlign: 'center' }}>{qty}</span>
            <button onClick={() => setQty(q => Math.min(auction.max_purchases_per_user, q + 1))} style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgCardHover, color: theme.text, cursor: 'pointer' }}>+</button>
            <span style={{ color: theme.textSecondary, fontSize: '12px' }}>最多 {auction.max_purchases_per_user} 份</span>
          </div>
          <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '8px' }}>
            费用：{(Number(auction.per_person_cost) * qty).toFixed(2)} USDT
          </div>
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{
              width: '100%', padding: '14px', backgroundColor: joining ? theme.textSecondary : theme.accent,
              color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: '600', cursor: joining ? 'default' : 'pointer',
            }}
          >
            {joining ? '处理中...' : '🎯 参与竞拍'}
          </button>
          {msg && <div style={{ color: msg.startsWith('✅') ? theme.success : '#E74C3C', fontSize: '13px', marginTop: '8px', textAlign: 'center' }}>{msg}</div>}
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────
// Results view
// ────────────────────────────────
const ResultsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [results, setResults] = useState<AuctionResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuctionResults().then(d => setResults(d.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: '16px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '15px', marginBottom: '12px' }}>← 返回</button>
      <h2 style={{ color: theme.text, fontSize: '18px', marginBottom: '12px' }}>🏆 中奖记录</h2>
      {loading ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>加载中...</div>
      ) : results.length === 0 ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>暂无记录</div>
      ) : (
        results.map(r => (
          <div key={r.id} style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '12px', marginBottom: '10px', border: `1px solid ${theme.border}` }}>
            <div style={{ color: theme.text, fontWeight: '600', marginBottom: '4px' }}>{r.auction_title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textSecondary }}>
              <span>获奖者：{r.winner_unique_id || '-'}</span>
              <span>参与人数：{r.total_participants}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
              <span style={{ color: theme.success }}>可兑换：{Number(r.payout_amount).toFixed(2)} USDT</span>
              <span style={{ color: theme.textSecondary }}>{new Date(r.created_at).toLocaleDateString('zh-CN')}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// ────────────────────────────────
// My auctions view
// ────────────────────────────────
const MyAuctionsView: React.FC<{ userId: string; onBack: () => void }> = ({ userId, onBack }) => {
  const [items, setItems] = useState<MyAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemMsg, setRedeemMsg] = useState('');

  const fetchMy = () => {
    getMyAuctions(userId).then(d => setItems(d.data || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchMy(); }, [userId]);

  const handleRedeem = async (resultId: string) => {
    try {
      await redeemAuction(resultId, userId);
      setRedeemMsg('✅ 兑换成功！USDT 已到账');
      fetchMy();
    } catch (err: any) {
      setRedeemMsg(`❌ ${err.response?.data?.error || '兑换失败'}`);
    }
  };

  const myStatusLabel = (item: MyAuction) => {
    if (item.refunded) return { text: '已退款', color: theme.textSecondary };
    if (item.is_winner) return { text: '已中奖', color: theme.success };
    if (item.auction_status === 'completed') return { text: '未中奖', color: '#E74C3C' };
    return { text: '等待中', color: theme.accent };
  };

  return (
    <div style={{ padding: '16px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '15px', marginBottom: '12px' }}>← 返回</button>
      <h2 style={{ color: theme.text, fontSize: '18px', marginBottom: '12px' }}>🎯 我的竞拍</h2>
      {redeemMsg && <div style={{ color: redeemMsg.startsWith('✅') ? theme.success : '#E74C3C', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>{redeemMsg}</div>}
      {loading ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>加载中...</div>
      ) : items.length === 0 ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>暂无记录</div>
      ) : (
        items.map((item, i) => {
          const { text, color } = myStatusLabel(item);
          return (
            <div key={i} style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '12px', marginBottom: '10px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ color: theme.text, fontWeight: '600', flex: 1 }}>{item.title}</div>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: color, color: '#fff', marginLeft: '8px' }}>{text}</span>
              </div>
              <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                购买份数：{item.quantity} | 支付：{Number(item.amount).toFixed(2)} USDT
              </div>
              {item.is_winner && !item.refunded && item.result_id && !item.is_redeemed && (
                <button
                  onClick={() => handleRedeem(item.result_id!)}
                  style={{ marginTop: '8px', padding: '8px 16px', backgroundColor: theme.success, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                >
                  💰 兑换为 USDT ({item.payout_amount ? `${Number(item.payout_amount).toFixed(2)} USDT` : ''})
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

// ────────────────────────────────
// Main Auction page
// ────────────────────────────────
export const Auction: React.FC = () => {
  const { user: tgUser, initData } = useTelegram();
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    getAuctions().then(d => setAuctions(d.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (initData) {
      getUserProfile(initData).then(d => setUserId(d.user?.id || '')).catch(() => {});
    }
  }, [initData]);

  if (viewMode === 'detail') {
    return <DetailView auctionId={selectedId} userId={userId} onBack={() => setViewMode('list')} />;
  }
  if (viewMode === 'results') {
    return <ResultsView onBack={() => setViewMode('list')} />;
  }
  if (viewMode === 'my') {
    return <MyAuctionsView userId={userId} onBack={() => setViewMode('list')} />;
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ color: theme.text, fontSize: '20px' }}>🎯 竞拍</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setViewMode('results')} style={{ fontSize: '12px', padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer' }}>中奖记录</button>
          {userId && <button onClick={() => setViewMode('my')} style={{ fontSize: '12px', padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer' }}>我的竞拍</button>}
        </div>
      </div>

      {loading ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>加载中...</div>
      ) : auctions.length === 0 ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>暂无竞拍活动</div>
      ) : (
        <div style={{ marginBottom: '80px' }}>
          {auctions.map(a => (
            <AuctionCard
              key={a.id}
              auction={a}
              onClick={() => { setSelectedId(a.id); setViewMode('detail'); }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
