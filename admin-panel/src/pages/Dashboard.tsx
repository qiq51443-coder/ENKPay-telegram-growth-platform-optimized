import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin, Typography, List, Tag } from 'antd';
import {
  UserOutlined,
  WalletOutlined,
  GiftOutlined,
  CheckCircleOutlined,
  RiseOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Title } = Typography;

interface DashboardStats {
  users: {
    total_users: number;
    bound_users: number;
    new_today: number;
    active_today: number;
  };
  bindings: {
    pending_bindings: number;
    approved_bindings: number;
  };
  redPackets: {
    active_red_packets: number;
    total_red_packets: number;
    total_claimed_amount: number;
  };
  transactions: {
    total_rewards: number;
    rewards_today: number;
  };
  recent_activities?: Array<{
    id: string;
    type: string;
    description: string;
    created_at: string;
  }>;
}

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get('/admin/dashboard/overview');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={2}>仪表盘</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="总用户数"
              value={stats?.users.total_users || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
              已绑定: {stats?.users.bound_users || 0}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="今日新增"
              value={stats?.users.new_today || 0}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
              活跃: {stats?.users.active_today || 0}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="待审核绑定"
              value={stats?.bindings.pending_bindings || 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
              已通过: {stats?.bindings.approved_bindings || 0}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="活跃红包"
              value={stats?.redPackets.active_red_packets || 0}
              prefix={<GiftOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
              已发送: {stats?.redPackets.total_red_packets || 0}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="总奖励发放"
              value={(stats?.transactions.total_rewards || 0).toFixed(2)}
              prefix={<WalletOutlined />}
              valueStyle={{ color: '#722ed1' }}
              suffix="$"
            />
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
              今日: ${(stats?.transactions.rewards_today || 0).toFixed(2)}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="红包已领取"
              value={(stats?.redPackets.total_claimed_amount || 0).toFixed(2)}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#eb2f96' }}
              suffix="$"
            />
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
              总红包: {stats?.redPackets.total_red_packets || 0}
            </div>
          </Card>
        </Col>
      </Row>

      {stats?.recent_activities && stats.recent_activities.length > 0 && (
        <Card title="最近活动" style={{ marginTop: '24px' }}>
          <List
            dataSource={stats.recent_activities}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <div>
                      <Tag>{item.type}</Tag> {item.description}
                    </div>
                  }
                  description={new Date(item.created_at).toLocaleString('zh-CN')}
                />
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
};
