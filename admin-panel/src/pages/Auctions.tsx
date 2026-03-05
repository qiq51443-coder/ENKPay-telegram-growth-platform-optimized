import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message, Tag, Space, DatePicker, Radio } from 'antd';
import { PlusOutlined, TrophyOutlined, EyeOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

interface Auction {
  id: string;
  title: string;
  description?: string;
  image_url?: string;
  product_value: number;
  participant_count: number;
  current_participants: number;
  per_person_cost: number;
  max_purchases_per_user: number;
  status: string;
  expires_at: string;
  winner_unique_id?: string;
  created_at: string;
}

interface Participant {
  id: string;
  unique_id: string;
  quantity: number;
  created_at: string;
}

export const Auctions: React.FC = () => {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [participantsModalOpen, setParticipantsModalOpen] = useState(false);
  const [drawModalOpen, setDrawModalOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [drawMethod, setDrawMethod] = useState<'random' | 'manual'>('random');
  const [manualWinnerId, setManualWinnerId] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAuctions();
  }, []);

  const fetchAuctions = async () => {
    setLoading(true);
    try {
      const [active, completed] = await Promise.all([
        apiClient.get('/auctions?status=active&limit=50'),
        apiClient.get('/auctions?status=completed&limit=50'),
      ]);
      setAuctions([...(active.data?.data || []), ...(completed.data?.data || [])]);
    } catch (error) {
      console.error('Failed to fetch auctions:', error);
      message.error('获取夺宝列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (values.expires_at) {
        values.expires_at = values.expires_at.toISOString();
      }
      // Calculate per_person_cost from product_value and participant_count
      if (values.product_value && values.participant_count) {
        values.per_person_cost = parseFloat((values.product_value / values.participant_count).toFixed(2));
      }
      // Set platform fee and winner payout
      values.platform_fee_percent = 30;
      values.winner_payout = parseFloat((values.product_value * 0.7).toFixed(2));

      await apiClient.post('/auctions', values);
      message.success('夺宝创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchAuctions();
    } catch (error: any) {
      console.error('Failed to create auction:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleOpenDraw = (auction: Auction) => {
    setSelectedAuction(auction);
    setDrawMethod('random');
    setManualWinnerId('');
    setDrawModalOpen(true);
  };

  const handleDraw = async () => {
    if (!selectedAuction) return;
    setDrawing(true);
    try {
      const body: any = { method: drawMethod };
      if (drawMethod === 'manual') body.winner_unique_id = manualWinnerId;
      await apiClient.post(`/auctions/${selectedAuction.id}/draw`, body);
      message.success('开奖成功');
      setDrawModalOpen(false);
      fetchAuctions();
    } catch (error: any) {
      console.error('Failed to draw:', error);
      message.error(error.response?.data?.error || '开奖失败');
    } finally {
      setDrawing(false);
    }
  };

  const handleViewParticipants = async (auction: Auction) => {
    setSelectedAuction(auction);
    try {
      const response = await apiClient.get(`/auctions/${auction.id}/participants?limit=100`);
      setParticipants(response.data?.data || []);
      setParticipantsModalOpen(true);
    } catch (error: any) {
      message.error('获取参与者失败');
    }
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
      title: '藏品名称',
      dataIndex: 'title',
      key: 'title',
      width: 200,
    },
    {
      title: '总价值',
      dataIndex: 'product_value',
      key: 'product_value',
      width: 100,
      render: (v: number) => `$${parseFloat(String(v)).toFixed(2)}`,
    },
    {
      title: '每份价格',
      dataIndex: 'per_person_cost',
      key: 'per_person_cost',
      width: 100,
      render: (v: number) => `$${parseFloat(String(v)).toFixed(2)}`,
    },
    {
      title: '参与进度',
      key: 'progress',
      width: 120,
      render: (_: any, record: Auction) => (
        <div>
          <div>{record.current_participants} / {record.participant_count}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {record.participant_count > 0 ? ((record.current_participants / record.participant_count) * 100).toFixed(1) : 0}%
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
        const map: Record<string, { text: string; color: string }> = {
          active: { text: '进行中', color: 'green' },
          completed: { text: '已完成', color: 'purple' },
          expired: { text: '已过期', color: 'orange' },
          cancelled: { text: '已取消', color: 'red' },
        };
        const info = map[status] || { text: status, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '开奖时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 220,
      render: (_: any, record: Auction) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewParticipants(record)}
          >
            查看参与者
          </Button>
          {record.status === 'active' && (
            <Button
              type="primary"
              size="small"
              icon={<TrophyOutlined />}
              onClick={() => handleOpenDraw(record)}
            >
              开奖
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const participantColumns = [
    { title: '用户ID', dataIndex: 'unique_id', key: 'unique_id' },
    { title: '购买份数', dataIndex: 'quantity', key: 'quantity' },
    { title: '参与时间', dataIndex: 'created_at', key: 'created_at', render: (d: string) => new Date(d).toLocaleString('zh-CN') },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>夺宝管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>创建和管理夺宝活动（平台抽成30%，中奖者获得70%）</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenModal}>
          创建夺宝
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={auctions}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />

      {/* Create Auction Modal */}
      <Modal
        title="创建夺宝"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="藏品名称" rules={[{ required: true, message: '请输入藏品名称' }]}>
            <Input placeholder="例如：限量藏品 No.001" />
          </Form.Item>
          <Form.Item name="image_url" label="藏品图片URL">
            <Input placeholder="https://example.com/image.jpg" />
          </Form.Item>
          <Form.Item name="product_value" label="藏品总价值 (USDT)" rules={[{ required: true, message: '请输入总价值' }]}>
            <InputNumber min={1} step={1} style={{ width: '100%' }} placeholder="1000" />
          </Form.Item>
          <Form.Item name="participant_count" label="总份数" rules={[{ required: true, message: '请输入总份数' }]} extra="系统将自动计算每份价格 = 总价值 / 总份数">
            <InputNumber min={1} style={{ width: '100%' }} placeholder="100" />
          </Form.Item>
          <Form.Item name="max_purchases_per_user" label="每人限购份数" initialValue={5}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expires_at" label="开奖时间" rules={[{ required: true, message: '请选择开奖时间' }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <Input.TextArea rows={3} placeholder="藏品说明..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Draw Modal */}
      <Modal
        title={`开奖 - ${selectedAuction?.title}`}
        open={drawModalOpen}
        onOk={handleDraw}
        onCancel={() => setDrawModalOpen(false)}
        okText={drawing ? '开奖中...' : '确认开奖'}
        cancelText="取消"
        confirmLoading={drawing}
      >
        <Form layout="vertical">
          <Form.Item label="开奖方式">
            <Radio.Group value={drawMethod} onChange={e => setDrawMethod(e.target.value)}>
              <Radio value="random">系统随机抽取</Radio>
              <Radio value="manual">指定获奖成员</Radio>
            </Radio.Group>
          </Form.Item>
          {drawMethod === 'manual' && (
            <Form.Item label="获奖者唯一ID">
              <Input
                value={manualWinnerId}
                onChange={e => setManualWinnerId(e.target.value)}
                placeholder="请输入用户唯一ID"
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Participants Modal */}
      <Modal
        title={`参与者列表 - ${selectedAuction?.title} (${participants.length} 人)`}
        open={participantsModalOpen}
        onCancel={() => { setParticipantsModalOpen(false); setParticipants([]); }}
        footer={[<Button key="close" onClick={() => setParticipantsModalOpen(false)}>关闭</Button>]}
        width={700}
      >
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
