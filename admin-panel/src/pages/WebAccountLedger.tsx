import React, { useEffect, useState } from 'react';
import { Table, Input, Space, Button, Typography, Alert, Tag, message } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface LedgerRow {
  id: string;
  user_email?: string;
  user_id?: string;
  type?: string;
  amount?: number;
  balance_after?: number;
  reason?: string;
  created_at?: string;
}

const TYPE_LABEL: Record<string, { text: string; color: string }> = {
  deposit: { text: '充值', color: 'green' },
  withdrawal: { text: '提现', color: 'orange' },
  depin_swap: { text: '闪兑', color: 'purple' },
  node_server: { text: '购买节点', color: 'blue' },
  asset_stake: { text: '资产质押', color: 'cyan' },
  admin_credit: { text: '管理员增加', color: 'green' },
  admin_debit: { text: '管理员减少', color: 'red' },
  trade_win: { text: '交易盈利', color: 'green' },
  trade_loss: { text: '交易亏损', color: 'red' },
  product_purchase: { text: '购买产品', color: 'blue' },
  product_yield: { text: '产品收益', color: 'green' },
  nft_purchase: { text: 'NFT购买', color: 'blue' },
  nft_income: { text: 'NFT收益', color: 'green' },
  referral_reward: { text: '邀请奖励', color: 'green' },
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const WebAccountLedgerPage: React.FC = () => {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [hint, setHint] = useState('');

  const load = async () => {
    setLoading(true);
    setHint('');
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      q.set('limit', '100');
      const res = await fetch(`/api/depin/admin/ledger?${q.toString()}`, { headers: authHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const list = Array.isArray(data.items) ? data.items : [];
      setRows(list);
      if (!list.length) setHint('暂无官网用户帐变（仅 email 注册用户）');
    } catch (e: any) {
      console.error(e);
      setRows([]);
      setHint(e.message || '加载失败');
      message.error('帐变记录加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 100, ellipsis: true },
    {
      title: '官网邮箱',
      dataIndex: 'user_email',
      key: 'user_email',
      width: 200,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (t: string) => {
        const info = TYPE_LABEL[t] || { text: t || '—', color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (n: number) => (n == null ? '—' : Number(n).toFixed(4)),
    },
    {
      title: '变动后余额',
      dataIndex: 'balance_after',
      key: 'balance_after',
      width: 120,
      render: (n: number) => (n == null ? '—' : Number(n).toFixed(2)),
    },
    { title: '备注', dataIndex: 'reason', key: 'reason', ellipsis: true },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '—'),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        官网帐变记录
      </Title>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="仅官网邮箱用户"
        description="与 Bot 用户完全隔离。包含：充值、提现、闪兑、购买节点/产品、质押、管理员增减、盈利/亏损等。"
      />
      {hint ? <Alert style={{ marginBottom: 16 }} type="warning" showIcon message={hint} /> : null}
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="搜索邮箱"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
          allowClear
          onPressEnter={load}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </Space>
      <Table
        rowKey={(r) => String(r.id ?? Math.random())}
        loading={loading}
        columns={columns}
        dataSource={Array.isArray(rows) ? rows : []}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '暂无数据' }}
      />
    </div>
  );
};

export const WebAccountLedger: React.FC = () => <WebAccountLedgerPage />;
export default WebAccountLedger;
