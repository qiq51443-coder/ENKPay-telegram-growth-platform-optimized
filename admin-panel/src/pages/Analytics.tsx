import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin, Typography, Table } from 'antd';
import {
  UserOutlined,
  WalletOutlined,
  GiftOutlined,
  CheckCircleOutlined,
  RiseOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  TeamOutlined,
  ClockCircleOutlined,
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

interface UserStats {
  total_unique_users: number;
  total_user_records: number;
  new_users_today: number;
  active_users_7d: number;
  users_by_bot: Array<{ bot_name: string; user_count: number }>;
}

export const Analytics: React.FC = () => {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const [generalRes, userRes] = await Promise.all([
        axios.get('/api/admin/dashboard/stats', { headers }).catch(() => ({ data: null })),
        axios.get('/api/admin/stats/users', { headers }).catch(() => ({ data: null })),
      ]);
      if (generalRes.data) {
        const d = generalRes.data;
        const safeNum = (v: any) => parseFloat(String(v ?? 0)) || 0;
        setStats({
          total_users: safeNum(d.users?.total_users),
          new_today: safeNum(d.users?.new_today),
          total_deposits: safeNum(d.deposits?.total_deposits),
          total_withdrawals: safeNum(d.withdrawals?.total_withdrawals),
          total_rewards: safeNum(d.transactions?.total_rewards),
          total_red_packet_amount: safeNum(d.redPackets?.total_red_packet_amount),
          total_claimed_amount: safeNum(d.redPackets?.total_claimed_amount),
        });
      }
      if (userRes.data) setUserStats(userRes.data);
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

  const botColumns = [
    { title: 'Bot 账号', dataIndex: 'bot_name', key: 'bot_name' },
    { title: '用户数', dataIndex: 'user_count', key: 'user_count' },
  ];

  return (
    <div>
      <Title level={2}>数据统计</Title>

      <Title level={4} style={{ marginTop: 24 }}>用户统计</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="唯一用户总数（去重）"
              value={userStats?.total_unique_users ?? stats?.total_users ?? 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日新增用户"
              value={userStats?.new_users_today ?? stats?.new_today ?? 0}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="近7天活跃用户"
              value={userStats?.active_users_7d ?? 0}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="用户记录总数（含多 Bot）"
              value={userStats?.total_user_records ?? 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {userStats?.users_by_bot && userStats.users_by_bot.length > 0 && (
        <Card title="各 Bot 用户分布" style={{ marginTop: 16 }}>
          <Table
            dataSource={userStats.users_by_bot}
            columns={botColumns}
            rowKey="bot_name"
            pagination={false}
            size="small"
          />
        </Card>
      )}

      <Title level={4} style={{ marginTop: 24 }}>财务统计</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="充值总数"
              value={Number(stats?.total_deposits || 0).toFixed(2)}
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
              value={Number(stats?.total_withdrawals || 0).toFixed(2)}
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
              value={Number(stats?.total_rewards || 0).toFixed(2)}
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
              value={Number(stats?.total_red_packet_amount || 0).toFixed(2)}
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
              value={Number(stats?.total_claimed_amount || 0).toFixed(2)}
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
