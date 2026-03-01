import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { api } from '../services/api';

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
  const [activities, setActivities] = useState<CharityActivity[]>([]);
  const [loading, setLoading] = useState(true);

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
        <button style={{
          width: '100%',
          padding: '14px',
          backgroundColor: theme.accent,
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer',
        }}>
          ❤️ 申请救助
        </button>
      </div>
    </div>
  );
};
