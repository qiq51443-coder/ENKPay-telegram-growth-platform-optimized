import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Table } from '../components/Common/Table';
import { Modal } from '../components/Common/Modal';
import { Button } from '../components/Forms/Button';
import { Input } from '../components/Forms/Input';
import apiClient from '../services/api';
import { Exchange } from '../services/types';

export const Exchanges: React.FC = () => {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExchange, setEditingExchange] = useState<Exchange | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    name_zh: '',
    logo_url: '',
    register_url: '',
    tutorial_content_en: '',
    tutorial_content_zh: '',
    order_index: 0,
  });

  useEffect(() => {
    fetchExchanges();
  }, []);

  const fetchExchanges = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getExchanges();
      setExchanges(response.exchanges || []);
    } catch (error) {
      console.error('Failed to fetch exchanges:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (exchange?: Exchange) => {
    if (exchange) {
      setEditingExchange(exchange);
      setFormData({
        name: exchange.name,
        name_zh: exchange.name_zh || '',
        logo_url: exchange.logo_url || '',
        register_url: exchange.register_url,
        tutorial_content_en: exchange.tutorial_content?.en || '',
        tutorial_content_zh: exchange.tutorial_content?.zh || '',
        order_index: exchange.order_index,
      });
    } else {
      setEditingExchange(null);
      setFormData({
        name: '',
        name_zh: '',
        logo_url: '',
        register_url: '',
        tutorial_content_en: '',
        tutorial_content_zh: '',
        order_index: 0,
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        name: formData.name,
        name_zh: formData.name_zh,
        logo_url: formData.logo_url,
        register_url: formData.register_url,
        tutorial_content: {
          en: formData.tutorial_content_en,
          zh: formData.tutorial_content_zh,
        },
        order_index: formData.order_index,
      };

      if (editingExchange) {
        await apiClient.updateExchange(editingExchange.id, data);
      } else {
        await apiClient.createExchange(data);
      }
      setModalOpen(false);
      fetchExchanges();
    } catch (error) {
      console.error('Failed to save exchange:', error);
      alert('保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个交易所吗？')) return;
    try {
      await apiClient.deleteExchange(id);
      fetchExchanges();
    } catch (error) {
      console.error('Failed to delete exchange:', error);
      alert('删除失败');
    }
  };

  const columns = [
    {
      key: 'name',
      title: '名称',
      render: (ex: Exchange) => (
        <div>
          <p className="font-medium">{ex.name}</p>
          <p className="text-xs text-gray-500">{ex.name_zh}</p>
        </div>
      ),
    },
    {
      key: 'register_url',
      title: '注册链接',
      render: (ex: Exchange) => (
        <a
          href={ex.register_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-xs truncate max-w-xs block"
        >
          {ex.register_url}
        </a>
      ),
    },
    {
      key: 'order_index',
      title: '排序',
      render: (ex: Exchange) => ex.order_index,
    },
    {
      key: 'is_active',
      title: '状态',
      render: (ex: Exchange) => (
        <span
          className={`px-2 py-1 rounded-full text-xs ${
            ex.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {ex.is_active ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (ex: Exchange) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="text-xs py-1 px-2"
            onClick={() => handleOpenModal(ex)}
          >
            <Edit className="w-3 h-3" />
          </Button>
          <Button
            variant="danger"
            className="text-xs py-1 px-2"
            onClick={() => handleDelete(ex.id)}
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
            <h1 className="text-2xl font-bold text-gray-900">交易所管理</h1>
            <p className="text-gray-600 mt-1">管理支持的交易所平台</p>
          </div>
          <Button variant="primary" onClick={() => handleOpenModal()}>
            <Plus className="w-4 h-4 mr-2" />
            添加交易所
          </Button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <Table columns={columns} data={exchanges} loading={loading} />
        </div>

        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingExchange ? '编辑交易所' : '添加交易所'}
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
              label="英文名称"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="中文名称"
              value={formData.name_zh}
              onChange={(e) => setFormData({ ...formData, name_zh: e.target.value })}
            />
            <Input
              label="Logo URL"
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
              placeholder="https://..."
            />
            <Input
              label="注册链接"
              value={formData.register_url}
              onChange={(e) =>
                setFormData({ ...formData, register_url: e.target.value })
              }
              required
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                教程内容 (英文)
              </label>
              <textarea
                value={formData.tutorial_content_en}
                onChange={(e) =>
                  setFormData({ ...formData, tutorial_content_en: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                教程内容 (中文)
              </label>
              <textarea
                value={formData.tutorial_content_zh}
                onChange={(e) =>
                  setFormData({ ...formData, tutorial_content_zh: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={4}
              />
            </div>
            <Input
              label="排序序号"
              type="number"
              value={formData.order_index}
              onChange={(e) =>
                setFormData({ ...formData, order_index: parseInt(e.target.value) })
              }
            />
          </div>
        </Modal>
      </div>
    </Layout>
  );
};
