import React, { useEffect, useState } from 'react';
import { Table, message, Button, Modal, Form, Input, Select, Tag, Space, Popconfirm } from 'antd';
import { PlusOutlined, SendOutlined, DeleteOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { TextArea } = Input;

interface Broadcast {
  id: string;
  bot_id: string;
  title: string;
  content: string;
  target_type: string;
  status: string;
  sent_count?: number;
  failed_count?: number;
  created_at: string;
  sent_at?: string;
}

interface Bot {
  id: string;
  name: string;
}

export const Broadcasts: React.FC = () => {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

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
      message.error('获取广播列表失败');
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
      const values = await form.validateFields();
      await apiClient.createBroadcast(values);
      message.success('广播创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchBroadcasts();
    } catch (error: any) {
      console.error('Failed to create broadcast:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const handleSend = async (id: string) => {
    try {
      await apiClient.sendBroadcast(id);
      message.success('广播发送中...');
      fetchBroadcasts();
    } catch (error: any) {
      console.error('Failed to send broadcast:', error);
      message.error(error.response?.data?.error || '发送失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteBroadcast(id);
      message.success('广播删除成功');
      fetchBroadcasts();
    } catch (error: any) {
      console.error('Failed to delete broadcast:', error);
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
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '内容',
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      width: 300,
    },
    {
      title: '目标用户',
      dataIndex: 'target_type',
      key: 'target_type',
      width: 120,
      render: (target_type: string) => {
        const targetMap: Record<string, string> = {
          all: '全部用户',
          active: '活跃用户',
          bound: '已绑定',
          unbound: '未绑定',
        };
        return targetMap[target_type] || target_type;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          draft: { text: '草稿', color: 'default' },
          scheduled: { text: '已安排', color: 'processing' },
          sending: { text: '发送中', color: 'warning' },
          completed: { text: '已完成', color: 'success' },
          failed: { text: '失败', color: 'error' },
        };
        const statusInfo = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      },
    },
    {
      title: '统计',
      key: 'stats',
      width: 120,
      render: (_: any, record: Broadcast) =>
        record.sent_count ? (
          <div style={{ fontSize: '12px' }}>
            <div style={{ color: '#52c41a' }}>成功: {record.sent_count}</div>
            {record.failed_count ? (
              <div style={{ color: '#ff4d4f' }}>失败: {record.failed_count}</div>
            ) : null}
          </div>
        ) : (
          '-'
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: Broadcast) => (
        <Space>
          {record.status === 'draft' && (
            <Popconfirm
              title="确定要发送这条广播吗？"
              onConfirm={() => handleSend(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" size="small" icon={<SendOutlined />}>
                发送
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="确定要删除这条广播吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
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
          <h2 style={{ margin: 0 }}>广播管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>创建和发送广播消息</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          创建广播
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={broadcasts}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title="创建广播"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="bot_id"
            label="选择 Bot"
            rules={[{ required: true, message: '请选择 Bot' }]}
          >
            <Select placeholder="请选择...">
              {bots.map((bot) => (
                <Select.Option key={bot.id} value={bot.id}>
                  {bot.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入广播标题' }]}
          >
            <Input placeholder="广播标题" />
          </Form.Item>

          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: '请输入广播内容' }]}
          >
            <TextArea rows={5} placeholder="输入广播内容..." />
          </Form.Item>

          <Form.Item
            name="target_type"
            label="目标用户"
            rules={[{ required: true, message: '请选择目标用户' }]}
            initialValue="all"
          >
            <Select>
              <Select.Option value="all">全部用户</Select.Option>
              <Select.Option value="active">活跃用户</Select.Option>
              <Select.Option value="bound">已绑定用户</Select.Option>
              <Select.Option value="unbound">未绑定用户</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
