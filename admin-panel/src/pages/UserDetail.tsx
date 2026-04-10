import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Tag, Button, message, Spin, Tabs, Modal, Form, InputNumber, Input, Popconfirm, Space, Avatar, Typography } from 'antd';
import { ArrowLeftOutlined, EditOutlined, LockOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { TabPane } = Tabs;
const { Text } = Typography;

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
  inviter_info?: {
    id: string;
    telegram_id: number;
    username?: string;
    first_name?: string;
    account_status: string;
  } | null;
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
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
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

  const NEGATIVE_TYPES = new Set([
    'trade_loss', 'product_purchase', 'nft_purchase',
    'auction_join', 'auction_buy', 'transfer_out',
    'withdrawal', 'admin_debit',
  ]);

  const TYPE_TAG_COLOR: Record<string, string> = {
    withdrawal:           'red',
    trade_loss:           'red',
    product_purchase:     'red',
    nft_purchase:         'red',
    auction_join:         'red',
    auction_buy:          'red',
    transfer_out:         'red',
    admin_debit:          'red',
    deposit:              'green',
    trade_win:            'green',
    reward:               'green',
    invite:               'green',
    invite_reward:        'green',
    follow_reward:        'green',
    bind_reward:          'green',
    admin_credit:         'green',
    product_yield:        'green',
    nft_income:           'green',
    nft_settle:           'green',
    nft_principal_return: 'green',
    product_refund:       'green',
    auction_redeem:       'green',
    auction_refund:       'green',
    transfer_in:          'green',
    red_packet:           'gold',
    admin_adjustment:     'default',
  };

  const TX_TYPE_LABEL: Record<string, string> = {
    deposit:              '充值',
    withdrawal:           '提现',
    transfer_in:          '转入',
    transfer_out:         '转出',
    trade_win:            '交易盈利',
    trade_loss:           '交易亏损',
    reward:               '奖励',
    red_packet:           '红包',
    invite:               '邀请奖励',
    invite_reward:        '邀请奖励',
    follow_reward:        '关注奖励',
    bind_reward:          '绑定奖励',
    admin_credit:         '管理员增加',
    admin_debit:          '管理员扣减',
    admin_adjustment:     '管理员调整',
    auction_buy:          '夺宝参与',
    auction_join:         '夺宝参与',
    auction_redeem:       '夺宝兑奖',
    auction_refund:       '夺宝退款',
    nft_purchase:         'NFT购买',
    nft_settle:           'NFT结算收益',
    product_purchase:     '产品购买',
    nft_income:           'NFT收益',
    nft_principal_return: 'NFT本金返还',
    product_yield:        '产品收益',
    product_refund:       '产品退款',
  };

  const transactionColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const color = TYPE_TAG_COLOR[type] || 'default';
        const label = TX_TYPE_LABEL[type] || type;
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: any, record: any) => {
        const num = parseFloat(String(amount));
        const isNeg = NEGATIVE_TYPES.has(record.type);
        const color = isNeg ? '#ff4d4f' : '#52c41a';
        const sign = isNeg ? '-' : '+';
        return (
          <span
            style={{ fontFamily: 'monospace', color, cursor: 'pointer' }}
            onClick={() => setSelectedTx(record)}
          >
            {sign}{Math.abs(num).toFixed(2)} USDT
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
      title: '首次充值',
      dataIndex: 'first_deposit_at',
      key: 'first_deposit_at',
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : <Tag color="default">未充值</Tag>,
    },
    {
      title: '邀请奖励',
      dataIndex: 'reward_paid',
      key: 'reward_paid',
      render: (paid: boolean, record: any) => {
        if (paid) {
          const amount = record.reward_amount ? ` +${parseFloat(String(record.reward_amount)).toFixed(2)} USDT` : '';
          return <Tag color="success">已到账 ✅{amount}</Tag>;
        }
        return <Tag color="warning">待充值 ⏳</Tag>;
      },
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
          {/* Inviter info card */}
          <Card
            title={<span><TeamOutlined style={{ marginRight: 8 }} />邀请关系</span>}
            style={{ marginBottom: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 6 }}>邀请人（谁邀请了当前用户）</div>
                {user.inviter_info ? (
                  <Space>
                    <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {user.inviter_info.first_name || user.inviter_info.username || '未知用户'}
                        {user.inviter_info.username && (
                          <Text type="secondary" style={{ fontWeight: 400, marginLeft: 6 }}>@{user.inviter_info.username}</Text>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#595959' }}>
                        Telegram ID: {user.inviter_info.telegram_id}
                        <Tag
                          color={user.inviter_info.account_status === 'active' ? 'success' : 'warning'}
                          style={{ marginLeft: 8, fontSize: 11 }}
                        >
                          {user.inviter_info.account_status}
                        </Tag>
                      </div>
                    </div>
                  </Space>
                ) : (
                  <Tag color="default">直接注册（无邀请人）</Tag>
                )}
              </div>
              <div style={{ borderLeft: '1px solid #f0f0f0', paddingLeft: 24 }}>
                <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>当前用户共邀请</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#1890ff' }}>{user.invite_count ?? 0} 人</div>
              </div>
            </div>
          </Card>

          <Card title={`被邀请人列表 (共 ${user.invite_count ?? 0} 人)`}>
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

      {/* Transaction Detail Modal */}
      <Modal
        title="交易详情"
        open={!!selectedTx}
        onCancel={() => setSelectedTx(null)}
        footer={null}
      >
        {selectedTx && (() => {
          const tx = selectedTx;
          const isNeg = NEGATIVE_TYPES.has(tx.type);
          const num = parseFloat(String(tx.amount));
          const color = isNeg ? '#ff4d4f' : '#52c41a';
          const amtStr = `${isNeg ? '-' : '+'}${Math.abs(num).toFixed(2)} USDT`;
          const label = TX_TYPE_LABEL[tx.type] || tx.type;
          const tagColor = TYPE_TAG_COLOR[tx.type] || 'default';
          const statusMap: Record<string, string> = {
            completed: 'success', confirmed: 'success',
            pending: 'warning', processing: 'processing',
            failed: 'error', rejected: 'error',
          };
          return (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="类型">
                <Tag color={tagColor}>{label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="金额">
                <span style={{ color, fontFamily: 'monospace', fontWeight: 700 }}>{amtStr}</span>
              </Descriptions.Item>
              {tx.status && (
                <Descriptions.Item label="状态">
                  <Tag color={statusMap[tx.status] || 'default'}>{tx.status}</Tag>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="时间">
                {tx.created_at ? new Date(tx.created_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
              {tx.order_id && (
                <Descriptions.Item label="订单号">
                  <code style={{ wordBreak: 'break-all' }}>{tx.order_id}</code>
                </Descriptions.Item>
              )}
              {tx.description && (
                <Descriptions.Item label={tx.type === 'withdrawal' ? '提现地址' : tx.type === 'deposit' ? '交易哈希' : '描述/备注'}>
                  <span style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '12px' }}>{tx.description}</span>
                </Descriptions.Item>
              )}
              {(tx.type === 'trade_win' || tx.type === 'trade_loss') && (
                <Descriptions.Item label="交易方向">
                  <Tag color={tx.type === 'trade_win' ? 'green' : 'red'}>
                    {tx.type === 'trade_win' ? 'WIN' : 'LOSS'}
                  </Tag>
                </Descriptions.Item>
              )}
            </Descriptions>
          );
        })()}
      </Modal>
    </div>
  );
};
