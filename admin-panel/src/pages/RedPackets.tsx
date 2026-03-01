import React, { useEffect, useState } from 'react';
import { Table, message, Button, Modal, Form, Input, Select, InputNumber, Tag } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

interface RedPacket {
  id: string;
  bot_id: string;
  chat_id: string;
  title: string;
  total_amount: number;
  total_count: number;
  claimed_amount: number;
  claimed_count: number;
  status: string;
  expires_at: string;
  created_at: string;
}

interface Bot {
  id: string;
  name: string;
}

export const RedPackets: React.FC = () => {
  const [redPackets, setRedPackets] = useState<RedPacket[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [claimsModalOpen, setClaimsModalOpen] = useState(false);
  const [selectedRedPacket, setSelectedRedPacket] = useState<RedPacket | null>(null);
  const [claims, setClaims] = useState([]);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchRedPackets();
    fetchBots();
  }, []);

  const fetchRedPackets = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getRedPackets();
      setRedPackets(response.redPackets || []);
    } catch (error) {
      console.error('Failed to fetch red packets:', error);
      message.error('获取红包列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchBots = async () => {
    try {
      const response = await apiClient.getBots();
      setBots(response.bots || []);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const fetchClaims = async (redPacketId: string) => {
    try {
      const response = await apiClient.getRedPacketClaims(redPacketId);
      setClaims(response.claims || []);
    } catch (error) {
      console.error('Failed to fetch claims:', error);
      message.error('获取领取记录失败');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await apiClient.createRedPacket(values);
      message.success('红包创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchRedPackets();
    } catch (error: any) {
      console.error('Failed to create red packet:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleViewClaims = async (redPacket: RedPacket) => {
    setSelectedRedPacket(redPacket);
    await fetchClaims(redPacket.id);
    setClaimsModalOpen(true);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id: string) => id.substring(0, 8),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '总金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 100,
      render: (amount: number) => (
        <span style={{ fontFamily: 'monospace' }}>${amount.toFixed(2)}</span>
      ),
    },
    {
      title: '进度',
      key: 'progress',
      width: 150,
      render: (_: any, record: RedPacket) => (
        <div>
          <div style={{ fontSize: '12px' }}>
            {record.claimed_count} / {record.total_count} 个
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            ${record.claimed_amount.toFixed(2)} / ${record.total_amount.toFixed(2)}
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
          active: { text: '活跃', color: 'success' },
          expired: { text: '已过期', color: 'default' },
          completed: { text: '已领完', color: 'processing' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '过期时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 100,
      render: (_: any, record: RedPacket) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewClaims(record)}
        >
          领取记录
        </Button>
      ),
    },
  ];

  const claimsColumns = [
    {
      title: '用户',
      key: 'user',
      render: (record: any) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.user?.username || record.user?.first_name}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>ID: {record.user?.telegram_id}</div>
        </div>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>${amount.toFixed(2)}</span>
      ),
    },
    {
      title: '领取时间',
      dataIndex: 'claimed_at',
      key: 'claimed_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>红包管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>创建和管理红包</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          创建红包
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={redPackets}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title="创建红包"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="bot_id"
            label="选择 Bot"
            rules={[{ required: true, message: '请选择 Bot' }]}
          >
            <Select placeholder="请选择...">
              {bots.map((bot) => (
                <Select.Option key={bot.id} value={bot.id}>
                  {bot.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="chat_id"
            label="群组 Chat ID"
            rules={[{ required: true, message: '请输入 Chat ID' }]}
          >
            <Input placeholder="-1001234567890" />
          </Form.Item>

          <Form.Item
            name="title"
            label="红包标题"
            rules={[{ required: true, message: '请输入红包标题' }]}
          >
            <Input placeholder="例如: 新年红包" />
          </Form.Item>

          <Form.Item
            name="total_amount"
            label="总金额 ($)"
            rules={[{ required: true, message: '请输入总金额' }]}
          >
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} placeholder="10.00" />
          </Form.Item>

          <Form.Item
            name="total_count"
            label="红包数量"
            rules={[{ required: true, message: '请输入红包数量' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} placeholder="10" />
          </Form.Item>

          <Form.Item
            name="expires_in_hours"
            label="有效期 (小时)"
            rules={[{ required: true, message: '请输入有效期' }]}
            initialValue={24}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="language"
            label="语言 / Language"
            initialValue="en"
          >
            <Select>
              <Select.Option value="en">🇬🇧 English</Select.Option>
              <Select.Option value="zh">🇨🇳 中文</Select.Option>
              <Select.Option value="fr">🇫🇷 Français</Select.Option>
              <Select.Option value="de">🇩🇪 Deutsch</Select.Option>
              <Select.Option value="es">🇪🇸 Español</Select.Option>
              <Select.Option value="ar">🇸🇦 العربية</Select.Option>
              <Select.Option value="ja">🇯🇵 日本語</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`红包领取记录 - ${selectedRedPacket?.title}`}
        open={claimsModalOpen}
        onCancel={() => {
          setClaimsModalOpen(false);
          setSelectedRedPacket(null);
          setClaims([]);
        }}
        footer={[
          <Button key="close" onClick={() => setClaimsModalOpen(false)}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        <Table
          columns={claimsColumns}
          dataSource={claims}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};
