import React, { useEffect, useState } from 'react';
import { Table, Input, Space, Button, Typography, Alert, Tag } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import apiClient from '../services/api';

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

const WebAccountLedgerPage: React.FC = () => {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await apiClient.get('/admin/web-accounts/ledger', {
        params: { search: search || undefined, limit: 50 },
      });
      setRows(res?.items || res?.data || res?.transactions || []);
    } catch {
      try {
        const res2: any = await apiClient.get('/admin/wallet/transfers', { params: { limit: 20 } });
        setRows(res2?.data || res2?.items || []);
      } catch {
        setRows([]);
      }
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
      <Title level={3} style={{ marginTop: 0 }}>官网帐变记录</Title>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="官网账号专用"
        description="与 Bot 用户流水分开。用于查看邮箱用户的余额增减。后端接口完善后数据会自动出现。"
      />
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索邮箱"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
          allowClear
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>查询</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </Space>
      <Table rowKey={(r) => String(r.id)} loading={loading} columns={columns} dataSource={rows} pagination={{ pageSize: 20 }} />
    </div>
  );
};

export const WebAccountLedger: React.FC = () => <WebAccountLedgerPage />;
export default WebAccountLedger;
