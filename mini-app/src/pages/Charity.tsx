import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { api, submitCharityApplication, getUserProfile } from '../services/api';
import { useTelegram } from '../hooks/useTelegram';

interface CharityActivity {
  id: string;
  title: string;
  description: string;
  image_url: string;
  status: 'active' | 'completed' | 'cancelled';
  target_amount: number;
  current_amount: number;
  end_date: string;
}

export const Charity: React.FC = () => {
  const { initData } = useTelegram();
  const [activities, setActivities] = useState<CharityActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [userId, setUserId] = useState('');
  const [applyForm, setApplyForm] = useState({ activity_id: '', reason: '', amount: '' });
  const [submitting, setSubmitting] = useState(false);
  const [applyMsg, setApplyMsg] = useState('');

  useEffect(() => {
    fetchActivities();
  }, []);

  useEffect(() => {
    if (initData) {
      getUserProfile(initData).then(d => setUserId(d.user?.id || '')).catch(() => {});
    }
  }, [initData]);

  const fetchActivities = async () => {
    try {
      const data = await api.get('/charity/activities');
      setActivities(data.data?.activities || data.data?.projects || []);
    } catch {
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitApply = async () => {
    if (!applyForm.reason) {
      setApplyMsg('❌ 请填写申请理由');
      return;
    }
    setSubmitting(true);
    setApplyMsg('');
    try {
      await submitCharityApplication({
        activity_id: applyForm.activity_id || undefined,
        user_id: userId,
        reason: applyForm.reason,
        amount: applyForm.amount ? parseFloat(applyForm.amount) : undefined,
      });
      setApplyMsg('✅ 申请已提交，等待审核');
      setTimeout(() => {
        setShowApplyModal(false);
        setApplyMsg('');
        setApplyForm({ activity_id: '', reason: '', amount: '' });
      }, 1500);
    } catch (err: any) {
      setApplyMsg(`❌ ${err.response?.data?.error || '提交失败'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: '20px' }}>❤️ 公益活动</h1>

      {loading ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>加载中...</div>
      ) : activities.length === 0 ? (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>暂无活动</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '80px' }}>
          {activities.map(activity => {
            const progress = activity.target_amount > 0
              ? Math.min((activity.current_amount / activity.target_amount) * 100, 100)
              : 0;
            return (
              <div key={activity.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h3 style={{ color: theme.text, fontSize: '15px', flex: 1 }}>{activity.title}</h3>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: activity.status === 'active' ? theme.success : theme.textSecondary, color: '#fff', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                    {activity.status === 'active' ? '进行中' : '已完成'}
                  </span>
                </div>
                {activity.description && (
                  <p style={{ color: theme.textSecondary, fontSize: '13px', marginBottom: '12px' }}>{activity.description}</p>
                )}
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: theme.textSecondary, fontSize: '12px' }}>筹款进度</span>
                    <span style={{ color: theme.accent, fontSize: '12px' }}>{progress.toFixed(0)}%</span>
                  </div>
                  <div style={{ height: '6px', backgroundColor: theme.bgCardHover, borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', backgroundColor: theme.accent, borderRadius: '3px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ color: theme.textSecondary, fontSize: '11px' }}>${activity.current_amount}</span>
                    <span style={{ color: theme.textSecondary, fontSize: '11px' }}>目标 ${activity.target_amount}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Apply for help button */}
      <div style={{ position: 'fixed', bottom: '70px', left: '16px', right: '16px' }}>
        <button
          onClick={() => setShowApplyModal(true)}
          style={{ width: '100%', padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' }}
        >
          ❤️ 申请救助
        </button>
      </div>

      {/* Apply modal */}
      {showApplyModal && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}
          onClick={() => setShowApplyModal(false)}
        >
          <div
            style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '20px', width: '100%', maxWidth: '400px', border: `1px solid ${theme.border}` }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ color: theme.text, fontSize: '18px', marginBottom: '16px' }}>❤️ 申请救助</h2>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ color: theme.textSecondary, fontSize: '13px', display: 'block', marginBottom: '6px' }}>关联活动（可选）</label>
              <select
                value={applyForm.activity_id}
                onChange={e => setApplyForm(f => ({ ...f, activity_id: e.target.value }))}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgPrimary, color: theme.text, fontSize: '14px' }}
              >
                <option value="">-- 不关联活动 --</option>
                {activities.filter(a => a.status === 'active').map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ color: theme.textSecondary, fontSize: '13px', display: 'block', marginBottom: '6px' }}>申请理由 *</label>
              <textarea
                value={applyForm.reason}
                onChange={e => setApplyForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="请说明您的救助申请理由..."
                rows={4}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgPrimary, color: theme.text, fontSize: '14px', resize: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: theme.textSecondary, fontSize: '13px', display: 'block', marginBottom: '6px' }}>申请金额（USDT，可选）</label>
              <input
                type="number"
                value={applyForm.amount}
                onChange={e => setApplyForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgPrimary, color: theme.text, fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>

            {applyMsg && (
              <div style={{ color: applyMsg.startsWith('✅') ? theme.success : '#E74C3C', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>
                {applyMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowApplyModal(false)}
                style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '15px' }}
              >
                取消
              </button>
              <button
                onClick={handleSubmitApply}
                disabled={submitting}
                style={{ flex: 1, padding: '12px', backgroundColor: submitting ? theme.textSecondary : theme.accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: submitting ? 'default' : 'pointer', fontSize: '15px' }}
              >
                {submitting ? '提交中...' : '提交申请'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
