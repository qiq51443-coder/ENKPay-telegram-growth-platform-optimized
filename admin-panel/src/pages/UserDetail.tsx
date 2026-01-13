import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Input, Select, Table, message, Spin, Row, Col, Descriptions } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';

interface User {
  id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  robot_user_id?: string;
  invite_code?: string;
  balance: number;
  red_packet_credits: number;
  binding_status: string;
  account_status: string;
  created_at: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description?: string;
  created_at: string;
}

export const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    balance: 0,
    red_packet_credits: 0,
    account_status: 'active',
  });

  useEffect(() => {
    if (id) {
      fetchUser();
      fetchTransactions();
    }
  }, [id]);

  const fetchUser = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/users/${id}`);
      setUser(response.data.user);
      setFormData({
        balance: response.data.user.balance,
        red_packet_credits: response.data.user.red_packet_credits,
        account_status: response.data.user.account_status,
      });
    } catch (error) {
      console.error('Failed to fetch user:', error);
      message.error('获取用户信息失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(`/api/admin/users/${id}/transactions`, {
        params: { limit: 20 },
      });
      setTransactions(response.data.transactions || []);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/admin/users/${id}`, formData);
      message.success('保存成功');
      fetchUser();
    } catch (error: any) {
      console.error('Failed to update user:', error);
      message.error(error.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <p>用户不存在</p>
        <Button onClick={() => navigate('/users')}>返回用户列表</Button>
      </div>
    );
  }

  const transactionColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap: Record<string, string> = {
          reward: '奖励',
          withdrawal: '提现',
          red_packet: '红包',
          adjustment: '调整',
        };
        return typeMap[type] || type;
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <span style={{ color: amount >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {amount >= 0 ? '+' : ''}${amount.toFixed(2)}
        </span>
      ),
    },
    {
      title: '余额',
      dataIndex: 'balance_after',
      key: 'balance_after',
      render: (balance: number) => `$${balance.toFixed(2)}`,
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) => desc || '-',
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/users')} style={{ marginRight: 16 }}>
          返回
        </Button>
        <span style={{ fontSize: 20, fontWeight: 'bold' }}>用户详情</span>
        <p style={{ color: '#666', marginTop: 8 }}>{user.username || user.first_name}</p>
      </div>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="基本信息" style={{ marginBottom: 16 }}>
            <Descriptions column={1}>
              <Descriptions.Item label="Telegram ID">{user.telegram_id}</Descriptions.Item>
              <Descriptions.Item label="用户名">{user.username || '未设置'}</Descriptions.Item>
              <Descriptions.Item label="姓名">
                {user.first_name} {user.last_name || ''}
              </Descriptions.Item>
              <Descriptions.Item label="Bot ID">{user.robot_user_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="邀请码">
                <code>{user.invite_code}</code>
              </Descriptions.Item>
              <Descriptions.Item label="绑定状态">{user.binding_status}</Descriptions.Item>
              <Descriptions.Item label="注册时间">
                {new Date(user.created_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="编辑信息" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>余额</label>
              <Input
                type="number"
                step="0.01"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>红包积分</label>
              <Input
                type="number"
                value={formData.red_packet_credits}
                onChange={(e) => setFormData({ ...formData, red_packet_credits: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8 }}>账号状态</label>
              <Select
                value={formData.account_status}
                onChange={(value) => setFormData({ ...formData, account_status: value })}
                style={{ width: '100%' }}
                options={[
                  { value: 'active', label: '正常' },
                  { value: 'suspended', label: '暂停' },
                  { value: 'banned', label: '封禁' },
                ]}
              />
            </div>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
              block
            >
              保存修改
            </Button>
          </Card>
        </Col>
      </Row>

      <Card title="交易记录">
        <Table
          columns={transactionColumns}
          dataSource={transactions}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '暂无交易记录' }}
        />
      </Card>
    </div>
  );
};
