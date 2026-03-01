import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { api, submitCharityApplication } from '../services/api';
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
  const [showForm, setShowForm] = useState(false);
  const [formActivityId, setFormActivityId] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  useEffect(() => {
    fetchActivities();
  }, []);

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

  const handleSubmitApplication = async () => {
    if (!formReason.trim()) {
      setSubmitMsg('请填写申请理由');
      return;
    }
    setSubmitting(true);
    setSubmitMsg('');
    try {
      await submitCharityApplication(
        {
          activity_id: formActivityId || undefined,
          reason: formReason,
          amount: formAmount ? parseFloat(formAmount) : undefined,
        },
        initData || ''
      );
      setSubmitMsg('✅ 申请已提交，等待审核');
      setFormReason('');
      setFormAmount('');
      setFormActivityId('');
      setTimeout(() => { setShowForm(false); setSubmitMsg(''); }, 2000);
    } catch (e: any) {
      setSubmitMsg(`❌ ${e.response?.data?.error || '提交失败'}`);
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
              <div
                key={activity.id}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  padding: '16px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h3 style={{ color: theme.text, fontSize: '15px', flex: 1 }}>{activity.title}</h3>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: activity.status === 'active' ? theme.success : theme.textSecondary,
                    color: '#fff',
                    marginLeft: '8px',
                    whiteSpace: 'nowrap',
                  }}>
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
      <div style={{
        position: 'fixed',
        bottom: '70px',
        left: '16px',
        right: '16px',
      }}>
        <button
          onClick={() => setShowForm(true)}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          ❤️ 申请救助
        </button>
      </div>

      {/* Application form modal */}
      {showForm && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            zIndex: 200,
          }}
          onClick={() => setShowForm(false)}
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
            <h2 style={{ color: theme.text, fontSize: '18px', marginBottom: '16px' }}>申请救助</h2>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ color: theme.textSecondary, fontSize: '13px', display: 'block', marginBottom: '6px' }}>关联活动（可选）</label>
              <select
                value={formActivityId}
                onChange={e => setFormActivityId(e.target.value)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  border: `1px solid ${theme.border}`, backgroundColor: theme.bgCardHover,
                  color: theme.text, fontSize: '14px',
                }}
              >
                <option value=''>请选择活动（可选）</option>
                {activities.filter(a => a.status === 'active').map(a => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ color: theme.textSecondary, fontSize: '13px', display: 'block', marginBottom: '6px' }}>申请理由 *</label>
              <textarea
                value={formReason}
                onChange={e => setFormReason(e.target.value)}
                placeholder='请描述您的申请理由...'
                rows={4}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  border: `1px solid ${theme.border}`, backgroundColor: theme.bgCardHover,
                  color: theme.text, fontSize: '14px', resize: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: theme.textSecondary, fontSize: '13px', display: 'block', marginBottom: '6px' }}>申请金额（USDT，可选）</label>
              <input
                type='number'
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                placeholder='输入金额'
                min='0'
                step='0.01'
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px',
                  border: `1px solid ${theme.border}`, backgroundColor: theme.bgCardHover,
                  color: theme.text, fontSize: '14px', boxSizing: 'border-box',
                }}
              />
            </div>

            {submitMsg && (
              <div style={{ color: submitMsg.startsWith('✅') ? '#22c55e' : '#ef4444', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>
                {submitMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  flex: 1, padding: '12px', backgroundColor: theme.bgCardHover,
                  color: theme.text, border: `1px solid ${theme.border}`,
                  borderRadius: '8px', fontSize: '14px', cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleSubmitApplication}
                disabled={submitting}
                style={{
                  flex: 2, padding: '12px', backgroundColor: theme.accent,
                  color: '#fff', border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
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
