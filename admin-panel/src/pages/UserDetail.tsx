import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Tag, Button, Space, message, Spin, Tabs, Modal, Form, InputNumber, Input } from 'antd';
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TabPane } = Tabs;

interface UserDetail {
  id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  robot_user_id?: string;
  balance: number;
  red_packet_credits: number;
  binding_status: string;
  account_status: string;
  platform_username?: string;
  registered_at: string;
  last_active_at?: string;
}

export const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (id) {
      fetchUserDetail();
      fetchTransactions();
      fetchInvitations();
    }
  }, [id]);

  const fetchUserDetail = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/users/${id}`);
      setUser(response.data.user);
    } catch (error) {
      console.error('Failed to fetch user detail:', error);
      message.error('获取用户信息失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(`/api/admin/users/${id}/transactions`);
      setTransactions(response.data.transactions || []);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  };

  const fetchInvitations = async () => {
    try {
      const response = await axios.get(`/api/admin/users/${id}/invitations`);
      setInvitations(response.data.invitations || []);
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
    }
  };

  const handleUpdateBalance = async () => {
    try {
      const values = await form.validateFields();
      await axios.post(`/api/admin/users/${id}/balance`, {
        amount: values.amount,
        note: values.note,
      });
      message.success('余额更新成功');
      setBalanceModalOpen(false);
      fetchUserDetail();
      fetchTransactions();
    } catch (error: any) {
      console.error('Failed to update balance:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const transactionColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap: Record<string, { text: string; color: string }> = {
          follow_reward: { text: '关注奖励', color: 'green' },
          bind_reward: { text: '绑定奖励', color: 'blue' },
          invite_reward: { text: '邀请奖励', color: 'purple' },
          red_packet: { text: '红包', color: 'red' },
          withdrawal: { text: '提现', color: 'orange' },
          admin_adjustment: { text: '管理员调整', color: 'default' },
        };
        const typeInfo = typeMap[type] || { text: type, color: 'default' };
        return <Tag color={typeInfo.color}>{typeInfo.text}</Tag>;
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <span style={{ fontFamily: 'monospace', color: amount >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {amount >= 0 ? '+' : ''}{amount.toFixed(2)}
        </span>
      ),
    },
    {
      title: '余额',
      dataIndex: 'balance_after',
      key: 'balance_after',
      render: (balance: number) => `$${balance?.toFixed(2)}`,
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  const invitationColumns = [
    {
      title: 'Telegram ID',
      dataIndex: 'telegram_id',
      key: 'telegram_id',
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => username || '-',
    },
    {
      title: '姓名',
      dataIndex: 'first_name',
      key: 'first_name',
    },
    {
      title: '注册时间',
      dataIndex: 'registered_at',
      key: 'registered_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  if (loading || !user) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/users')}
        style={{ marginBottom: 16 }}
      >
        返回
      </Button>

      <h2>用户详情</h2>

      <Tabs defaultActiveKey="info">
        <TabPane tab="基本信息" key="info">
          <Card>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="Telegram ID">{user.telegram_id}</Descriptions.Item>
              <Descriptions.Item label="用户名">{user.username || '-'}</Descriptions.Item>
              <Descriptions.Item label="姓名">
                {user.first_name} {user.last_name || ''}
              </Descriptions.Item>
              <Descriptions.Item label="Bot ID">{user.robot_user_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="平台用户名">{user.platform_username || '-'}</Descriptions.Item>
              <Descriptions.Item label="绑定状态">
                <Tag color={user.binding_status === 'bound' ? 'success' : 'warning'}>
                  {user.binding_status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="账号状态">
                <Tag color={user.account_status === 'active' ? 'success' : 'error'}>
                  {user.account_status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="注册时间">
                {new Date(user.registered_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="最后活跃">
                {user.last_active_at ? new Date(user.last_active_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </TabPane>

        <TabPane tab="余额信息" key="balance">
          <Card
            title="余额"
            extra={
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => setBalanceModalOpen(true)}
              >
                调整余额
              </Button>
            }
          >
            <Descriptions bordered>
              <Descriptions.Item label="当前余额">
                <span style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  ${user.balance.toFixed(2)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="红包积分">
                <span style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {user.red_packet_credits}
                </span>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="交易记录" style={{ marginTop: 16 }}>
            <Table
              columns={transactionColumns}
              dataSource={transactions}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>

        <TabPane tab="邀请统计" key="invitations">
          <Card title={`邀请用户 (${invitations.length})`}>
            <Table
              columns={invitationColumns}
              dataSource={invitations}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>
      </Tabs>

      <Modal
        title="调整余额"
        open={balanceModalOpen}
        onOk={handleUpdateBalance}
        onCancel={() => setBalanceModalOpen(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="amount"
            label="调整金额"
            rules={[{ required: true, message: '请输入调整金额' }]}
            extra="正数为增加，负数为减少"
          >
            <InputNumber
              style={{ width: '100%' }}
              step={0.01}
              placeholder="例如: 10 或 -5"
            />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} placeholder="调整原因（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
