import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, message,
  Popconfirm, Tag, Space, Select, DatePicker,
} from 'antd';
import { PlusOutlined, EyeOutlined, StopOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

interface Auction {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  product_id?: number;
  product_name?: string;
  product_value: number;
  participant_count: number;
  per_person_cost: number;
  max_purchases_per_user: number;
  platform_fee_percent: number;
  winner_payout: number;
  current_participants: number;
  status: string;
  winner_unique_id?: string;
  drawn_at?: string;
  expires_at: string;
  created_at: string;
}

interface AuctionParticipant {
  id: string;
  user_id: string;
  unique_id: string;
  username?: string;
  first_name?: string;
  quantity: number;
  amount: number;
  is_winner: boolean;
  refunded: boolean;
  created_at: string;
}

interface NFTProduct {
  id: number;
  title: string;
  price: number;
}

export const Auctions: React.FC = () => {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [participants, setParticipants] = useState<AuctionParticipant[]>([]);
  const [nftProducts, setNftProducts] = useState<NFTProduct[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAuctions();
    fetchNFTProducts();
  }, []);

  const fetchAuctions = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getAdminAuctions();
      setAuctions(response.data || []);
    } catch (error) {
      console.error('Failed to fetch auctions:', error);
      message.error('获取竞拍列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchNFTProducts = async () => {
    try {
      const response = await apiClient.getNFTProducts({ limit: 100 });
      setNftProducts(response.products || response.data || []);
    } catch {
      setNftProducts([]);
    }
  };

  const handleCreateSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.expires_at) {
        values.expires_at = values.expires_at.toISOString();
      }
      await apiClient.createAdminAuction(values);
      message.success('竞拍创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchAuctions();
    } catch (error: any) {
      console.error('Failed to create auction:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleViewDetail = async (auction: Auction) => {
    setSelectedAuction(auction);
    try {
      const response = await apiClient.getAdminAuctionDetail(auction.id);
      setParticipants(response.data?.participants || []);
    } catch {
      setParticipants([]);
    }
    setDetailModalOpen(true);
  };

  const handleCancel = async (id: string) => {
    try {
      await apiClient.cancelAdminAuction(id);
      message.success('竞拍已取消，参与者已退款');
      fetchAuctions();
    } catch (error: any) {
      message.error(error.response?.data?.error || '取消失败');
    }
  };

  const handleProductChange = (productId: number) => {
    const product = nftProducts.find(p => p.id === productId);
    if (product) {
      form.setFieldsValue({ product_value: product.price });
      const participantCount = form.getFieldValue('participant_count');
      if (participantCount) {
        form.setFieldsValue({ per_person_cost_preview: (product.price / participantCount).toFixed(2) });
      }
    }
  };

  const statusMap: Record<string, { text: string; color: string }> = {
    active: { text: '进行中', color: 'green' },
    completed: { text: '已完成', color: 'blue' },
    expired: { text: '已过期', color: 'default' },
    cancelled: { text: '已取消', color: 'red' },
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: string) => id.substring(0, 8),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 180,
    },
    {
      title: '藏品价值',
      dataIndex: 'product_value',
      key: 'product_value',
      width: 100,
      render: (v: number) => `${Number(v).toFixed(2)} USDT`,
    },
    {
      title: '每人费用',
      dataIndex: 'per_person_cost',
      key: 'per_person_cost',
      width: 100,
      render: (v: number) => `${Number(v).toFixed(2)} USDT`,
    },
    {
      title: '参与进度',
      key: 'progress',
      width: 120,
      render: (_: any, record: Auction) => (
        <div>
          <div>{record.current_participants} / {record.participant_count}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {((record.current_participants / record.participant_count) * 100).toFixed(1)}%
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const s = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '截止时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '开奖时间',
      dataIndex: 'drawn_at',
      key: 'drawn_at',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '获奖者',
      dataIndex: 'winner_unique_id',
      key: 'winner_unique_id',
      width: 100,
      render: (uid: string) => uid || '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 180,
      render: (_: any, record: Auction) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          {record.status === 'active' && (
            <Popconfirm
              title="取消后将自动退款所有参与者，确定？"
              onConfirm={() => handleCancel(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" size="small" danger icon={<StopOutlined />}>
                取消竞拍
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const participantColumns = [
    {
      title: '唯一ID',
      dataIndex: 'unique_id',
      key: 'unique_id',
    },
    {
      title: '用户名',
      key: 'user',
      render: (_: any, record: AuctionParticipant) => record.username || record.first_name || '-',
    },
    {
      title: '购买份数',
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: '支付金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (v: number) => `${Number(v).toFixed(2)} USDT`,
    },
    {
      title: '状态',
      key: 'pstate',
      render: (_: any, record: AuctionParticipant) => {
        if (record.refunded) return <Tag color="orange">已退款</Tag>;
        if (record.is_winner) return <Tag color="gold">已中奖</Tag>;
        return <Tag color="blue">参与中</Tag>;
      },
    },
    {
      title: '参与时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>竞拍管理（幸运夺宝）</h2>
          <p style={{ color: '#666', marginTop: 4 }}>创建和管理幸运夺宝竞拍活动</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>
          创建竞拍
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={auctions}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1400 }}
      />

      {/* Create modal */}
      <Modal
        title="创建竞拍"
        open={modalOpen}
        onOk={handleCreateSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="竞拍标题" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item name="product_id" label="关联定期产品（可选）">
            <Select
              placeholder="选择关联产品"
              allowClear
              onChange={handleProductChange}
              options={nftProducts.map(p => ({ label: `${p.title} (${p.price} USDT)`, value: p.id }))}
            />
          </Form.Item>

          <Form.Item name="product_value" label="藏品价值 (USDT)" rules={[{ required: true, message: '请输入价值' }]}>
            <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="participant_count" label="参与人数" rules={[{ required: true, message: '请输入参与人数' }]}>
            <InputNumber min={2} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="max_purchases_per_user" label="每用户最多购买份数" initialValue={1}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="platform_fee_percent" label="平台慈善抽成 (%)" initialValue={30}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="image_url" label="图片 URL（可选）">
            <Input placeholder="https://..." />
          </Form.Item>

          <Form.Item name="expires_at" label="截止时间" rules={[{ required: true, message: '请选择截止时间' }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="notify_channels" label="在频道/群组公布结果" initialValue={true}>
            <Select options={[{ label: '是', value: true }, { label: '否', value: false }]} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail modal */}
      <Modal
        title={`竞拍详情 - ${selectedAuction?.title}`}
        open={detailModalOpen}
        onCancel={() => { setDetailModalOpen(false); setSelectedAuction(null); setParticipants([]); }}
        footer={[<Button key="close" onClick={() => setDetailModalOpen(false)}>关闭</Button>]}
        width={800}
      >
        {selectedAuction && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div><strong>藏品价值：</strong>{Number(selectedAuction.product_value).toFixed(2)} USDT</div>
              <div><strong>每人费用：</strong>{Number(selectedAuction.per_person_cost).toFixed(2)} USDT</div>
              <div><strong>参与进度：</strong>{selectedAuction.current_participants}/{selectedAuction.participant_count}</div>
              <div><strong>赢家可兑换：</strong>{Number(selectedAuction.winner_payout).toFixed(2)} USDT</div>
              {selectedAuction.winner_unique_id && <div><strong>获奖者 ID：</strong>{selectedAuction.winner_unique_id}</div>}
            </div>
          </div>
        )}
        <Table
          columns={participantColumns}
          dataSource={participants}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};
