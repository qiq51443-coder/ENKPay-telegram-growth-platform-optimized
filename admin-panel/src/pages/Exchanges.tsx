import React, { useEffect, useState } from 'react';
import { Table, message, Button, Modal, Form, Input, InputNumber, Space, Tag, Popconfirm } from 'antd';
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
  is_active: boolean;
  order_index: number;
  created_at: string;
}

export const Exchanges: React.FC = () => {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExchange, setEditingExchange] = useState<Exchange | null>(null);
  const [form] = Form.useForm();

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
      form.setFieldsValue({
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
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        name: values.name,
        name_zh: values.name_zh,
        logo_url: values.logo_url,
        register_url: values.register_url,
        tutorial_content: {
          en: values.tutorial_content_en,
          zh: values.tutorial_content_zh,
        },
        order_index: values.order_index,
      };

      if (editingExchange) {
        await axios.put(`/api/admin/exchanges/${editingExchange.id}`, data);
        message.success('交易所更新成功');
      } else {
        await axios.post('/api/admin/exchanges', data);
        message.success('交易所创建成功');
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
      message.success('交易所删除成功');
      fetchExchanges();
    } catch (error: any) {
      console.error('Failed to delete exchange:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleToggleStatus = async (exchange: Exchange) => {
    try {
      await axios.patch(`/api/admin/exchanges/${exchange.id}/status`, {
        is_active: !exchange.is_active,
      });
      message.success(exchange.is_active ? '交易所已停用' : '交易所已启用');
      fetchExchanges();
    } catch (error: any) {
      console.error('Failed to toggle exchange status:', error);
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
      title: 'Logo',
      dataIndex: 'logo_url',
      key: 'logo_url',
      width: 80,
      render: (logo_url?: string) =>
        logo_url ? (
          <img src={logo_url} alt="logo" style={{ width: 40, height: 40, objectFit: 'contain' }} />
        ) : (
          '-'
        ),
    },
    {
      title: '名称 (EN)',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '名称 (ZH)',
      dataIndex: 'name_zh',
      key: 'name_zh',
      render: (text?: string) => text || '-',
    },
    {
      title: '注册链接',
      dataIndex: 'register_url',
      key: 'register_url',
      ellipsis: true,
      render: (url: string) => (
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px' }}>
          {url}
        </a>
      ),
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
      render: (_: any, record: Exchange) => (
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
            title="确定要删除这个交易所吗？"
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
          <h2 style={{ margin: 0 }}>交易所管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>管理交易所信息和教程</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          添加交易所
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={exchanges}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editingExchange ? '编辑交易所' : '添加交易所'}
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
            name="name"
            label="名称 (English)"
            rules={[{ required: true, message: '请输入英文名称' }]}
          >
            <Input placeholder="Binance" />
          </Form.Item>

          <Form.Item name="name_zh" label="名称 (中文)">
            <Input placeholder="币安" />
          </Form.Item>

          <Form.Item name="logo_url" label="Logo URL">
            <Input placeholder="https://example.com/logo.png" />
          </Form.Item>

          <Form.Item
            name="register_url"
            label="注册链接"
            rules={[{ required: true, message: '请输入注册链接' }]}
          >
            <Input placeholder="https://..." />
          </Form.Item>

          <Form.Item name="tutorial_content_en" label="教程内容 (English)">
            <TextArea rows={4} placeholder="Tutorial content in English..." />
          </Form.Item>

          <Form.Item name="tutorial_content_zh" label="教程内容 (中文)">
            <TextArea rows={4} placeholder="中文教程内容..." />
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
