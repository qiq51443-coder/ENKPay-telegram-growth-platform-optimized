import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Select,
  InputNumber,
  Input,
  message,
  Table,
  Spin,
  Statistic,
  Row,
  Col,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  DollarOutlined,
  LockOutlined,
  UnlockOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';

const { Text } = Typography;

interface WebAccountUser {
  id: string;
  email?: string;
  username?: string;
  unique_id?: string;
  register_type?: string;
  account_status?: string;
  is_frozen?: boolean;
  balance?: number;
  wallet_balance?: number;
  reward_balance?: number;
  red_packet_balance?: number;
  frozen_balance?: number;
  total_recharged?: number;
  total_withdrawn?: number;
  real_deposit_total?: number;
  approved_withdrawal_total?: number;
  invite_count?: number;
  created_at?: string;
  last_active_at?: string;
}

interface TxRow {
  id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  description?: string;
  order_id?: string;
}

const TYPE_LABELS: Record<string, string> = {
  deposit: '充值',
  withdrawal: '提现',
  transfer_in: '转入',
  transfer_out: '转出',
  trade_win: '交易盈利',
  trade_loss: '交易亏损',
  admin_credit: '管理员增加',
  admin_debit: '管理员减少',
  nft_purchase: 'NFT 购买',
  nft_income: 'NFT 收益',
  referral_reward: '邀请奖励',
};

export const WebAccountDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<WebAccountUser | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustAmount, setAdjustAmount] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiClient.getUser(id);
      setUser(res.user || null);
      setTransactions(res.transactions || []);
    } catch (error) {
      console.error('Failed to fetch web account detail:', error);
      message.error('获取官网账号详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleAdjustBalance = async () => {
    if (!id) return;
    if (!adjustAmount || adjustAmount <= 0) {
      message.warning('请输入大于 0 的金额');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.adjustBalance(id, {
        amount: adjustAmount,
        type: adjustType,
        reason: adjustReason,
      });
      message.success('余额调整成功');
      setAdjustOpen(false);
      setAdjustAmount(0);
      setAdjustReason('');
      fetchDetail();
    } catch (error: any) {
      message.error(error.response?.data?.error || '余额调整失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFreezeToggle = async () => {
    if (!id || !user) return;
    const willFreeze = !user.is_frozen;
    Modal.confirm({
      title: willFreeze ? '冻结账号' : '解冻账号',
      content: `确认${willFreeze ? '冻结' : '解冻'} ${user.email || user.unique_id} 吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiClient.post(`/users/${id}/${willFreeze ? 'freeze' : 'unfreeze'}`);
          message.success(willFreeze ? '账号已冻结' : '账号已解冻');
          fetchDetail();
        } catch {
          message.error('操作失败');
        }
      },
    });
  };

  const fmt = (v?: number) => `${Number(v || 0).toFixed(2)} USDT`;

  const txColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => TYPE_LABELS[type] || type,
    },
    {
      title: '金额 (USDT)',
      dataIndex: 'amount',
      key: 'amount',
      width: 140,
      render: (amount: number, record: TxRow) => {
        const negative = ['withdrawal', 'transfer_out', 'trade_loss', 'admin_debit', 'nft_purchase'].includes(record.type);
        const v = Number(amount || 0);
        return (
          <span style={{ fontFamily: 'monospace', color: negative ? '#cf1322' : '#3f8600' }}>
            {negative ? '-' : '+'}{Math.abs(v).toFixed(2)}
          </span>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <Tag>{status}</Tag>,
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-CN') : '-'),
    },
    {
      title: '备注',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
  ];

  const statusInfo = (() => {
    if (user?.is_frozen) return { text: '已冻结', color: 'error' };
    const map: Record<string, { text: string; color: string }> = {
      active: { text: '正常', color: 'success' },
      suspended: { text: '暂停', color: 'warning' },
      banned: { text: '封禁', color: 'error' },
    };
    return map[user?.account_status || ''] || { text: user?.account_status || '-', color: 'default' };
  })();

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/web-accounts')}>
            返回官网账号
          </Button>
          <h2 style={{ margin: 0 }}>官网账号详情</h2>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchDetail}>
            刷新
          </Button>
          <Button type="primary" icon={<DollarOutlined />} onClick={() => setAdjustOpen(true)}>
            调整余额
          </Button>
          {user?.is_frozen ? (
            <Button icon={<UnlockOutlined />} onClick={handleFreezeToggle}>
              解冻
            </Button>
          ) : (
            <Button danger icon={<LockOutlined />} onClick={handleFreezeToggle}>
              冻结
            </Button>
          )}
        </Space>
      </div>

      <Spin spinning={loading}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic title="钱包余额" value={Number(user?.wallet_balance ?? user?.balance ?? 0)} precision={2} suffix="USDT" />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="奖励余额" value={Number(user?.reward_balance ?? 0)} precision={2} suffix="USDT" />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="累计充值" value={Number(user?.real_deposit_total ?? user?.total_recharged ?? 0)} precision={2} suffix="USDT" />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="累计提现" value={Number(user?.approved_withdrawal_total ?? user?.total_withdrawn ?? 0)} precision={2} suffix="USDT" />
            </Card>
          </Col>
        </Row>

        <Card title="账号信息" style={{ marginBottom: 16 }}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="邮箱">
              {user?.email ? <Text copyable>{user.email}</Text> : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="UID">{user?.unique_id || '-'}</Descriptions.Item>
            <Descriptions.Item label="账号状态">
              <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="注册类型">{user?.register_type || '-'}</Descriptions.Item>
            <Descriptions.Item label="冻结余额">{fmt(user?.frozen_balance)}</Descriptions.Item>
            <Descriptions.Item label="邀请人数">{user?.invite_count ?? 0}</Descriptions.Item>
            <Descriptions.Item label="注册时间">
              {user?.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="最后活跃">
              {user?.last_active_at ? new Date(user.last_active_at).toLocaleString('zh-CN') : '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="交易记录（最近 100 条）">
          <Table
            columns={txColumns}
            dataSource={transactions}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 800 }}
          />
        </Card>
      </Spin>

      <Modal
        title={`调整余额 - ${user?.email || user?.unique_id || '官网账号'}`}
        open={adjustOpen}
        onOk={handleAdjustBalance}
        onCancel={() => setAdjustOpen(false)}
        okText="确认调整"
        cancelText="取消"
        confirmLoading={submitting}
      >
        <Form layout="vertical">
          <Form.Item label="操作类型">
            <Select value={adjustType} onChange={(v) => setAdjustType(v)}>
              <Select.Option value="add">增加</Select.Option>
              <Select.Option value="subtract">减少</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="金额">
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              value={adjustAmount}
              onChange={(v) => setAdjustAmount(v || 0)}
              prefix="$"
            />
          </Form.Item>
          <Form.Item label="原因">
            <Input
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="请输入调整原因（可选）"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WebAccountDetail;
