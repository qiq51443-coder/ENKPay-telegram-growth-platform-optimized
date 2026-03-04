import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Switch, Tag, Space, message, Popconfirm, DatePicker,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';

const { TextArea } = Input;

interface Announcement {
  id: string;
  title: string;
  content: string;
  images: string[];
  targets: string[];
  scheduled_at?: string;
  expires_at?: string;
  is_pinned: boolean;
  show_on_app_launch: boolean;
  status: string;
  sent_at?: string;
  created_at: string;
}

const TARGET_OPTIONS = [
  { label: '群组', value: 'groups' },
  { label: '用户', value: 'users' },
  { label: 'App', value: 'app' },
];

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

export const Announcements: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/announcements', { headers: authHeaders() });
      setAnnouncements(response.data.announcements || []);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
      message.error('获取公告列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (announcement?: Announcement) => {
    if (announcement) {
      setEditingAnnouncement(announcement);
      form.setFieldsValue({
        title: announcement.title,
        content: announcement.content,
        targets: announcement.targets || [],
        is_pinned: announcement.is_pinned,
        show_on_app_launch: announcement.show_on_app_launch,
      });
    } else {
      setEditingAnnouncement(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        scheduled_at: values.scheduled_at?.toISOString?.() || values.scheduled_at || null,
        expires_at: values.expires_at?.toISOString?.() || values.expires_at || null,
      };

      if (editingAnnouncement) {
        await axios.put(`/api/announcements/${editingAnnouncement.id}`, payload, { headers: authHeaders() });
        message.success('公告更新成功');
      } else {
        await axios.post('/api/announcements', payload, { headers: authHeaders() });
        message.success('公告创建成功');
      }

      setModalOpen(false);
      fetchAnnouncements();
    } catch (error: any) {
      console.error('Failed to save announcement:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleSend = async (id: string) => {
    try {
      await axios.post(`/api/announcements/${id}/send`, {}, { headers: authHeaders() });
      message.success('公告已发送');
      fetchAnnouncements();
    } catch (error: any) {
      console.error('Failed to send announcement:', error);
      message.error(error.response?.data?.error || '发送失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/announcements/${id}`, { headers: authHeaders() });
      message.success('公告已删除');
      fetchAnnouncements();
    } catch (error: any) {
      console.error('Failed to delete announcement:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const statusMap: Record<string, { text: string; color: string }> = {
    draft: { text: '草稿', color: 'default' },
    scheduled: { text: '定时', color: 'processing' },
    sent: { text: '已发送', color: 'success' },
    expired: { text: '已过期', color: 'error' },
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '发送目标',
      dataIndex: 'targets',
      key: 'targets',
      render: (targets: string[]) => (
        <>
          {(targets || []).map(t => {
            const opt = TARGET_OPTIONS.find(o => o.value === t);
            return <Tag key={t}>{opt?.label || t}</Tag>;
          })}
        </>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const s = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '置顶',
      dataIndex: 'is_pinned',
      key: 'is_pinned',
      render: (v: boolean) => v ? <Tag color="gold">置顶</Tag> : '-',
    },
    {
      title: 'App启动公告',
      dataIndex: 'show_on_app_launch',
      key: 'show_on_app_launch',
      render: (v: boolean) => v ? <Tag color="blue">是</Tag> : '-',
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
      render: (_: any, record: Announcement) => (
        <Space>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(record)}>
            编辑
          </Button>
          {record.status !== 'sent' && (
            <Popconfirm
              title="确定要立即发送这条公告吗？"
              onConfirm={() => handleSend(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="text" size="small" icon={<SendOutlined />}>
                发送
              </Button>
            </Popconfirm>
          )}
          <Popconfirm
            title="确定要删除这条公告吗？"
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
        <h2 style={{ margin: 0 }}>公告管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          创建公告
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={announcements}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingAnnouncement ? '编辑公告' : '创建公告'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="公告标题" />
          </Form.Item>

          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: '请输入内容' }]}
          >
            <TextArea rows={5} placeholder="公告内容（支持 HTML 格式）" />
          </Form.Item>

          <Form.Item name="targets" label="发送目标">
            <Select mode="multiple" placeholder="选择发送目标（可多选）">
              {TARGET_OPTIONS.map(o => (
                <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="scheduled_at" label="定时发送（留空立即发送）">
            <DatePicker showTime style={{ width: '100%' }} placeholder="选择发送时间" />
          </Form.Item>

          <Form.Item name="expires_at" label="公告过期时间（留空永久）">
            <DatePicker showTime style={{ width: '100%' }} placeholder="选择过期时间" />
          </Form.Item>

          <Form.Item name="is_pinned" label="置顶" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>

          <Form.Item name="show_on_app_launch" label="App 启动时显示" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
