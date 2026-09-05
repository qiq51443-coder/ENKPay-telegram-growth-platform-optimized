import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Input, Select, Space, Button, Typography, Alert } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import apiClient from '../services/api';

const { Title, Text } = Typography;

interface DepinRow {
  id: string;
  user_email?: string;
  user_id?: string;
  mode: 'node_server' | 'token_exchange' | 'asset_stake' | string;
  amount: number;
  status: string;
  created_at?: string;
  meta?: string;
}

const MODE_LABEL: Record<string, { text: string; color: string }> = {
  node_server: { text: '购买节点', color: 'blue' },
  token_exchange: { text: '兑换代币', color: 'purple' },
  asset_stake: { text: '资产质押', color: 'green' },
};

const DepinInvestmentsPage: React.FC = () => {
  const [rows, setRows] = useState<DepinRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await apiClient.get('/admin/depin/investments', {
        params: { search: search || undefined, mode: mode || undefined, limit: 50 },
      });
      setRows(res?.items || res?.data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
      <Title level={3} style={{ marginTop: 0 }}>DePIN 用户投资详情</Title>
      <Alert
        style={{ marginBottom: 16 }}
        type="warning"
        showIcon
        message="仅官网账号"
        description="本列表只展示邮箱注册用户的 DePIN 记录，与 Telegram Bot 用户分开。若后端接口尚未部署，列表为空属正常。"
      />
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
        <Button type="primary" icon={<SearchOutlined />} onClick={load}>查询</Button>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </Space>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} pagination={{ pageSize: 20 }} />
    </div>
  );
};

export const DepinInvestments: React.FC = () => <DepinInvestmentsPage />;
export default DepinInvestments;
