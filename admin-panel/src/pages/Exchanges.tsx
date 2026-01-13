import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Modal, Input, Button, InputNumber, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;

interface Exchange {
  id: string;
  name: string;
  name_zh?: string;
  logo_url?: string;
  register_url: string;
  tutorial_content?: {
    en?: string;
    zh?: string;
  };
  order_index: number;
  is_active: boolean;
}

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
      const response = await axios.get('/api/admin/exchanges');
      setExchanges(response.data.exchanges || []);
    } catch (error) {
      console.error('Failed to fetch exchanges:', error);
      message.error('获取交易所列表失败');
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
    if (!formData.name || !formData.register_url) {
      message.error('请填写必填字段');
      return;
    }
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
        await axios.put(`/api/admin/exchanges/${editingExchange.id}`, data);
        message.success('更新成功');
      } else {
        await axios.post('/api/admin/exchanges', data);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchExchanges();
    } catch (error: any) {
      console.error('Failed to save exchange:', error);
      message.error(error.response?.data?.error || '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/admin/exchanges/${id}`);
      message.success('删除成功');
      fetchExchanges();
    } catch (error: any) {
      console.error('Failed to delete exchange:', error);
      message.error(error.response?.data?.error || '删除失败');
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
      title: '名称',
      key: 'name',
      render: (_: any, record: Exchange) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.name}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>{record.name_zh}</div>
        </div>
      ),
    },
    {
      title: '注册链接',
      dataIndex: 'register_url',
      key: 'register_url',
      render: (url: string) => (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '12px', maxWidth: 300, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {url}
        </a>
      ),
    },
    {
      title: '排序',
      dataIndex: 'order_index',
      key: 'order_index',
      width: 80,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (is_active: boolean) => (
        <Tag color={is_active ? 'success' : 'default'}>
          {is_active ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: Exchange) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个交易所吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>平台配置</h2>
          <p style={{ color: '#666' }}>管理交易所平台信息</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          添加交易所
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={exchanges}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
      />

      {/* Edit/Create Modal */}
      <Modal
        title={editingExchange ? '编辑交易所' : '添加交易所'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingExchange(null);
        }}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>名称 (英文) *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Binance"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>名称 (中文)</label>
            <Input
              value={formData.name_zh}
              onChange={(e) => setFormData({ ...formData, name_zh: e.target.value })}
              placeholder="币安"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>Logo URL</label>
            <Input
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>注册链接 *</label>
            <Input
              value={formData.register_url}
              onChange={(e) => setFormData({ ...formData, register_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>教程内容 (英文)</label>
            <TextArea
              value={formData.tutorial_content_en}
              onChange={(e) => setFormData({ ...formData, tutorial_content_en: e.target.value })}
              rows={3}
              placeholder="Tutorial content in English..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>教程内容 (中文)</label>
            <TextArea
              value={formData.tutorial_content_zh}
              onChange={(e) => setFormData({ ...formData, tutorial_content_zh: e.target.value })}
              rows={3}
              placeholder="中文教程内容..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>排序</label>
            <InputNumber
              value={formData.order_index}
              onChange={(value) => setFormData({ ...formData, order_index: value || 0 })}
              style={{ width: '100%' }}
              min={0}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
