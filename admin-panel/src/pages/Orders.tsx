import React, { useEffect, useState } from 'react';
import { Table, Card, Input, Select, Button, Tag, Typography, Space, Row, Col } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title } = Typography;
const { Option } = Select;

interface Order {
  id: string;
  order_id: string;
  user_id: string;
  username: string;
  unique_id: string;
  telegram_id: number;
  type: string;
  status: string;
  amount: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchOrderId, setSearchOrderId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  useEffect(() => {
    fetchOrders();
  }, [pagination.page, filterStatus, filterType]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (searchOrderId) params.order_id = searchOrderId;
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.type = filterType;

      const response = await axios.get('/api/orders', {
        params,
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setOrders(response.data.orders);
      setPagination(prev => ({ ...prev, total: response.data.pagination.total }));
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    pending: 'orange',
    processing: 'blue',
    completed: 'green',
    cancelled: 'red',
  };

  const typeColors: Record<string, string> = {
    transfer: 'purple',
    deposit: 'green',
    withdrawal: 'orange',
    red_packet: 'red',
  };

  const columns = [
    {
      title: '订单ID',
      dataIndex: 'order_id',
      key: 'order_id',
      render: (text: string) => <code>{text}</code>,
    },
    {
      title: '用户',
      key: 'user',
      render: (_: any, record: Order) => (
        <div>
          <div>{record.username || '未知'}</div>
          {record.unique_id && <div style={{ color: '#999', fontSize: '12px' }}>#{record.unique_id}</div>}
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Tag color={typeColors[type] || 'default'}>{type}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={statusColors[status] || 'default'}>{status}</Tag>,
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => `$${parseFloat(String(amount)).toFixed(2)}`,
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div>
      <Title level={2}>订单管理</Title>
      <Card>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8}>
            <Input
              placeholder="搜索订单ID"
              prefix={<SearchOutlined />}
              value={searchOrderId}
              onChange={e => setSearchOrderId(e.target.value)}
              onPressEnter={fetchOrders}
              allowClear
            />
          </Col>
          <Col xs={24} sm={6}>
            <Select
              placeholder="筛选状态"
              style={{ width: '100%' }}
              value={filterStatus || undefined}
              onChange={v => setFilterStatus(v || '')}
              allowClear
            >
              <Option value="pending">待处理</Option>
              <Option value="processing">处理中</Option>
              <Option value="completed">已完成</Option>
              <Option value="cancelled">已取消</Option>
            </Select>
          </Col>
          <Col xs={24} sm={6}>
            <Select
              placeholder="筛选类型"
              style={{ width: '100%' }}
              value={filterType || undefined}
              onChange={v => setFilterType(v || '')}
              allowClear
            >
              <Option value="transfer">转账</Option>
              <Option value="deposit">充值</Option>
              <Option value="withdrawal">提现</Option>
              <Option value="red_packet">红包</Option>
            </Select>
          </Col>
          <Col xs={24} sm={4}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={fetchOrders}>
                搜索
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setSearchOrderId(''); setFilterStatus(''); setFilterType(''); fetchOrders(); }}>
                重置
              </Button>
            </Space>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            onChange: (page) => setPagination(prev => ({ ...prev, page })),
          }}
        />
      </Card>
    </div>
  );
};
