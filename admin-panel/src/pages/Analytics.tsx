import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin, Typography } from 'antd';
import {
  UserOutlined,
  WalletOutlined,
  GiftOutlined,
  CheckCircleOutlined,
  RiseOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Title } = Typography;

interface AnalyticsStats {
  total_users: number;
  new_today: number;
  total_deposits: number;
  total_withdrawals: number;
  total_rewards: number;
  total_red_packet_amount: number;
  total_claimed_amount: number;
}

export const Analytics: React.FC = () => {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/admin/dashboard/stats', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
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
      <Title level={2}>数据统计</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="用户总数"
              value={stats?.total_users || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="今日新增用户"
              value={stats?.new_today || 0}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="充值总数"
              value={(stats?.total_deposits || 0).toFixed(2)}
              prefix={<ArrowDownOutlined />}
              valueStyle={{ color: '#52c41a' }}
              suffix="$"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="提现总数"
              value={(stats?.total_withdrawals || 0).toFixed(2)}
              prefix={<ArrowUpOutlined />}
              valueStyle={{ color: '#faad14' }}
              suffix="$"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="总奖励发放"
              value={(stats?.total_rewards || 0).toFixed(2)}
              prefix={<WalletOutlined />}
              valueStyle={{ color: '#722ed1' }}
              suffix="$"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="红包发放总额"
              value={(stats?.total_red_packet_amount || 0).toFixed(2)}
              prefix={<GiftOutlined />}
              valueStyle={{ color: '#cf1322' }}
              suffix="$"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="红包已领取总额"
              value={(stats?.total_claimed_amount || 0).toFixed(2)}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#eb2f96' }}
              suffix="$"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
