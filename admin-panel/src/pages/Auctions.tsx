import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message, Popconfirm, Tag, Space, Select, DatePicker } from 'antd';
import { PlusOutlined, TrophyOutlined, EyeOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

interface Auction {
  id: string;
  title: string;
  description?: string;
  prize_type: string;
  prize_info: any;
  share_price: number;
  total_shares: number;
  sold_shares: number;
  status: string;
  start_time: string;
  end_time: string;
  draw_time?: string;
  winner_user_id?: string;
  created_at: string;
}

interface AuctionEntry {
  id: string;
  user_id: string;
  shares_purchased: number;
  total_amount: number;
  created_at: string;
  user?: {
    telegram_id: number;
    username?: string;
    first_name?: string;
  };
}

export const Auctions: React.FC = () => {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [entriesModalOpen, setEntriesModalOpen] = useState(false);
  const [entries, setEntries] = useState<AuctionEntry[]>([]);
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAuctions();
  }, []);

  const fetchAuctions = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getAuctions();
      setAuctions(response.auctions || []);
    } catch (error) {
      console.error('Failed to fetch auctions:', error);
      message.error('获取竞拍列表失败');
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
      
      // Convert dates to ISO strings
      if (values.start_time) {
        values.start_time = values.start_time.toISOString();
      }
      if (values.end_time) {
        values.end_time = values.end_time.toISOString();
      }
      
      // Parse prize_info as JSON
      if (values.prize_info && typeof values.prize_info === 'string') {
        try {
          values.prize_info = JSON.parse(values.prize_info);
        } catch (e) {
          message.error('奖品信息格式错误，请输入有效的 JSON');
          return;
        }
      }
      
      await apiClient.createAuction(values);
      message.success('竞拍创建成功');
      
      setModalOpen(false);
      form.resetFields();
      fetchAuctions();
    } catch (error: any) {
      console.error('Failed to create auction:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleDraw = async (id: string) => {
    try {
      await apiClient.drawAuction(id);
      message.success('开奖成功');
      fetchAuctions();
    } catch (error: any) {
      console.error('Failed to draw auction:', error);
      message.error(error.response?.data?.error || '开奖失败');
    }
  };

  const handleViewEntries = async (auction: Auction) => {
    setSelectedAuction(auction);
    try {
      const response = await apiClient.getAuctionEntries(auction.id);
      setEntries(response.entries || []);
      setEntriesModalOpen(true);
    } catch (error: any) {
      console.error('Failed to fetch entries:', error);
      message.error(error.response?.data?.error || '获取参与记录失败');
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
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
    },
    {
      title: '奖品类型',
      dataIndex: 'prize_type',
      key: 'prize_type',
      width: 100,
      render: (type: string) => {
        const typeMap: Record<string, { text: string; color: string }> = {
          nft: { text: 'NFT', color: 'purple' },
          usdt: { text: 'USDT', color: 'green' },
          physical: { text: '实物', color: 'orange' },
          custom: { text: '自定义', color: 'blue' },
        };
        const typeInfo = typeMap[type] || { text: type, color: 'default' };
        return <Tag color={typeInfo.color}>{typeInfo.text}</Tag>;
      },
    },
    {
      title: '份额价格',
      dataIndex: 'share_price',
      key: 'share_price',
      width: 100,
      render: (price: number) => `${price.toFixed(2)} USDT`,
    },
    {
      title: '份额进度',
      key: 'shares',
      width: 120,
      render: (_: any, record: Auction) => (
        <div>
          <div>{record.sold_shares} / {record.total_shares}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {((record.sold_shares / record.total_shares) * 100).toFixed(1)}%
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
        const statusMap: Record<string, { text: string; color: string }> = {
          upcoming: { text: '未开始', color: 'blue' },
          active: { text: '进行中', color: 'green' },
          ended: { text: '已结束', color: 'orange' },
          drawn: { text: '已开奖', color: 'purple' },
          cancelled: { text: '已取消', color: 'red' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '开奖时间',
      dataIndex: 'draw_time',
      key: 'draw_time',
      width: 160,
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_: any, record: Auction) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewEntries(record)}
          >
            参与记录
          </Button>
          {record.status === 'ended' && !record.draw_time && (
            <Popconfirm
              title="确定要开奖吗？"
              onConfirm={() => handleDraw(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="primary" size="small" icon={<TrophyOutlined />}>
                开奖
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const entriesColumns = [
    {
      title: '用户',
      key: 'user',
      render: (_: any, record: AuctionEntry) => (
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
      title: '购买份额',
      dataIndex: 'shares_purchased',
      key: 'shares_purchased',
    },
    {
      title: '支付金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      render: (amount: number) => `${amount.toFixed(2)} USDT`,
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
          <h2 style={{ margin: 0 }}>竞拍管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>创建和管理竞拍活动</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenModal}>
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

      <Modal
        title="创建竞拍"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            prize_type: 'usdt',
            status: 'upcoming',
          }}
        >
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="例如：限量 NFT 竞拍" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea rows={3} placeholder="竞拍活动描述" />
          </Form.Item>

          <Form.Item
            name="prize_type"
            label="奖品类型"
            rules={[{ required: true, message: '请选择奖品类型' }]}
          >
            <Select>
              <Select.Option value="nft">NFT</Select.Option>
              <Select.Option value="usdt">USDT</Select.Option>
              <Select.Option value="physical">实物</Select.Option>
              <Select.Option value="custom">自定义</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="prize_info"
            label="奖品信息 (JSON)"
            rules={[{ required: true, message: '请输入奖品信息' }]}
            tooltip='例如: {"amount": 100} 或 {"name": "限量版NFT", "id": "xxx"}'
          >
            <Input.TextArea rows={2} placeholder='{"key": "value"}' />
          </Form.Item>

          <Form.Item
            name="share_price"
            label="每份价格 (USDT)"
            rules={[{ required: true, message: '请输入每份价格' }]}
          >
            <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="total_shares"
            label="总份额数"
            rules={[{ required: true, message: '请输入总份额数' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="start_time"
            label="开始时间"
            rules={[{ required: true, message: '请选择开始时间' }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="end_time"
            label="结束时间"
            rules={[{ required: true, message: '请选择结束时间' }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`参与记录 - ${selectedAuction?.title}`}
        open={entriesModalOpen}
        onCancel={() => {
          setEntriesModalOpen(false);
          setSelectedAuction(null);
          setEntries([]);
        }}
        footer={[
          <Button key="close" onClick={() => setEntriesModalOpen(false)}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        <Table
          columns={entriesColumns}
          dataSource={entries}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};
