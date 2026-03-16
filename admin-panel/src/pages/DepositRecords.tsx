import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Select, Input, Button, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

interface DepositRecord {
  id: string;
  user_id: string;
  network_id: string;
  amount: number;
  tx_hash: string;
  from_address: string;
  to_address: string;
  status: string;
  order_id?: string;
  created_at: string;
  confirmed_at?: string;
  user?: {
    telegram_id: number;
    username?: string;
    first_name?: string;
  };
  network?: {
    network_name: string;
    network_display: string;
  };
}

export const DepositRecords: React.FC = () => {
  const [records, setRecords] = useState<DepositRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchUser, setSearchUser] = useState<string>('');

  useEffect(() => {
    fetchRecords();
    const interval = setInterval(fetchRecords, 30000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      if (searchUser) params.user = searchUser;
      
      const response = await apiClient.getDepositRecords(params);
      setRecords(response.data || response.deposits || []);
    } catch (error) {
      console.error('Failed to fetch deposit records:', error);
      message.error('获取充值记录失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: any) => id ? String(id).substring(0, 8) : '-',
    },
    {
      title: '用户',
      key: 'user',
      width: 150,
      render: (_: any, record: DepositRecord) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {record.user?.username || record.user?.first_name || '未知'}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            ID: {record.user?.telegram_id}
          </div>
        </div>
      ),
    },
    {
      title: '网络',
      key: 'network',
      width: 120,
      render: (_: any, record: DepositRecord) => (
        <Tag color="blue">{record.network?.network_display || record.network?.network_name || '-'}</Tag>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (amount: number) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#52c41a' }}>
          {amount.toFixed(2)} USDT
        </span>
      ),
    },
    {
      title: '交易哈希',
      dataIndex: 'tx_hash',
      key: 'tx_hash',
      ellipsis: true,
      width: 200,
      render: (hash: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{hash}</span>
      ),
    },
    {
      title: '订单ID',
      dataIndex: 'order_id',
      key: 'order_id',
      width: 130,
      ellipsis: true,
      render: (orderId: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1890ff' }}>
          {orderId || '-'}
        </span>
      ),
    },
    {
      title: '发送地址',
      dataIndex: 'from_address',
      key: 'from_address',
      ellipsis: true,
      width: 150,
      render: (address: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{address}</span>
      ),
    },
    {
      title: '接收地址',
      dataIndex: 'to_address',
      key: 'to_address',
      ellipsis: true,
      width: 150,
      render: (address: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{address}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          pending: { text: '待确认', color: 'warning' },
          confirming: { text: '确认中', color: 'processing' },
          confirmed: { text: '已确认', color: 'success' },
          credited: { text: '已到账', color: 'success' },
          failed: { text: '失败', color: 'error' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '确认时间',
      dataIndex: 'confirmed_at',
      key: 'confirmed_at',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>充值记录</h2>
        <p style={{ color: '#666', marginTop: 4 }}>查看所有用户充值记录</p>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: '#fff', borderRadius: 8 }}>
        <Space wrap>
          <Select
            placeholder="筛选状态"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 150 }}
            allowClear
          >
            <Select.Option value="">全部</Select.Option>
            <Select.Option value="pending">待确认</Select.Option>
            <Select.Option value="confirming">确认中</Select.Option>
            <Select.Option value="confirmed">已确认</Select.Option>
            <Select.Option value="credited">已到账</Select.Option>
            <Select.Option value="failed">失败</Select.Option>
          </Select>
          
          <Input
            placeholder="搜索用户"
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            onPressEnter={fetchRecords}
            style={{ width: 200 }}
            allowClear
          />
          <Button onClick={fetchRecords} icon={<ReloadOutlined />} loading={loading}>
            刷新
          </Button>
          <span style={{ color: '#999', fontSize: 12 }}>每30秒自动刷新</span>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1600 }}
      />
    </div>
  );
};
