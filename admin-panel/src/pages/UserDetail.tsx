import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Tag, Button, message, Spin, Tabs, Modal, Form, InputNumber, Input, Popconfirm, Space } from 'antd';
import { ArrowLeftOutlined, EditOutlined, LockOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { TabPane } = Tabs;

interface UserDetail {
  id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  unique_id?: string;
  robot_user_id?: string;
  balance: number;
  wallet_balance?: number;
  reward_balance?: number;
  nft_balance?: number;
  red_packet_balance?: number;
  red_packet_credits?: number;
  account_status: string;
  created_at: string;
  last_active_at?: string;
  withdraw_password?: string;
  withdraw_password_set?: boolean;
  bot_id?: string;
  bot_name?: string;
  invited_by?: string;
  invited_by_username?: string;
  invite_count?: number;
}

export const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [invitees, setInvitees] = useState([]);
  const [linkedBots, setLinkedBots] = useState<any[]>([]);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (id) {
      fetchUserDetail();
    }
  }, [id]);

  const fetchUserDetail = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getUser(id!);
      setUser(data.user);
      setTransactions(data.transactions || []);
      if (data.user?.telegram_id) {
        fetchLinkedBotsById(data.user.telegram_id);
      }
    } catch (error) {
      console.error('Failed to fetch user detail:', error);
      message.error('获取用户信息失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvitees = async () => {
    try {
      const data = await apiClient.getUserInvitees(id!);
      setInvitees(data.invitees || []);
    } catch (error) {
      console.error('Failed to fetch invitees:', error);
    }
  };

  const fetchLinkedBotsById = async (telegramId: number) => {
    try {
      const response = await apiClient.get(`/admin/users/${telegramId}/bots`);
      setLinkedBots((response as any)?.bots || []);
    } catch (error) {
      console.error('Failed to fetch linked bots:', error);
    }
  };

  const fetchLinkedBots = async () => {
    if (!user?.telegram_id) return;
    fetchLinkedBotsById(user.telegram_id);
  };

  const handleUpdateBalance = async () => {
    try {
      const values = await form.validateFields();
      const addAmount = parseFloat(values.add_amount || '0') || 0;
      const subtractAmount = parseFloat(values.subtract_amount || '0') || 0;

      if (addAmount === 0 && subtractAmount === 0) {
        message.error('请输入增加或减少金额');
        return;
      }
      if (addAmount > 0 && subtractAmount > 0) {
        message.error('不能同时填写增加和减少金额');
        return;
      }

      const amount = addAmount > 0 ? addAmount : subtractAmount;
      const type = addAmount > 0 ? 'add' : 'subtract';

      await apiClient.adjustBalance(id!, {
        amount,
        type,
        reason: values.reason || '',
      });
      message.success('余额更新成功');
      setBalanceModalOpen(false);
      form.resetFields();
      fetchUserDetail();
    } catch (error: any) {
      console.error('Failed to update balance:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleResetWithdrawPassword = async () => {
    try {
      await apiClient.resetWithdrawPassword(id!);
      message.success('提现密码已重置');
      fetchUserDetail();
    } catch (error: any) {
      console.error('Failed to reset withdraw password:', error);
      message.error(error.response?.data?.error || '重置失败');
    }
  };

  const transactionColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap: Record<string, { text: string; color: string }> = {
          deposit:        { text: '充值',       color: 'green' },
          withdrawal:     { text: '提现',       color: 'red' },
          transfer_in:    { text: '转入',       color: 'blue' },
          transfer_out:   { text: '转出',       color: 'orange' },
          trade_win:      { text: '交易盈利',   color: 'green' },
          trade_loss:     { text: '交易亏损',   color: 'red' },
          reward:         { text: '奖励',       color: 'gold' },
          red_packet:     { text: '红包',       color: 'red' },
          invite:         { text: '邀请奖励',   color: 'purple' },
          invite_reward:  { text: '邀请奖励',   color: 'purple' },
          follow_reward:  { text: '关注奖励',   color: 'green' },
          bind_reward:    { text: '绑定奖励',   color: 'blue' },
          admin_credit:   { text: '管理员增加', color: 'green' },
          admin_debit:    { text: '管理员扣减', color: 'red' },
          admin_adjustment: { text: '管理员调整', color: 'default' },
          auction_buy:    { text: '夺宝参与',   color: 'purple' },
          auction_join:   { text: '夺宝参与',   color: 'purple' },
          auction_redeem: { text: '夺宝兑奖',   color: 'gold' },
          auction_refund: { text: '夺宝退款',   color: 'blue' },
          nft_purchase:   { text: 'NFT购买',    color: 'blue' },
          nft_settle:     { text: 'NFT结算收益', color: 'green' },
        };
        const info = typeMap[type] || { text: type, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: any, record: any) => {
        const num = parseFloat(String(amount));
        const positiveTypes = ['deposit', 'transfer_in', 'reward', 'red_packet', 'invite',
                               'invite_reward', 'follow_reward', 'bind_reward', 'trade_win',
                               'admin_credit'];
        const isPositive = positiveTypes.includes(record.type) || num >= 0;
        return (
          <span style={{ fontFamily: 'monospace', color: isPositive ? '#52c41a' : '#ff4d4f' }}>
            {isPositive ? '+' : '-'}{Math.abs(num).toFixed(2)}
          </span>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: Record<string, string> = {
          completed:  'success',
          confirmed:  'success',
          pending:    'warning',
          processing: 'processing',
          failed:     'error',
          rejected:   'error',
        };
        return <Tag color={statusMap[status] || 'default'}>{status || '-'}</Tag>;
      },
    },
    {
      title: '描述/备注',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) => desc || '-',
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
  ];

  const linkedBotColumns = [
    {
      title: 'Bot 名称',
      dataIndex: 'bot_name',
      key: 'bot_name',
    },
    {
      title: 'Bot 用户名',
      dataIndex: 'bot_username',
      key: 'bot_username',
      render: (v: string) => v ? `@${v}` : '-',
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '最后活跃',
      dataIndex: 'last_active_at',
      key: 'last_active_at',
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '状态',
      dataIndex: 'account_status',
      key: 'account_status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'warning'}>{status || '-'}</Tag>
      ),
    },
  ];

  const inviteeColumns = [    {
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
      render: (v: string) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'account_status',
      key: 'account_status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'warning'}>{status || '-'}</Tag>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
  ];

  if (loading || !user) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  // wallet_balance is the operational balance; nft_balance is NFT asset value (display only)
  const walletBalance = parseFloat(String(user.wallet_balance ?? user.balance ?? 0));
  const nftBalance = parseFloat(String(user.nft_balance ?? 0));

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

      <Tabs defaultActiveKey="info" onChange={(key) => {
        if (key === 'invitations' && invitees.length === 0) fetchInvitees();
      }}>
        <TabPane tab="基本信息" key="info">
          <Card>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="所属 Bot">{user.bot_name || user.bot_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="UID">{user.unique_id || user.robot_user_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="Telegram ID">{user.telegram_id}</Descriptions.Item>
              <Descriptions.Item label="用户名">{user.username || '-'}</Descriptions.Item>
              <Descriptions.Item label="姓名">
                {user.first_name} {user.last_name || ''}
              </Descriptions.Item>
              <Descriptions.Item label="账号状态">
                <Tag color={user.account_status === 'active' ? 'success' : 'error'}>
                  {user.account_status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="被谁邀请">{user.invited_by_username || '-'}</Descriptions.Item>
              <Descriptions.Item label="邀请人数">{user.invite_count ?? 0}</Descriptions.Item>
              <Descriptions.Item label="注册时间">
                {user.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="最后活跃">
                {user.last_active_at ? new Date(user.last_active_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title={`关联机器人 (共 ${linkedBots.length} 个)`} style={{ marginTop: 16 }}
            extra={<Button size="small" onClick={fetchLinkedBots}>刷新</Button>}
          >
            <Table
              columns={linkedBotColumns}
              dataSource={linkedBots}
              rowKey="id"
              pagination={false}
            />
          </Card>
        </TabPane>

        <TabPane tab="余额信息" key="balance">
          <Card
            title="钱包余额"
            extra={
              <Space>
                <Button onClick={fetchUserDetail}>刷新</Button>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => setBalanceModalOpen(true)}
                >
                  调整余额
                </Button>
              </Space>
            }
          >
            <Descriptions bordered column={2}>
              <Descriptions.Item label="钱包余额 (USDT)">
                <span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  ${walletBalance.toFixed(2)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="NFT 藏品价值 (不可转账)">
                <span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  ${nftBalance.toFixed(2)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label={<span>红包余额 (USDT) <span style={{ fontSize: '12px', color: '#999', fontWeight: 'normal' }}>不可提现 · 交易打码可解锁</span></span>}>
                <span style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                  ${parseFloat(String(user.red_packet_balance ?? 0)).toFixed(2)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="提现密码状态">
                <span style={{ marginRight: 8 }}>
                  {user.withdraw_password_set ? (
                    <Tag color="blue">已设置</Tag>
                  ) : (
                    <Tag color="default">未设置</Tag>
                  )}
                </span>
                <Popconfirm
                  title="确定要重置提现密码吗？用户下次提现时需要重新设置。"
                  onConfirm={handleResetWithdrawPassword}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button
                    size="small"
                    danger
                    icon={<LockOutlined />}
                    disabled={!user.withdraw_password_set}
                  >
                    重置提现密码
                  </Button>
                </Popconfirm>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="最近交易记录" style={{ marginTop: 16 }}>
            <Table
              columns={transactionColumns}
              dataSource={transactions}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>

        <TabPane tab="邀请统计" key="invitations">
          <Card title={`邀请人列表 (共 ${user.invite_count ?? 0} 人)`}>
            <Table
              columns={inviteeColumns}
              dataSource={invitees}
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
        onCancel={() => { setBalanceModalOpen(false); form.resetFields(); }}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="当前余额">
              <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>
                ${walletBalance.toFixed(2)} USDT
              </span>
            </Descriptions.Item>
          </Descriptions>
          <Form.Item
            name="add_amount"
            label="增加余额 (USDT)"
            extra="输入要增加的金额（正数）"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={0.01}
              precision={2}
              placeholder="例如: 10.00"
            />
          </Form.Item>
          <Form.Item
            name="subtract_amount"
            label="减少余额 (USDT)"
            extra="输入要减少的金额（正数）"
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={0.01}
              precision={2}
              placeholder="例如: 5.00"
            />
          </Form.Item>
          <Form.Item name="reason" label="备注">
            <Input.TextArea rows={3} placeholder="调整原因（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
