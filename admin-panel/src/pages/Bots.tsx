import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Space, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

interface Bot {
  id: string;
  name: string;
  token: string;
  username?: string;
  is_active: boolean;
  webhook_url?: string;
  created_at: string;
}

export const Bots: React.FC = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/bots');
      setBots(response.data.bots || []);
    } catch (error) {
      console.error('Failed to fetch bots:', error);
      message.error('获取 Bot 列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (bot?: Bot) => {
    if (bot) {
      setEditingBot(bot);
      form.setFieldsValue({
        name: bot.name,
        token: bot.token,
        webhook_url: bot.webhook_url || '',
      });
    } else {
      setEditingBot(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingBot) {
        await axios.put(`/api/admin/bots/${editingBot.id}`, values);
        message.success('Bot 更新成功');
      } else {
        await axios.post('/api/admin/bots', values);
        message.success('Bot 创建成功');
      }
      
      setModalOpen(false);
      fetchBots();
    } catch (error: any) {
      console.error('Failed to save bot:', error);
      message.error(error.response?.data?.error || '操作失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/admin/bots/${id}`);
      message.success('Bot 删除成功');
      fetchBots();
    } catch (error: any) {
      console.error('Failed to delete bot:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleToggleStatus = async (bot: Bot) => {
    try {
      await axios.patch(`/api/admin/bots/${bot.id}/status`, {
        is_active: !bot.is_active,
      });
      message.success(bot.is_active ? 'Bot 已停用' : 'Bot 已启用');
      fetchBots();
    } catch (error: any) {
      console.error('Failed to toggle bot status:', error);
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
      title: 'Bot 名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username?: string) => username ? `@${username}` : '-',
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (is_active: boolean) =>
        is_active ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            运行中
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="default">
            已停用
          </Tag>
        ),
    },
    {
      title: 'Webhook URL',
      dataIndex: 'webhook_url',
      key: 'webhook_url',
      ellipsis: true,
      render: (url?: string) => url || '-',
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
      width: 200,
      render: (_: any, record: Bot) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          <Button
            type="text"
            size="small"
            onClick={() => handleToggleStatus(record)}
          >
            {record.is_active ? '停用' : '启用'}
          </Button>
          <Popconfirm
            title="确定要删除这个 Bot 吗？"
            description="这将删除 Bot 的 Webhook 并清除所有相关数据"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
            >
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
        <h2 style={{ margin: 0 }}>Bot 管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          添加 Bot
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={bots}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingBot ? '编辑 Bot' : '添加 Bot'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="name"
            label="Bot 名称"
            rules={[{ required: true, message: '请输入 Bot 名称' }]}
          >
            <Input placeholder="例如：主要 Bot" />
          </Form.Item>

          <Form.Item
            name="token"
            label="Bot Token"
            rules={[{ required: true, message: '请输入 Bot Token' }]}
          >
            <Input.Password placeholder="从 @BotFather 获取的 Token" />
          </Form.Item>

          <Form.Item
            name="webhook_url"
            label="Webhook URL"
          >
            <Input placeholder="https://your-domain.com/webhook" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
