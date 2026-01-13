import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Space, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

interface Channel {
  id: string;
  channel_id: string;
  title: string;
  username?: string;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
}

export const Channels: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/channels');
      setChannels(response.data.channels || []);
    } catch (error) {
      console.error('Failed to fetch channels:', error);
      message.error('获取频道列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (channel?: Channel) => {
    if (channel) {
      setEditingChannel(channel);
      form.setFieldsValue({
        channel_id: channel.channel_id,
        title: channel.title,
        username: channel.username || '',
      });
    } else {
      setEditingChannel(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingChannel) {
        await axios.put(`/api/admin/channels/${editingChannel.id}`, values);
        message.success('频道更新成功');
      } else {
        await axios.post('/api/admin/channels', values);
        message.success('频道创建成功');
      }
      
      setModalOpen(false);
      fetchChannels();
    } catch (error: any) {
      console.error('Failed to save channel:', error);
      message.error(error.response?.data?.error || '操作失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/admin/channels/${id}`);
      message.success('频道删除成功');
      fetchChannels();
    } catch (error: any) {
      console.error('Failed to delete channel:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleToggleRequired = async (channel: Channel) => {
    try {
      await axios.patch(`/api/admin/channels/${channel.id}/required`, {
        is_required: !channel.is_required,
      });
      message.success(channel.is_required ? '已取消必需关注' : '已设为必需关注');
      fetchChannels();
    } catch (error: any) {
      console.error('Failed to toggle channel required status:', error);
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
      title: 'Channel ID',
      dataIndex: 'channel_id',
      key: 'channel_id',
      render: (channel_id: string) => <span style={{ fontFamily: 'monospace' }}>{channel_id}</span>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username?: string) => username ? `@${username}` : '-',
    },
    {
      title: '必需关注',
      dataIndex: 'is_required',
      key: 'is_required',
      render: (is_required: boolean) =>
        is_required ? (
          <Tag color="error">必需</Tag>
        ) : (
          <Tag color="default">可选</Tag>
        ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (is_active: boolean) =>
        is_active ? (
          <Tag color="success">启用</Tag>
        ) : (
          <Tag color="default">停用</Tag>
        ),
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
      width: 220,
      render: (_: any, record: Channel) => (
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
            onClick={() => handleToggleRequired(record)}
          >
            {record.is_required ? '取消必需' : '设为必需'}
          </Button>
          <Popconfirm
            title="确定要删除这个频道吗？"
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
        <h2 style={{ margin: 0 }}>频道管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          添加频道
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={channels}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingChannel ? '编辑频道' : '添加频道'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="channel_id"
            label="Channel ID"
            rules={[{ required: true, message: '请输入 Channel ID' }]}
          >
            <Input placeholder="-1001234567890 或 @channelname" />
          </Form.Item>

          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入频道标题' }]}
          >
            <Input placeholder="频道名称" />
          </Form.Item>

          <Form.Item name="username" label="用户名">
            <Input placeholder="channelname (不含 @)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
