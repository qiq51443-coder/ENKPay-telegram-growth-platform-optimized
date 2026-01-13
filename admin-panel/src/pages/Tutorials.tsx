import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Modal, Input, Button, Select, InputNumber, Popconfirm, Switch } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;

interface Tutorial {
  id: string;
  exchange_id: string;
  exchange_name: string;
  category_id: string;
  category_name_en: string;
  category_name_zh: string;
  title: string;
  title_zh?: string;
  description?: string;
  description_zh?: string;
  is_active: boolean;
  order_index: number;
}

interface Exchange {
  id: string;
  name: string;
  name_zh?: string;
}

interface Category {
  id: string;
  name: string;
  name_en: string;
  name_zh: string;
}

export const Tutorials: React.FC = () => {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [formData, setFormData] = useState({
    exchange_id: '',
    category_id: '',
    title: '',
    title_zh: '',
    description: '',
    description_zh: '',
    is_active: true,
    order_index: 0,
  });

  useEffect(() => {
    fetchTutorials();
    fetchExchanges();
    fetchCategories();
  }, []);

  const fetchTutorials = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/tutorials');
      setTutorials(response.data.tutorials || []);
    } catch (error) {
      console.error('Failed to fetch tutorials:', error);
      message.error('获取教程列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchExchanges = async () => {
    try {
      const response = await axios.get('/api/admin/exchanges');
      setExchanges(response.data.exchanges || []);
    } catch (error) {
      console.error('Failed to fetch exchanges:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await axios.get('/api/admin/tutorial-categories');
      setCategories(response.data.categories || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const handleOpenModal = (tutorial?: Tutorial) => {
    if (tutorial) {
      setEditingTutorial(tutorial);
      setFormData({
        exchange_id: tutorial.exchange_id,
        category_id: tutorial.category_id,
        title: tutorial.title,
        title_zh: tutorial.title_zh || '',
        description: tutorial.description || '',
        description_zh: tutorial.description_zh || '',
        is_active: tutorial.is_active,
        order_index: tutorial.order_index,
      });
    } else {
      setEditingTutorial(null);
      setFormData({
        exchange_id: '',
        category_id: '',
        title: '',
        title_zh: '',
        description: '',
        description_zh: '',
        is_active: true,
        order_index: 0,
      });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.exchange_id || !formData.category_id || !formData.title) {
      message.error('请填写必填字段');
      return;
    }
    try {
      if (editingTutorial) {
        await axios.put(`/api/admin/tutorials/${editingTutorial.id}`, formData);
        message.success('更新成功');
      } else {
        await axios.post('/api/admin/tutorials', formData);
        message.success('创建成功');
      }
      setModalOpen(false);
      fetchTutorials();
    } catch (error: any) {
      console.error('Failed to save tutorial:', error);
      message.error(error.response?.data?.error || '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/admin/tutorials/${id}`);
      message.success('删除成功');
      fetchTutorials();
    } catch (error: any) {
      console.error('Failed to delete tutorial:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleToggleActive = async (id: string, is_active: boolean) => {
    try {
      await axios.patch(`/api/admin/tutorials/${id}`, { is_active });
      message.success('状态更新成功');
      fetchTutorials();
    } catch (error: any) {
      console.error('Failed to update status:', error);
      message.error(error.response?.data?.error || '更新失败');
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
      key: 'title',
      render: (_: any, record: Tutorial) => (
        <div>
          <div>{record.title}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>{record.title_zh}</div>
        </div>
      ),
    },
    {
      title: '交易所',
      dataIndex: 'exchange_name',
      key: 'exchange_name',
    },
    {
      title: '分类',
      key: 'category',
      render: (_: any, record: Tutorial) => (
        <div>
          <div>{record.category_name_en}</div>
          <div style={{ fontSize: '12px', color: '#999' }}>{record.category_name_zh}</div>
        </div>
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
      render: (is_active: boolean, record: Tutorial) => (
        <Switch
          checked={is_active}
          onChange={(checked) => handleToggleActive(record.id, checked)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: Tutorial) => (
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
            title="确定要删除这个教程吗？"
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
          <h2>教程管理</h2>
          <p style={{ color: '#666' }}>管理平台教程内容</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          添加教程
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={tutorials}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
      />

      {/* Edit/Create Modal */}
      <Modal
        title={editingTutorial ? '编辑教程' : '添加教程'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditingTutorial(null);
        }}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>交易所 *</label>
            <Select
              value={formData.exchange_id}
              onChange={(value) => setFormData({ ...formData, exchange_id: value })}
              style={{ width: '100%' }}
              placeholder="选择交易所"
              options={exchanges.map(ex => ({ value: ex.id, label: `${ex.name} (${ex.name_zh || ''})` }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>分类 *</label>
            <Select
              value={formData.category_id}
              onChange={(value) => setFormData({ ...formData, category_id: value })}
              style={{ width: '100%' }}
              placeholder="选择分类"
              options={categories.map(cat => ({ value: cat.id, label: `${cat.name_en} (${cat.name_zh})` }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>标题 (英文) *</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Tutorial Title"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>标题 (中文)</label>
            <Input
              value={formData.title_zh}
              onChange={(e) => setFormData({ ...formData, title_zh: e.target.value })}
              placeholder="教程标题"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>描述 (英文)</label>
            <TextArea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Description in English..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>描述 (中文)</label>
            <TextArea
              value={formData.description_zh}
              onChange={(e) => setFormData({ ...formData, description_zh: e.target.value })}
              rows={3}
              placeholder="中文描述..."
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
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>状态</label>
            <Switch
              checked={formData.is_active}
              onChange={(checked) => setFormData({ ...formData, is_active: checked })}
              checkedChildren="启用"
              unCheckedChildren="禁用"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
