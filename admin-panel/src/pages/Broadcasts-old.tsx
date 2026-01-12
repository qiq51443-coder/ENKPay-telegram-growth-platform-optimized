import React, { useState, useEffect } from 'react';
import { Plus, Send } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Table } from '../components/Common/Table';
import { Modal } from '../components/Common/Modal';
import { Button } from '../components/Forms/Button';
import { Input } from '../components/Forms/Input';
import { Select } from '../components/Forms/Select';
import apiClient from '../services/api';
import { Broadcast, Bot } from '../services/types';

export const Broadcasts: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    bot_id: '',
    title: '',
    content: '',
    target_type: 'all',
  });

  useEffect(() => {
    fetchBroadcasts();
    fetchBots();
  }, []);

  const fetchBroadcasts = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getBroadcasts();
      setBroadcasts(response.broadcasts || []);
    } catch (error) {
      console.error('Failed to fetch broadcasts:', error);
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
      await apiClient.createBroadcast(formData);
      setModalOpen(false);
      setFormData({
        bot_id: '',
        title: '',
        content: '',
        target_type: 'all',
      });
      fetchBroadcasts();
    } catch (error) {
      console.error('Failed to create broadcast:', error);
      alert('创建失败');
    }
  };

  const handleSend = async (id: string) => {
    if (!confirm('确定要立即发送这条广播吗？')) return;
    try {
      await apiClient.sendBroadcast(id);
      alert('广播发送成功');
      fetchBroadcasts();
    } catch (error) {
      console.error('Failed to send broadcast:', error);
      alert('发送失败');
    }
  };

  const columns = [
    {
      key: 'title',
      title: '标题',
      render: (bc: Broadcast) => bc.title,
    },
    {
      key: 'content',
      title: '内容',
      render: (bc: Broadcast) => (
        <div className="max-w-xs truncate">{bc.content}</div>
      ),
    },
    {
      key: 'target_type',
      title: '目标用户',
      render: (bc: Broadcast) => {
        const targetMap: Record<string, string> = {
          all: '全部用户',
          active: '活跃用户',
          bound: '已绑定',
          unbound: '未绑定',
        };
        return targetMap[bc.target_type] || bc.target_type;
      },
    },
    {
      key: 'status',
      title: '状态',
      render: (bc: Broadcast) => {
        const statusMap = {
          draft: { text: '草稿', color: 'bg-gray-100 text-gray-800' },
          scheduled: { text: '已安排', color: 'bg-blue-100 text-blue-800' },
          sending: { text: '发送中', color: 'bg-yellow-100 text-yellow-800' },
          completed: { text: '已完成', color: 'bg-green-100 text-green-800' },
          failed: { text: '失败', color: 'bg-red-100 text-red-800' },
        };
        const status = statusMap[bc.status];
        return (
          <span className={`px-2 py-1 rounded-full text-xs ${status.color}`}>
            {status.text}
          </span>
        );
      },
    },
    {
      key: 'stats',
      title: '统计',
      render: (bc: Broadcast) =>
        bc.sent_count ? (
          <div className="text-sm">
            <p className="text-green-600">成功: {bc.sent_count}</p>
            {bc.failed_count ? (
              <p className="text-red-600">失败: {bc.failed_count}</p>
            ) : null}
          </div>
        ) : (
          '-'
        ),
    },
    {
      key: 'created_at',
      title: '创建时间',
      render: (bc: Broadcast) => new Date(bc.created_at).toLocaleString('zh-CN'),
    },
    {
      key: 'actions',
      title: '操作',
      render: (bc: Broadcast) =>
        bc.status === 'draft' ? (
          <Button
            variant="primary"
            className="text-xs py-1 px-2"
            onClick={() => handleSend(bc.id)}
          >
            <Send className="w-3 h-3 mr-1" />
            发送
          </Button>
        ) : null,
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">广播通知</h1>
            <p className="text-gray-600 mt-1">创建和发送广播消息</p>
          </div>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            创建广播
          </Button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <Table columns={columns} data={broadcasts} loading={loading} />
        </div>

        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="创建广播"
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
              label="标题"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="广播标题"
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                内容
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={5}
                placeholder="输入广播内容..."
                required
              />
            </div>
            <Select
              label="目标用户"
              value={formData.target_type}
              onChange={(e) =>
                setFormData({ ...formData, target_type: e.target.value })
              }
              options={[
                { value: 'all', label: '全部用户' },
                { value: 'active', label: '活跃用户' },
                { value: 'bound', label: '已绑定用户' },
                { value: 'unbound', label: '未绑定用户' },
              ]}
            />
          </div>
        </Modal>
      </div>
    </Layout>
  );
};
