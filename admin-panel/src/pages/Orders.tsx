import React, { useEffect, useState } from 'react';
import { Table, Card, Input, Select, Button, Tag, Typography, Space, Row, Col, Modal, Descriptions } from 'antd';
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

const NEGATIVE_TYPES = new Set([
  'trade_loss', 'product_purchase', 'nft_purchase',
  'auction_join', 'auction_buy', 'transfer_out',
  'withdrawal', 'admin_debit',
]);

const TYPE_TAG_COLOR: Record<string, string> = {
  withdrawal:           'red',
  trade_loss:           'red',
  product_purchase:     'red',
  nft_purchase:         'red',
  auction_join:         'red',
  auction_buy:          'red',
  transfer_out:         'red',
  admin_debit:          'red',
  deposit:              'green',
  trade_win:            'green',
  reward:               'green',
  invite:               'green',
  invite_reward:        'green',
  follow_reward:        'green',
  bind_reward:          'green',
  admin_credit:         'green',
  product_yield:        'green',
  nft_income:           'green',
  nft_settle:           'green',
  nft_principal_return: 'green',
  product_refund:       'green',
  auction_redeem:       'green',
  auction_refund:       'green',
  transfer_in:          'green',
  red_packet:           'gold',
  admin_adjustment:     'default',
};

const TX_TYPE_LABEL: Record<string, string> = {
  deposit:              '充值',
  withdrawal:           '提现',
  transfer_in:          '转入',
  transfer_out:         '转出',
  trade_win:            '交易盈利',
  trade_loss:           '交易亏损',
  reward:               '奖励',
  red_packet:           '红包',
  invite:               '邀请奖励',
  invite_reward:        '邀请奖励',
  follow_reward:        '关注奖励',
  bind_reward:          '绑定奖励',
  admin_credit:         '管理员增加',
  admin_debit:          '管理员扣减',
  admin_adjustment:     '管理员调整',
  auction_buy:          '夺宝参与',
  auction_join:         '夺宝参与',
  auction_redeem:       '夺宝兑奖',
  auction_refund:       '夺宝退款',
  nft_purchase:         'NFT购买',
  nft_settle:           'NFT结算收益',
  product_purchase:     '产品购买',
  nft_income:           'NFT收益',
  nft_principal_return: 'NFT本金返还',
  product_yield:        '产品收益',
  product_refund:       '产品退款',
};

export const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchOrderId, setSearchOrderId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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
      render: (type: string) => <Tag color={TYPE_TAG_COLOR[type] || 'default'}>{TX_TYPE_LABEL[type] || type}</Tag>,
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
      render: (amount: number, record: Order) => {
        const num = parseFloat(String(amount));
        const isNeg = NEGATIVE_TYPES.has(record.type);
        const color = isNeg ? '#ff4d4f' : '#52c41a';
        const sign = isNeg ? '-' : '+';
        return (
          <span style={{ fontFamily: 'monospace', color }}>
            {sign}{Math.abs(num).toFixed(2)} USDT
          </span>
        );
      },
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
          onRow={(record) => ({ onClick: () => setSelectedOrder(record), style: { cursor: 'pointer' } })}
          pagination={{
            current: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            onChange: (page) => setPagination(prev => ({ ...prev, page })),
          }}
        />
      </Card>

      {/* Order Detail Modal */}
      <Modal
        title="订单详情"
        open={!!selectedOrder}
        onCancel={() => setSelectedOrder(null)}
        footer={null}
      >
        {selectedOrder && (() => {
          const o = selectedOrder;
          const isNeg = NEGATIVE_TYPES.has(o.type);
          const num = parseFloat(String(o.amount));
          const color = isNeg ? '#ff4d4f' : '#52c41a';
          const amtStr = `${isNeg ? '-' : '+'}${Math.abs(num).toFixed(2)} USDT`;
          const label = TX_TYPE_LABEL[o.type] || o.type;
          const tagColor = TYPE_TAG_COLOR[o.type] || 'default';
          const statusColorMap: Record<string, string> = {
            pending: 'orange', processing: 'blue',
            completed: 'green', cancelled: 'red',
          };
          return (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="订单ID">
                <code style={{ wordBreak: 'break-all' }}>{o.order_id || '-'}</code>
              </Descriptions.Item>
              <Descriptions.Item label="用户">
                {o.username || '未知'}{o.unique_id ? ` (#${o.unique_id})` : ''}
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color={tagColor}>{label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="金额">
                <span style={{ color, fontFamily: 'monospace', fontWeight: 700 }}>{amtStr}</span>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColorMap[o.status] || 'default'}>{o.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {o.created_at ? new Date(o.created_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
              {o.description && (
                <Descriptions.Item label={o.type === 'withdrawal' ? '提现地址' : o.type === 'deposit' ? '交易哈希' : '描述'}>
                  <span style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '12px' }}>{o.description}</span>
                </Descriptions.Item>
              )}
              {(o.type === 'trade_win' || o.type === 'trade_loss') && (
                <Descriptions.Item label="交易方向">
                  <Tag color={o.type === 'trade_win' ? 'green' : 'red'}>
                    {o.type === 'trade_win' ? 'WIN' : 'LOSS'}
                  </Tag>
                </Descriptions.Item>
              )}
            </Descriptions>
          );
        })()}
      </Modal>
    </div>
  );
};
