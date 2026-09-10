import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Descriptions, Tag, Button, Space, Modal, Form, Select, InputNumber, Input,
  message, Table, Spin, Statistic, Row, Col, Typography,
} from 'antd';
import {
  ArrowLeftOutlined, DollarOutlined, KeyOutlined, LockOutlined, UnlockOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';

const { Text } = Typography;

const TYPE_LABELS: Record<string, string> = {
  deposit: '充值', withdrawal: '提现', transfer_in: '转入', transfer_out: '转出',
  trade_win: '交易盈利', trade_loss: '交易亏损', admin_credit: '管理员增加', admin_debit: '管理员减少',
  nft_purchase: 'NFT 购买', nft_income: 'NFT 收益', referral_reward: '邀请奖励',
  depin_swap: '闪兑', node_server: '购买节点', asset_stake: '资产质押',
  product_purchase: '购买产品', product_yield: '产品收益',
};

export const WebAccountDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [tokenAssets, setTokenAssets] = useState<any[]>([]);
  const [totalAssetUsdt, setTotalAssetUsdt] = useState(0);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiClient.getUser(id);
      setUser(res.user || null);
      setTransactions(res.transactions || []);
    } catch {
      message.error('获取官网账号详情失败');
    }
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`/api/depin/admin/user/${id}/balances`, {
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (r.ok) {
        const data = await r.json();
        setTokenAssets(Array.isArray(data.assets) ? data.assets : []);
        setTotalAssetUsdt(Number(data.total_usdt || 0));
        setSwaps(Array.isArray(data.swaps) ? data.swaps : []);
      }
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleAdjust = async () => {
    if (!id || !adjustAmount) return;
    setSubmitting(true);
    try {
      await (apiClient as any).adjustBalance(id, { type: adjustType, amount: adjustAmount, reason: adjustReason });
      message.success('余额已调整');
      setAdjustOpen(false);
      fetchDetail();
    } catch (e: any) {
      message.error(e.response?.data?.error || '调整失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFreezeToggle = async () => {
    if (!id || !user) return;
    try {
      await apiClient.updateUser(id, { is_frozen: !user.is_frozen });
      message.success(user.is_frozen ? '已解冻' : '已冻结');
      fetchDetail();
    } catch (e: any) {
      message.error(e.response?.data?.error || '操作失败');
    }
  };

  const fmt = (v?: number) => `${Number(v || 0).toFixed(2)} USDT`;
  const negativeTypes = ['withdrawal', 'transfer_out', 'trade_loss', 'admin_debit', 'nft_purchase', 'depin_swap', 'node_server', 'asset_stake', 'product_purchase'];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/web-accounts')}>返回</Button>
          <h2 style={{ margin: 0 }}>官网账号详情</h2>
        </Space>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchDetail}>刷新</Button>
          <Button type="primary" icon={<DollarOutlined />} onClick={() => setAdjustOpen(true)}>调整余额</Button>
          <Button danger={!(user?.is_frozen)} icon={user?.is_frozen ? <UnlockOutlined /> : <LockOutlined />} onClick={handleFreezeToggle}>
            {user?.is_frozen ? '解冻' : '冻结'}
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}><Card><Statistic title="USDT 钱包" value={Number(user?.wallet_balance ?? 0)} precision={2} suffix="USDT" /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title="总资产估值" value={totalAssetUsdt} precision={2} suffix="USDT" /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title="累计充值" value={Number(user?.real_deposit_total ?? user?.total_recharged ?? 0)} precision={2} /></Card></Col>
          <Col xs={12} md={6}><Card><Statistic title="累计提现" value={Number(user?.approved_withdrawal_total ?? user?.total_withdrawn ?? 0)} precision={2} /></Card></Col>
        </Row>

        <Card title="多币资产（含闪兑持仓）" style={{ marginBottom: 16 }}>
          <Table size="small" rowKey="symbol" pagination={false} dataSource={tokenAssets}
            locale={{ emptyText: '暂无' }}
            columns={[
              { title: '币种', dataIndex: 'symbol' },
              { title: '数量', dataIndex: 'amount', render: (n: number) => Number(n || 0).toFixed(6) },
              { title: '单价', dataIndex: 'price_usdt', render: (n: number) => (n ? Number(n).toFixed(4) : '—') },
              { title: '估值 USDT', dataIndex: 'value_usdt', render: (n: number) => Number(n || 0).toFixed(2) },
            ]}
          />
        </Card>

        <Card title="闪兑记录" style={{ marginBottom: 16 }}>
          <Table size="small" rowKey="id" pagination={{ pageSize: 8 }} dataSource={swaps}
            locale={{ emptyText: '暂无闪兑' }}
            columns={[
              { title: '支付', render: (_: any, r: any) => `${Number(r.from_amount).toFixed(6)} ${r.from_asset}` },
              { title: '获得', render: (_: any, r: any) => `${Number(r.to_amount).toFixed(6)} ${r.to_asset}` },
              { title: '汇率', dataIndex: 'rate', render: (n: number) => (n != null ? Number(n).toFixed(6) : '—') },
              { title: '时间', dataIndex: 'created_at', render: (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '—') },
            ]}
          />
        </Card>

        <Card title="账号信息" style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label="邮箱">{user?.email || '—'}</Descriptions.Item>
            <Descriptions.Item label="UID">{user?.unique_id || '—'}</Descriptions.Item>
            <Descriptions.Item label="状态">{user?.is_frozen ? <Tag color="error">冻结</Tag> : <Tag color="success">正常</Tag>}</Descriptions.Item>
            <Descriptions.Item label="冻结余额">{fmt(user?.frozen_balance)}</Descriptions.Item>
            <Descriptions.Item label="奖励余额">{fmt(user?.reward_balance)}</Descriptions.Item>
            <Descriptions.Item label="注册时间">{user?.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '—'}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="帐变 / 流水">
          <Table size="small" rowKey="id" dataSource={transactions} pagination={{ pageSize: 15 }}
            columns={[
              { title: '类型', dataIndex: 'type', render: (t: string) => TYPE_LABELS[t] || t },
              {
                title: '金额', dataIndex: 'amount',
                render: (amount: number, record: any) => {
                  const neg = negativeTypes.includes(record.type);
                  const v = Number(amount || 0);
                  return <span style={{ color: neg ? '#cf1322' : '#3f8600' }}>{neg ? '-' : '+'}{Math.abs(v).toFixed(2)}</span>;
                },
              },
              { title: '状态', dataIndex: 'status', render: (s: string) => <Tag>{s}</Tag> },
              { title: '时间', dataIndex: 'created_at', render: (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '—') },
              { title: '备注', dataIndex: 'description', ellipsis: true },
            ]}
          />
        </Card>
      </Spin>

      <Modal title="调整余额" open={adjustOpen} onOk={handleAdjust} onCancel={() => setAdjustOpen(false)} confirmLoading={submitting} okText="确认">
        <Form layout="vertical">
          <Form.Item label="类型">
            <Select value={adjustType} onChange={setAdjustType} options={[{ value: 'add', label: '增加' }, { value: 'subtract', label: '减少' }]} />
          </Form.Item>
          <Form.Item label="金额 USDT">
            <InputNumber min={0} style={{ width: '100%' }} value={adjustAmount} onChange={(v) => setAdjustAmount(Number(v || 0))} />
          </Form.Item>
          <Form.Item label="备注">
            <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WebAccountDetail;
