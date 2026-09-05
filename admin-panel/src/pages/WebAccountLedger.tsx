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
  remark?: string;
  created_at?: string;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function toArray(payload: any): LedgerRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.transactions)) return payload.transactions;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
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
      q.set('limit', '50');

      // 专用帐变接口（后端未实现时会 404）
      const r1 = await fetch(`/api/admin/web-accounts/ledger?${q.toString()}`, {
        headers: authHeaders(),
      });
      if (r1.ok) {
        const data = await r1.json().catch(() => ({}));
        const list = toArray(data);
        setRows(list);
        if (list.length === 0) setHint('暂无帐变数据（接口已通，列表为空）');
        return;
      }

      // 降级：用户流水 / 转账记录（若存在）
      const r2 = await fetch(`/api/admin/wallet/transfers?limit=50`, {
        headers: authHeaders(),
      });
      if (r2.ok) {
        const data = await r2.json().catch(() => ({}));
        const list = toArray(data);
        setRows(list);
        setHint('专用帐变接口尚未部署，已尝试展示转账/流水类数据');
        return;
      }

      setRows([]);
      setHint('帐变接口尚未部署。页面可正常打开；后端就绪后将自动显示官网用户余额变动。');
    } catch (e: any) {
      console.error(e);
      setRows([]);
      setHint('加载失败，请稍后重试');
      message.error('帐变记录加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 120, ellipsis: true },
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
      render: (t: string) => <Tag>{t || '—'}</Tag>,
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (n: number) => (n == null ? '—' : Number(n).toFixed(2)),
    },
    {
      title: '变动后余额',
      dataIndex: 'balance_after',
      key: 'balance_after',
      width: 120,
      render: (n: number) => (n == null ? '—' : Number(n).toFixed(2)),
    },
    {
      title: '备注',
      key: 'reason',
      ellipsis: true,
      render: (_: unknown, r: LedgerRow) => r.reason || r.remark || '—',
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
        官网帐变记录
      </Title>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="官网账号专用"
        description="与 Bot 用户流水分开。用于查看邮箱用户的余额增减（充值、提现、调账、DePIN 等）。"
      />
      {hint ? (
        <Alert style={{ marginBottom: 16 }} type="warning" showIcon message={hint} />
      ) : null}
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
