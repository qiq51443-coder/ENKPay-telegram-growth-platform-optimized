import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Modal, Input, Button, Select, InputNumber } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import axios from 'axios';

interface RedPacket {
  id: string;
  bot_id: string;
  chat_id: string;
  title: string;
  total_amount: number;
  total_count: number;
  claimed_amount: number;
  claimed_count: number;
  status: 'active' | 'expired' | 'completed';
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
  const [formData, setFormData] = useState({
    bot_id: '',
    chat_id: '',
    title: '',
    total_amount: 0,
    total_count: 0,
    expires_in_hours: 24,
  });

  useEffect(() => {
    fetchRedPackets();
    fetchBots();
  }, []);

  const fetchRedPackets = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/redpackets');
      setRedPackets(response.data.redPackets || []);
    } catch (error) {
      console.error('Failed to fetch red packets:', error);
      message.error('获取红包列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchBots = async () => {
    try {
      const response = await axios.get('/api/admin/bots');
      setBots(response.data.bots || []);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const handleCreate = async () => {
    try {
      await axios.post('/api/admin/redpackets', {
        ...formData,
        chat_id: parseInt(formData.chat_id),
        total_amount: parseFloat(formData.total_amount as any),
        total_count: parseInt(formData.total_count as any),
      });
      message.success('红包创建成功');
      setModalOpen(false);
      setFormData({
        bot_id: '',
        chat_id: '',
        title: '',
        total_amount: 0,
        total_count: 0,
        expires_in_hours: 24,
      });
      fetchRedPackets();
    } catch (error: any) {
      console.error('Failed to create red packet:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
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
      render: (amount: number) => `$${amount?.toFixed(2)}`,
    },
    {
      title: '进度',
      key: 'progress',
      render: (_: any, record: RedPacket) => (
        <div>
          <div style={{ fontSize: '14px' }}>
            {record.claimed_count} / {record.total_count} 个
          </div>
          <div style={{ fontSize: '12px', color: '#999' }}>
            ${record.claimed_amount.toFixed(2)} / ${record.total_amount.toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: { [key: string]: { text: string; color: string } } = {
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
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
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
          onClick={() => {
            // Navigate to claims page or show details
            message.info('红包详情功能待实现');
          }}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>红包管理</h2>
          <p style={{ color: '#666' }}>创建和管理红包</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          创建红包
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={redPackets}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
      />

      {/* Create Modal */}
      <Modal
        title="创建红包"
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setFormData({
            bot_id: '',
            chat_id: '',
            title: '',
            total_amount: 0,
            total_count: 0,
            expires_in_hours: 24,
          });
        }}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>Bot</label>
            <Select
              value={formData.bot_id}
              onChange={(value) => setFormData({ ...formData, bot_id: value })}
              style={{ width: '100%' }}
              placeholder="选择 Bot"
              options={bots.map(bot => ({ value: bot.id, label: bot.name }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>群组 ID</label>
            <Input
              value={formData.chat_id}
              onChange={(e) => setFormData({ ...formData, chat_id: e.target.value })}
              placeholder="输入群组 ID"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>标题</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="红包标题"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>总金额 (USD)</label>
            <InputNumber
              value={formData.total_amount}
              onChange={(value) => setFormData({ ...formData, total_amount: value || 0 })}
              style={{ width: '100%' }}
              min={0}
              step={0.01}
              placeholder="0.00"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>红包数量</label>
            <InputNumber
              value={formData.total_count}
              onChange={(value) => setFormData({ ...formData, total_count: value || 0 })}
              style={{ width: '100%' }}
              min={1}
              placeholder="1"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>过期时间 (小时)</label>
            <InputNumber
              value={formData.expires_in_hours}
              onChange={(value) => setFormData({ ...formData, expires_in_hours: value || 24 })}
              style={{ width: '100%' }}
              min={1}
              placeholder="24"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
