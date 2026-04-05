import React, { useEffect, useState } from 'react';
import { Table, Tag, Select, message, DatePicker, Space, Button, Input } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface TransferRecord {
  id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  fee_amount: number;
  actual_amount: number;
  status: string;
  order_id?: string;
  transfer_type?: string; // 'transfer' | 'scan_transfer'
  created_at: string;
  from_user?: {
    telegram_id: number;
    username?: string;
    first_name?: string;
    unique_id?: string;
  };
  to_user?: {
    telegram_id: number;
    username?: string;
    first_name?: string;
    unique_id?: string;
  };
}

export const TransferRecords: React.FC = () => {
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [orderIdSearch, setOrderIdSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    fetchRecords();
    const interval = setInterval(fetchRecords, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (dateRange) {
        params.start_date = dateRange[0].toISOString();
        params.end_date = dateRange[1].toISOString();
      }
      
      const response = await apiClient.getTransferRecords(params);
      setRecords(response.transfers || []);
    } catch (error) {
      console.error('Failed to fetch transfer records:', error);
      message.error('获取转账记录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (dates: any) => {
    setDateRange(dates);
  };

  const filteredRecords = records.filter(r =>
    (!orderIdSearch || (r.order_id || '').toLowerCase().includes(orderIdSearch.toLowerCase())) &&
    (!filterType || r.transfer_type === filterType)
  );

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: any) => id ? String(id).substring(0, 8) : '-',
    },
    {
      title: '描述',
      dataIndex: 'transfer_type',
      key: 'transfer_type',
      width: 100,
      render: (type: string) => {
        if (type === 'scan_transfer') return <span style={{ color: '#1677ff' }}>扫码</span>;
        if (type === 'transfer') return <span>转账</span>;
        return '-';
      },
    },
    {
      title: '发送方',
      key: 'from_user',
      width: 150,
      render: (_: any, record: TransferRecord) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {record.from_user?.username || record.from_user?.first_name || '未知'}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            ID: {record.from_user?.telegram_id}
          </div>
          {record.from_user?.unique_id && (
            <div style={{ fontSize: '12px', color: '#999' }}>
              UID: {record.from_user.unique_id}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '接收方',
      key: 'to_user',
      width: 150,
      render: (_: any, record: TransferRecord) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {record.to_user?.username || record.to_user?.first_name || '未知'}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            ID: {record.to_user?.telegram_id}
          </div>
          {record.to_user?.unique_id && (
            <div style={{ fontSize: '12px', color: '#999' }}>
              UID: {record.to_user.unique_id}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      render: (amount: number) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
          {parseFloat(String(amount ?? 0)).toFixed(2)} USDT
        </span>
      ),
    },
    {
      title: '手续费',
      dataIndex: 'fee_amount',
      key: 'fee_amount',
      width: 100,
      render: (fee: number) => (
        <span style={{ fontFamily: 'monospace', color: '#ff4d4f' }}>
          {parseFloat(String(fee ?? 0)).toFixed(2)} USDT
        </span>
      ),
    },
    {
      title: '实际到账',
      dataIndex: 'actual_amount',
      key: 'actual_amount',
      width: 120,
      render: (amount: number, record: TransferRecord) => {
        const actual = amount || (record.amount - (record.fee_amount || 0));
        return (
          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#52c41a' }}>
            {parseFloat(String(actual ?? 0)).toFixed(2)} USDT
          </span>
        );
      },
    },
    {
      title: '订单ID',
      dataIndex: 'order_id',
      key: 'order_id',
      width: 140,
      render: (order_id: string) => order_id ? (
        <span
          style={{ fontFamily: 'monospace', fontSize: '12px', cursor: 'pointer', color: '#1677ff' }}
          onClick={() => { navigator.clipboard.writeText(order_id); message.success('已复制'); }}
          title="点击复制"
        >
          {order_id}
        </span>
      ) : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          completed: { text: '完成', color: 'success' },
          pending: { text: '处理中', color: 'processing' },
          failed: { text: '失败', color: 'error' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '转账时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toISOString().slice(0, 19).replace('T', ' ') + ' UTC',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>转账记录</h2>
        <p style={{ color: '#666', marginTop: 4 }}>查看所有用户间转账记录</p>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: '#fff', borderRadius: 8 }}>
        <Space wrap>
          <span>时间范围：</span>
          <RangePicker
            showTime
            value={dateRange}
            onChange={handleDateRangeChange}
            onOk={fetchRecords}
          />
          <Input
            placeholder="按订单ID搜索"
            value={orderIdSearch}
            onChange={e => setOrderIdSearch(e.target.value)}
            allowClear
            style={{ width: 200 }}
          />
          <Select
            placeholder="转账类型"
            style={{ width: 150 }}
            value={filterType || undefined}
            onChange={(v) => setFilterType(v || '')}
            allowClear
          >
            <Option value="transfer">转账</Option>
            <Option value="scan_transfer">扫码转账</Option>
          </Select>
          <Button onClick={fetchRecords} icon={<ReloadOutlined />} loading={loading}>
            刷新
          </Button>
          <span style={{ color: '#999', fontSize: 12 }}>每30秒自动刷新</span>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filteredRecords}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />
    </div>
  );
};
