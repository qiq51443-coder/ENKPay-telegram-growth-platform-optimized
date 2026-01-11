import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Table } from '../components/Common/Table';
import { Modal } from '../components/Common/Modal';
import { Button } from '../components/Forms/Button';
import { Input } from '../components/Forms/Input';
import { Select } from '../components/Forms/Select';
import apiClient from '../services/api';
import { Bot } from '../services/types';

export const Bots: React.FC = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    token: '',
    language: 'en',
    webhook_url: '',
  });

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getBots();
      setBots(response.bots || []);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (bot?: Bot) => {
    if (bot) {
      setEditingBot(bot);
      setFormData({
        name: bot.name,
        token: bot.token,
        language: bot.language,
        webhook_url: bot.webhook_url || '',
      });
    } else {
      setEditingBot(null);
      setFormData({
        name: '',
        token: '',
        language: 'en',
        webhook_url: '',
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingBot) {
        await apiClient.updateBot(editingBot.id, formData);
      } else {
        await apiClient.createBot(formData);
      }
      setModalOpen(false);
      fetchBots();
    } catch (error) {
      console.error('Failed to save bot:', error);
      alert('保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个 Bot 吗？')) return;
    try {
      await apiClient.deleteBot(id);
      fetchBots();
    } catch (error) {
      console.error('Failed to delete bot:', error);
      alert('删除失败');
    }
  };

  const columns = [
    {
      key: 'name',
      title: '名称',
      render: (bot: Bot) => bot.name,
    },
    {
      key: 'username',
      title: '用户名',
      render: (bot: Bot) => bot.username ? `@${bot.username}` : '-',
    },
    {
      key: 'language',
      title: '语言',
      render: (bot: Bot) => bot.language.toUpperCase(),
    },
    {
      key: 'is_active',
      title: '状态',
      render: (bot: Bot) => (
        <span
          className={`px-2 py-1 rounded-full text-xs ${
            bot.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {bot.is_active ? '活跃' : '禁用'}
        </span>
      ),
    },
    {
      key: 'webhook_url',
      title: 'Webhook',
      render: (bot: Bot) => (
        <span className="text-xs font-mono">
          {bot.webhook_url ? '已配置' : '未配置'}
        </span>
      ),
    },
    {
      key: 'created_at',
      title: '创建时间',
      render: (bot: Bot) => new Date(bot.created_at).toLocaleDateString('zh-CN'),
    },
    {
      key: 'actions',
      title: '操作',
      render: (bot: Bot) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="text-xs py-1 px-2"
            onClick={() => handleOpenModal(bot)}
          >
            <Edit className="w-3 h-3" />
          </Button>
          <Button
            variant="danger"
            className="text-xs py-1 px-2"
            onClick={() => handleDelete(bot.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bot 管理</h1>
            <p className="text-gray-600 mt-1">管理 Telegram Bot 配置</p>
          </div>
          <Button variant="primary" onClick={() => handleOpenModal()}>
            <Plus className="w-4 h-4 mr-2" />
            添加 Bot
          </Button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <Table columns={columns} data={bots} loading={loading} />
        </div>

        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingBot ? '编辑 Bot' : '添加 Bot'}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={handleSave}>
                保存
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="Bot 名称"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如: MyBot"
              required
            />
            <Input
              label="Bot Token"
              value={formData.token}
              onChange={(e) => setFormData({ ...formData, token: e.target.value })}
              placeholder="123456:ABC-DEF..."
              required
              disabled={!!editingBot}
            />
            <Select
              label="语言"
              value={formData.language}
              onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              options={[
                { value: 'en', label: 'English' },
                { value: 'zh', label: '中文' },
                { value: 'ru', label: 'Русский' },
              ]}
            />
            <Input
              label="Webhook URL (可选)"
              value={formData.webhook_url}
              onChange={(e) =>
                setFormData({ ...formData, webhook_url: e.target.value })
              }
              placeholder="https://your-domain.com/webhook"
            />
          </div>
        </Modal>
      </div>
    </Layout>
  );
};
