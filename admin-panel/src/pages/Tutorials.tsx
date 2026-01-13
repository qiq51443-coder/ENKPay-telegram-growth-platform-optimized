import React, { useEffect, useState } from 'react';
import { Table, message, Button, Modal, Form, Input, Select, InputNumber, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;

interface Tutorial {
  id: string;
  exchange_id: string;
  exchange_name: string;
  category_id: string;
  category_name: string;
  title: string;
  title_zh?: string;
  description?: string;
  description_zh?: string;
  is_active: boolean;
  order_index: number;
  created_at: string;
}

interface Exchange {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  name_en: string;
  name_zh: string;
  icon: string;
}

export const Tutorials: React.FC = () => {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTutorial, setEditingTutorial] = useState<Tutorial | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tutorialsRes, exchangesRes, categoriesRes] = await Promise.all([
        axios.get('/api/admin/tutorials'),
        axios.get('/api/admin/exchanges'),
        axios.get('/api/admin/tutorials/categories'),
      ]);
      
      setTutorials(tutorialsRes.data.tutorials || []);
      setExchanges(exchangesRes.data.exchanges || []);
      setCategories(categoriesRes.data.categories || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (tutorial?: Tutorial) => {
    if (tutorial) {
      setEditingTutorial(tutorial);
      form.setFieldsValue({
        exchange_id: tutorial.exchange_id,
        category_id: tutorial.category_id,
        title: tutorial.title,
        title_zh: tutorial.title_zh || '',
        description: tutorial.description || '',
        description_zh: tutorial.description_zh || '',
        order_index: tutorial.order_index,
      });
    } else {
      setEditingTutorial(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (editingTutorial) {
        await axios.put(`/api/admin/tutorials/${editingTutorial.id}`, values);
        message.success('教程更新成功');
      } else {
        await axios.post('/api/admin/tutorials', values);
        message.success('教程创建成功');
      }

      setModalOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Failed to save tutorial:', error);
      message.error(error.response?.data?.error || '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/admin/tutorials/${id}`);
      message.success('教程删除成功');
      fetchData();
    } catch (error: any) {
      console.error('Failed to delete tutorial:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleToggleStatus = async (tutorial: Tutorial) => {
    try {
      await axios.patch(`/api/admin/tutorials/${tutorial.id}/status`, {
        is_active: !tutorial.is_active,
      });
      message.success(tutorial.is_active ? '教程已停用' : '教程已启用');
      fetchData();
    } catch (error: any) {
      console.error('Failed to toggle tutorial status:', error);
      message.error('状态切换失败');
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
      title: '交易所',
      dataIndex: 'exchange_name',
      key: 'exchange_name',
      width: 120,
    },
    {
      title: '分类',
      dataIndex: 'category_name',
      key: 'category_name',
      width: 100,
    },
    {
      title: '标题 (EN)',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '标题 (ZH)',
      dataIndex: 'title_zh',
      key: 'title_zh',
      render: (text?: string) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (is_active: boolean) =>
        is_active ? <Tag color="success">启用</Tag> : <Tag color="default">停用</Tag>,
    },
    {
      title: '排序',
      dataIndex: 'order_index',
      key: 'order_index',
      width: 80,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_: any, record: Tutorial) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          <Button type="text" size="small" onClick={() => handleToggleStatus(record)}>
            {record.is_active ? '停用' : '启用'}
          </Button>
          <Popconfirm
            title="确定要删除这个教程吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>教程管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>管理交易所教程内容</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          添加教程
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={tutorials}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editingTutorial ? '编辑教程' : '添加教程'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="exchange_id"
            label="选择交易所"
            rules={[{ required: true, message: '请选择交易所' }]}
          >
            <Select placeholder="请选择...">
              {exchanges.map((exchange) => (
                <Select.Option key={exchange.id} value={exchange.id}>
                  {exchange.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="category_id"
            label="选择分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select placeholder="请选择...">
              {categories.map((category) => (
                <Select.Option key={category.id} value={category.id}>
                  {category.icon} {category.name_zh || category.name_en}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="title"
            label="标题 (English)"
            rules={[{ required: true, message: '请输入英文标题' }]}
          >
            <Input placeholder="Tutorial Title" />
          </Form.Item>

          <Form.Item name="title_zh" label="标题 (中文)">
            <Input placeholder="教程标题" />
          </Form.Item>

          <Form.Item name="description" label="描述 (English)">
            <TextArea rows={3} placeholder="Tutorial description..." />
          </Form.Item>

          <Form.Item name="description_zh" label="描述 (中文)">
            <TextArea rows={3} placeholder="教程描述..." />
          </Form.Item>

          <Form.Item
            name="order_index"
            label="排序序号"
            initialValue={0}
            rules={[{ required: true, message: '请输入排序序号' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
