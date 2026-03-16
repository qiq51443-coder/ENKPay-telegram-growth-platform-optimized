import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Popconfirm, Modal, Form, Input, Select, Alert, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, GiftOutlined, StopOutlined, CheckCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { apiClient } from '../services/api';

interface Group {
  id: string;
  bot_id: string;
  bot_name?: string;
  bot_username?: string;
  group_id: string;
  group_name: string;
  group_type?: string;
  joined_at: string;
  country?: string;
  language?: string;
  member_count?: number;
  is_active?: boolean;
}

interface BotOption {
  id: string;
  name: string;
  username?: string;
}

export const Groups: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editForm] = Form.useForm();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addForm] = Form.useForm();
  const [addLoading, setAddLoading] = useState(false);
  const [bots, setBots] = useState<BotOption[]>([]);
  const [botsError, setBotsError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchGroups = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const response = await axios.get('/api/bot-auth/groups', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setGroups(response.data.groups || []);
    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.message || '获取群组列表失败';
      console.error('Failed to fetch groups:', error);
      setFetchError(errMsg);
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const fetchBots = async () => {
    setBotsError(null);
    try {
      const data = await apiClient.getBots();
      setBots((data.bots || []).filter((b: any) => b.is_active));
    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.message || '获取 Bot 列表失败';
      console.error('Failed to fetch bots:', error);
      setBotsError(errMsg);
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchBots();
    const interval = setInterval(fetchGroups, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/bot-auth/groups/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      message.success('群组已移除');
      fetchGroups();
    } catch (error: any) {
      console.error('Failed to delete group:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleToggleStatus = async (record: Group) => {
    try {
      const newStatus = !record.is_active;
      await axios.patch(`/api/admin/groups/${record.id}/status`, { is_active: newStatus }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      message.success(newStatus ? '群组已启用' : '群组已禁用');
      fetchGroups();
    } catch (error: any) {
      console.error('Failed to toggle group status:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleEditClick = (record: Group) => {
    setEditingGroup(record);
    editForm.setFieldsValue({
      country: record.country || '',
      language: record.language || '',
    });
    setEditModalVisible(true);
  };

  const handleEditSubmit = async () => {
    if (!editingGroup) return;
    try {
      const values = await editForm.validateFields();
      await axios.put(`/api/admin/groups/${editingGroup.id}`, values, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      message.success('群组信息已更新');
      setEditModalVisible(false);
      setEditingGroup(null);
      fetchGroups();
    } catch (error: any) {
      if (error.errorFields) return;
      console.error('Failed to update group:', error);
      message.error(error.response?.data?.error || '更新失败');
    }
  };

  const handleAddGroup = async () => {
    try {
      const values = await addForm.validateFields();
      setAddLoading(true);
      await apiClient.manualRegisterGroup(values);
      message.success('群组已手动添加成功');
      setAddModalVisible(false);
      addForm.resetFields();
      fetchGroups();
    } catch (error: any) {
      if (error.errorFields) return;
      console.error('Failed to add group:', error);
      message.error(error.response?.data?.error || '添加失败');
    } finally {
      setAddLoading(false);
    }
  };

  const columns = [
    {
      title: '群组 ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{id}</span>,
    },
    {
      title: '群组名称',
      dataIndex: 'group_name',
      key: 'group_name',
      render: (name: string) => name || '-',
    },
    {
      title: 'Telegram 群组 ID',
      dataIndex: 'group_id',
      key: 'group_id',
      render: (group_id: string) => <span style={{ fontFamily: 'monospace' }}>{group_id}</span>,
    },
    {
      title: '国家',
      dataIndex: 'country',
      key: 'country',
      render: (country?: string) => country || '-',
    },
    {
      title: '语言',
      dataIndex: 'language',
      key: 'language',
      render: (language?: string) => language ? <Tag>{language}</Tag> : '-',
    },
    {
      title: '成员数',
      dataIndex: 'member_count',
      key: 'member_count',
      render: (count?: number) => count ?? '-',
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive?: boolean) => {
        if (isActive === undefined || isActive === null) return <Tag color="default">未知</Tag>;
        return isActive ? <Tag color="green">活跃</Tag> : <Tag color="red">停用</Tag>;
      },
    },
    {
      title: '加入时间',
      dataIndex: 'joined_at',
      key: 'joined_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 220,
      render: (_: any, record: Group) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<GiftOutlined />}
            onClick={() => navigate('/red-packets')}
          >
            发红包
          </Button>
          <Button
            type="text"
            size="small"
            icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
            danger={record.is_active}
            onClick={() => handleToggleStatus(record)}
          >
            {record.is_active ? '禁用' : '启用'}
          </Button>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditClick(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要移除这个群组吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>
              移除
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
          <h2 style={{ margin: 0 }}>群组管理</h2>
          <p style={{ color: '#666', marginTop: 4 }}>Bot 所在的群组列表（Bot 被添加到群组后自动记录）</p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchGroups} loading={loading}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalVisible(true)}>手动添加群组</Button>
        </Space>
      </div>

      {fetchError && (
        <Alert
          type="error"
          message="获取群组列表失败"
          description={fetchError}
          showIcon
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={fetchGroups}>重试</Button>}
        />
      )}

      <Table
        columns={columns}
        dataSource={groups}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1200 }}
        locale={{
          emptyText: (
            <div style={{ padding: '24px 0' }}>
              <Typography.Text type="secondary">暂无群组数据</Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                请将 Bot 添加到 Telegram 群组，系统将自动同步；或点击「手动添加群组」手动录入。
              </Typography.Text>
            </div>
          ),
        }}
      />

      <Modal
        title="编辑群组信息"
        open={editModalVisible}
        onOk={handleEditSubmit}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingGroup(null);
        }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="country" label="国家">
            <Input placeholder="请输入国家（如：中国、美国）" />
          </Form.Item>
          <Form.Item name="language" label="语言">
            <Select placeholder="请选择语言" allowClear>
              <Select.Option value="zh">中文 (zh)</Select.Option>
              <Select.Option value="en">英语 (en)</Select.Option>
              <Select.Option value="ja">日语 (ja)</Select.Option>
              <Select.Option value="ko">韩语 (ko)</Select.Option>
              <Select.Option value="ru">俄语 (ru)</Select.Option>
              <Select.Option value="ar">阿拉伯语 (ar)</Select.Option>
              <Select.Option value="es">西班牙语 (es)</Select.Option>
              <Select.Option value="fr">法语 (fr)</Select.Option>
              <Select.Option value="de">德语 (de)</Select.Option>
              <Select.Option value="pt">葡萄牙语 (pt)</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="手动添加群组"
        open={addModalVisible}
        onOk={handleAddGroup}
        confirmLoading={addLoading}
        onCancel={() => {
          setAddModalVisible(false);
          addForm.resetFields();
        }}
        okText="添加"
        cancelText="取消"
      >
        <Alert
          type="info"
          message="适用场景"
          description="当 Bot 已被添加到群组但管理面板未自动同步时，可在此手动录入群组信息。"
          showIcon
          style={{ marginBottom: 16 }}
        />
        {botsError && (
          <Alert
            type="error"
            message={`获取 Bot 列表失败：${botsError}`}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={addForm} layout="vertical">
          <Form.Item name="bot_id" label="Bot" rules={[{ required: true, message: '请选择 Bot' }]}>
            <Select placeholder="请选择 Bot">
              {bots.map(b => (
                <Select.Option key={b.id} value={b.id}>
                  {b.name}{b.username ? ` (@${b.username})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="group_id"
            label="Telegram 群组 ID"
            rules={[
              { required: true, message: '请输入群组 ID' },
              { pattern: /^-\d+$/, message: '群组 ID 格式不正确，应为负整数（如：-1001234567890）' },
            ]}
          >
            <Input placeholder="例如：-1001234567890" />
          </Form.Item>
          <Form.Item name="group_name" label="群组名称">
            <Input placeholder="可选，群组显示名称" />
          </Form.Item>
          <Form.Item name="group_type" label="群组类型" initialValue="supergroup">
            <Select>
              <Select.Option value="group">Group</Select.Option>
              <Select.Option value="supergroup">Supergroup</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="country" label="国家">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="language" label="语言">
            <Select placeholder="可选" allowClear>
              <Select.Option value="zh">中文 (zh)</Select.Option>
              <Select.Option value="en">英语 (en)</Select.Option>
              <Select.Option value="ja">日语 (ja)</Select.Option>
              <Select.Option value="ko">韩语 (ko)</Select.Option>
              <Select.Option value="ru">俄语 (ru)</Select.Option>
              <Select.Option value="ar">阿拉伯语 (ar)</Select.Option>
              <Select.Option value="es">西班牙语 (es)</Select.Option>
              <Select.Option value="fr">法语 (fr)</Select.Option>
              <Select.Option value="de">德语 (de)</Select.Option>
              <Select.Option value="pt">葡萄牙语 (pt)</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
