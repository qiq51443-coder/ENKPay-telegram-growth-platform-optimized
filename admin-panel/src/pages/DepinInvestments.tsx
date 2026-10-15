import React, { useEffect, useState } from 'react';
import { Table, Tag, Input, Select, Space, Button, Typography, Alert, message, Progress } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface DepinRow {
  id: string | number;
  user_email?: string;
  user_id?: string;
  mode: string;
  amount: number;
  status: string;
  created_at?: string;
  start_at?: string;
  end_at?: string;
  lock_days?: number;
  daily_yield_rate?: number;
  progress_pct?: number;
  elapsed_days?: number;
  total_days?: number;
  remaining_days?: number;
  is_matured?: boolean;
  claimable_yield?: number;
  claimed_yield?: number;
  principal_returned?: boolean;
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
  const [summary, setSummary] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    setHint('');
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (mode) q.set('mode', mode);
      q.set('limit', '100');
      const res = await fetch(`/api/depin/admin/investments?${q.toString()}`, {
        headers: authHeaders(),
      });
      // 兼容旧路径
      let data: any = {};
      if (res.ok) {
        data = await res.json().catch(() => ({}));
      } else {
        const res2 = await fetch(`/api/admin/depin/investments?${q.toString()}`, {
          headers: authHeaders(),
        });
        if (res2.ok) data = await res2.json().catch(() => ({}));
        else {
          setRows([]);
          setHint('DePIN 投资接口加载失败，请确认后端 /api/depin/admin/investments 已部署。');
          return;
        }
      }
      setRows(toArray(data));
      setSummary(data?.summary || null);
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
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    {
      title: '官网邮箱',
      dataIndex: 'user_email',
      key: 'user_email',
      width: 180,
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 110,
      render: (m: string) => {
        const info = MODE_LABEL[m] || { text: m || '-', color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '本金 (USDC)',
      dataIndex: 'amount',
      key: 'amount',
      width: 110,
      render: (n: number) => Number(n || 0).toFixed(2),
    },
    {
      title: '天数进度',
      key: 'progress',
      width: 160,
      render: (_: any, r: DepinRow) => {
        const pct = Math.min(100, Math.max(0, Number(r.progress_pct || 0)));
        const total = Number(r.total_days || r.lock_days || 0);
        const elapsed = Number(r.elapsed_days || 0);
        return (
          <div>
            <Progress percent={Number(pct.toFixed(0))} size="small" status={r.is_matured || r.status === 'completed' ? 'success' : 'active'} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {elapsed.toFixed(1)}/{total || '—'} 天
              {r.remaining_days != null && r.status === 'active' ? ` · 剩 ${Number(r.remaining_days).toFixed(1)}` : ''}
            </Text>
          </div>
        );
      },
    },
    {
      title: '可领 / 已领',
      key: 'yield',
      width: 130,
      render: (_: any, r: DepinRow) => (
        <span>
          {Number(r.claimable_yield || 0).toFixed(4)}
          <Text type="secondary"> / {Number(r.claimed_yield || 0).toFixed(4)}</Text>
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string, r: DepinRow) => {
        if (s === 'completed' || r.principal_returned) return <Tag color="green">已到期返还</Tag>;
        if (r.is_matured) return <Tag color="orange">已到期(待结算)</Tag>;
        return <Tag color="blue">{s || 'active'}</Tag>;
      },
    },
    {
      title: '到期时间',
      dataIndex: 'end_at',
      key: 'end_at',
      width: 170,
      render: (d: string) => (d ? new Date(d).toLocaleString('zh-CN') : '—'),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
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
        type="info"
        showIcon
        message="到期自动返还"
        description="打开本页或用户打开算力页时，系统会结算已到期仓位：返还本金并补发未领收益，状态变为 completed。"
      />
      {summary ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="success"
          showIcon
          message={`共 ${summary.count ?? rows.length} 条 · 本金合计 ${Number(summary.total_principal || 0).toFixed(2)} USDC · 可领 ${Number(summary.total_claimable || 0).toFixed(4)} · 已领 ${Number(summary.total_claimed || 0).toFixed(4)}`}
        />
      ) : null}
      {hint ? <Alert style={{ marginBottom: 16 }} type="warning" showIcon message={hint} /> : null}
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
        scroll={{ x: 1100 }}
        locale={{ emptyText: '暂无数据' }}
      />
    </div>
  );
};

export const DepinInvestments: React.FC = () => <DepinInvestmentsPage />;
export default DepinInvestments;
