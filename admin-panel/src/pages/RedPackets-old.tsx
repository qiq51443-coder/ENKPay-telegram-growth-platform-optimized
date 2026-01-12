import React, { useState, useEffect } from 'react';
import { Plus, Eye } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Table } from '../components/Common/Table';
import { Modal } from '../components/Common/Modal';
import { Button } from '../components/Forms/Button';
import { Input } from '../components/Forms/Input';
import { Select } from '../components/Forms/Select';
import apiClient from '../services/api';
import { RedPacket, Bot } from '../services/types';

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
      const response = await apiClient.getRedPackets();
      setRedPackets(response.redPackets || []);
    } catch (error) {
      console.error('Failed to fetch red packets:', error);
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

  const handleCreate = async () => {
    try {
      await apiClient.createRedPacket({
        ...formData,
        chat_id: parseInt(formData.chat_id),
        total_amount: parseFloat(formData.total_amount as any),
        total_count: parseInt(formData.total_count as any),
      });
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
    } catch (error) {
      console.error('Failed to create red packet:', error);
      alert('创建失败');
    }
  };

  const columns = [
    {
      key: 'title',
      title: '标题',
      render: (rp: RedPacket) => rp.title,
    },
    {
      key: 'total_amount',
      title: '总金额',
      render: (rp: RedPacket) => `$${rp.total_amount.toFixed(2)}`,
    },
    {
      key: 'progress',
      title: '进度',
      render: (rp: RedPacket) => (
        <div>
          <p className="text-sm">
            {rp.claimed_count} / {rp.total_count} 个
          </p>
          <p className="text-xs text-gray-500">
            ${rp.claimed_amount.toFixed(2)} / ${rp.total_amount.toFixed(2)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (rp: RedPacket) => {
        const statusMap = {
          active: { text: '活跃', color: 'bg-green-100 text-green-800' },
          expired: { text: '已过期', color: 'bg-gray-100 text-gray-800' },
          completed: { text: '已领完', color: 'bg-blue-100 text-blue-800' },
        };
        const status = statusMap[rp.status];
        return (
          <span className={`px-2 py-1 rounded-full text-xs ${status.color}`}>
            {status.text}
          </span>
        );
      },
    },
    {
      key: 'expires_at',
      title: '过期时间',
      render: (rp: RedPacket) => new Date(rp.expires_at).toLocaleString('zh-CN'),
    },
    {
      key: 'actions',
      title: '操作',
      render: (rp: RedPacket) => (
        <Button
          variant="secondary"
          className="text-xs py-1 px-2"
          onClick={() => {
            // Navigate to claims page
            window.location.href = `/red-packets/${rp.id}`;
          }}
        >
          <Eye className="w-3 h-3 mr-1" />
          查看
        </Button>
      ),
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">红包管理</h1>
            <p className="text-gray-600 mt-1">创建和管理红包</p>
          </div>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            创建红包
          </Button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <Table columns={columns} data={redPackets} loading={loading} />
        </div>

        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="创建红包"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={handleCreate}>
                创建
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Select
              label="选择 Bot"
              value={formData.bot_id}
              onChange={(e) => setFormData({ ...formData, bot_id: e.target.value })}
              options={[
                { value: '', label: '请选择...' },
                ...bots.map((bot) => ({ value: bot.id, label: bot.name })),
              ]}
              required
            />
            <Input
              label="群组 Chat ID"
              type="text"
              value={formData.chat_id}
              onChange={(e) => setFormData({ ...formData, chat_id: e.target.value })}
              placeholder="-1001234567890"
              required
            />
            <Input
              label="红包标题"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="例如: 新年红包"
              required
            />
            <Input
              label="总金额 ($)"
              type="number"
              step="0.01"
              value={formData.total_amount}
              onChange={(e) =>
                setFormData({ ...formData, total_amount: parseFloat(e.target.value) })
              }
              required
            />
            <Input
              label="红包数量"
              type="number"
              value={formData.total_count}
              onChange={(e) =>
                setFormData({ ...formData, total_count: parseInt(e.target.value) })
              }
              required
            />
            <Input
              label="有效期 (小时)"
              type="number"
              value={formData.expires_in_hours}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  expires_in_hours: parseInt(e.target.value),
                })
              }
              required
            />
          </div>
        </Modal>
      </div>
    </Layout>
  );
};
