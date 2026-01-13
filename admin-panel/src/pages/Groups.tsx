import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

interface Group {
  id: string;
  chat_id: string;
  title: string;
  type: string;
  is_active: boolean;
  description?: string;
  created_at: string;
}

export const Groups: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/groups');
      setGroups(response.data.groups || []);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
      message.error('获取群组列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (group?: Group) => {
    if (group) {
      setEditingGroup(group);
      form.setFieldsValue({
        chat_id: group.chat_id,
        title: group.title,
        type: group.type,
        description: group.description || '',
      });
    } else {
      setEditingGroup(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingGroup) {
        await axios.put(`/api/admin/groups/${editingGroup.id}`, values);
        message.success('群组更新成功');
      } else {
        await axios.post('/api/admin/groups', values);
        message.success('群组创建成功');
      }
      
      setModalOpen(false);
      fetchGroups();
    } catch (error: any) {
      console.error('Failed to save group:', error);
      message.error(error.response?.data?.error || '操作失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/admin/groups/${id}`);
      message.success('群组删除成功');
      fetchGroups();
    } catch (error: any) {
      console.error('Failed to delete group:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleToggleStatus = async (group: Group) => {
    try {
      await axios.patch(`/api/admin/groups/${group.id}/status`, {
        is_active: !group.is_active,
      });
      message.success(group.is_active ? '群组已停用' : '群组已启用');
      fetchGroups();
    } catch (error: any) {
      console.error('Failed to toggle group status:', error);
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
      title: 'Chat ID',
      dataIndex: 'chat_id',
      key: 'chat_id',
      render: (chat_id: string) => <span style={{ fontFamily: 'monospace' }}>{chat_id}</span>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap: Record<string, { text: string; color: string }> = {
          group: { text: '群组', color: 'blue' },
          supergroup: { text: '超级群组', color: 'green' },
          channel: { text: '频道', color: 'purple' },
        };
        const typeInfo = typeMap[type] || { text: type, color: 'default' };
        return <Tag color={typeInfo.color}>{typeInfo.text}</Tag>;
      },
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
      width: 200,
      render: (_: any, record: Group) => (
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
            title="确定要删除这个群组吗？"
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
        <h2 style={{ margin: 0 }}>群组管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          添加群组
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={groups}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingGroup ? '编辑群组' : '添加群组'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="chat_id"
            label="Chat ID"
            rules={[{ required: true, message: '请输入 Chat ID' }]}
          >
            <Input placeholder="-1001234567890" />
          </Form.Item>

          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入群组标题' }]}
          >
            <Input placeholder="群组名称" />
          </Form.Item>

          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择群组类型' }]}
          >
            <Select placeholder="选择类型">
              <Select.Option value="group">群组</Select.Option>
              <Select.Option value="supergroup">超级群组</Select.Option>
              <Select.Option value="channel">频道</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="群组描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
