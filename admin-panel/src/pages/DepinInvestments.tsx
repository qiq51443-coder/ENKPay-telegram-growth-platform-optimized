import React, { useEffect, useState } from 'react';
import { Table, Tag, Input, Select, Space, Button, Typography, Alert, message } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface DepinRow {
  id: string;
  user_email?: string;
  user_id?: string;
  mode: string;
  amount: number;
  status: string;
  created_at?: string;
}

const MODE_LABEL: Record<string, { text: string; color: string }> = {
  node_server: { text: '购买节点', color: 'blue' },
  token_exchange: { text: '兑换代币', color: 'purple' },
  asset_stake: { text: '资产质押', color: 'green' },
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toArray(payload: any): DepinRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

const DepinInvestmentsPage: React.FC = () => {
  const [rows, setRows] = useState<DepinRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<string>('');
  const [hint, setHint] = useState('');

  const load = async () => {
    setLoading(true);
    setHint('');
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (mode) q.set('mode', mode);
      q.set('limit', '50');
      const res = await fetch(`/api/admin/depin/investments?${q.toString()}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setRows(toArray(data));
        return;
      }
      setRows([]);
      setHint('DePIN 投资接口尚未部署，列表为空属正常。请先在「DePIN 配置」中设置三种模式。');
    } catch (e) {
      console.error(e);
      setRows([]);
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    { title: '记录 ID', dataIndex: 'id', key: 'id', width: 120, ellipsis: true },
    {
      title: '官网邮箱',
      dataIndex: 'user_email',
      key: 'user_email',
      width: 200,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 120,
      render: (m: string) => {
        const info = MODE_LABEL[m] || { text: m || '-', color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '金额 (USDT)',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (n: number) => Number(n || 0).toFixed(2),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => <Tag>{s || '—'}</Tag>,
    },
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
        DePIN 用户投资详情
      </Title>
      <Alert
        style={{ marginBottom: 16 }}
        type="warning"
        showIcon
        message="仅官网账号"
        description="只展示邮箱注册用户的 DePIN 记录，与 Telegram Bot 用户分开。"
      />
      {hint ? <Alert style={{ marginBottom: 16 }} type="info" showIcon message={hint} /> : null}
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索邮箱"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 240 }}
          allowClear
        />
        <Select
          placeholder="投资模式"
          allowClear
          style={{ width: 160 }}
          value={mode || undefined}
          onChange={(v) => setMode(v || '')}
          options={[
            { value: 'node_server', label: '购买节点' },
            { value: 'token_exchange', label: '兑换代币' },
            { value: 'asset_stake', label: '资产质押' },
          ]}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={Array.isArray(rows) ? rows : []}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: '暂无数据' }}
      />
    </div>
  );
};

export const DepinInvestments: React.FC = () => <DepinInvestmentsPage />;
export default DepinInvestments;
