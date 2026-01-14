import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Tag,
  message,
  Popconfirm,
  Switch,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { apiClient } from '../services/api';
import type { ColumnsType } from 'antd/es/table';

interface AdminUser {
  id: string;
  username: string;
  email?: string;
  role: string;
  full_name?: string;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  created_by?: string;
}

export const AdminUserManager: React.FC = () => {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getAdmins();
      setAdmins(response.admins || []);
    } catch (error: any) {
      console.error('Failed to fetch admins:', error);
      if (error.response?.status !== 403) {
        message.error('获取管理员列表失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (admin?: AdminUser) => {
    if (admin) {
      setEditingAdmin(admin);
      form.setFieldsValue({
        username: admin.username,
        email: admin.email || '',
        role: admin.role,
        full_name: admin.full_name || '',
        is_active: admin.is_active,
      });
    } else {
      setEditingAdmin(null);
      form.resetFields();
      form.setFieldsValue({ is_active: true, role: 'admin' });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (editingAdmin) {
        await apiClient.updateAdmin(editingAdmin.id, values);
        message.success('管理员更新成功');
      } else {
        await apiClient.createAdmin(values);
        message.success('管理员创建成功');
      }

      setModalOpen(false);
      fetchAdmins();
    } catch (error: any) {
      console.error('Failed to save admin:', error);
      message.error(error.response?.data?.error || '操作失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteAdmin(id);
      message.success('管理员删除成功');
      fetchAdmins();
    } catch (error: any) {
      console.error('Failed to delete admin:', error);
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const handleOpenPasswordModal = (admin: AdminUser) => {
    setEditingAdmin(admin);
    passwordForm.resetFields();
    setPasswordModalOpen(true);
  };

  const handleChangePassword = async () => {
    try {
      const values = await passwordForm.validateFields();

      if (!editingAdmin) return;

      await apiClient.changeAdminPassword(editingAdmin.id, {
        current_password: values.current_password,
        new_password: values.new_password,
      });

      message.success('密码修改成功');
      setPasswordModalOpen(false);
    } catch (error: any) {
      console.error('Failed to change password:', error);
      message.error(error.response?.data?.error || '密码修改失败');
    }
  };

  const getRoleTag = (role: string) => {
    const roleConfig: Record<string, { color: string; text: string }> = {
      super_admin: { color: 'red', text: '超级管理员' },
      admin: { color: 'blue', text: '管理员' },
      reviewer: { color: 'green', text: '审核员' },
    };
    const config = roleConfig[role] || { color: 'default', text: role };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 150,
    },
    {
      title: '全名',
      dataIndex: 'full_name',
      key: 'full_name',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (text) => text || '-',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 130,
      render: (role) => getRoleTag(role),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (is_active) =>
        is_active ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            激活
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">
            停用
          </Tag>
        ),
    },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 180,
      render: (date) => (date ? new Date(date).toLocaleString('zh-CN') : '从未登录'),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => handleOpenPasswordModal(record)}
          >
            改密
          </Button>
          <Popconfirm
            title="确定要删除此管理员吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>管理员管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          创建管理员
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={admins}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个管理员`,
        }}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingAdmin ? '编辑管理员' : '创建管理员'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" disabled={!!editingAdmin} />
          </Form.Item>

          <Form.Item
            name="full_name"
            label="全名"
          >
            <Input placeholder="请输入全名" />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          {!editingAdmin && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6个字符' },
              ]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          )}

          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色">
              <Select.Option value="super_admin">超级管理员</Select.Option>
              <Select.Option value="admin">管理员</Select.Option>
              <Select.Option value="reviewer">审核员</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item name="is_active" label="状态" valuePropName="checked">
            <Switch checkedChildren="激活" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        title="修改密码"
        open={passwordModalOpen}
        onOk={handleChangePassword}
        onCancel={() => setPasswordModalOpen(false)}
        width={500}
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="current_password"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password placeholder="请输入当前密码" />
          </Form.Item>

          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请确认新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminUserManager;
