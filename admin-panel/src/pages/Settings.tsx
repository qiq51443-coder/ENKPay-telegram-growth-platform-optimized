import React, { useState, useEffect } from 'react';
import { Tabs, Card, Form, Input, Button, Table, Space, message, Popconfirm, Modal, Select, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, SaveOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { TabPane } = Tabs;

interface Settings {
  platform_name?: string;
  platform_url?: string;
  required_channel_id?: string;
  required_group_id?: string;
  follow_reward?: number;
  bind_reward?: number;
  invite_reward?: number;
  new_user_credits?: number;
  screenshot_reward_credits?: number;
  support_telegram?: string;
  wallet_tip_message?: string;
  withdraw_min_amount?: number;
  transfer_min_amount?: number;
  withdraw_fee_rate?: number;
}

interface AdminUser {
  id: string;
  username: string;
  email?: string;
  role: string;
  full_name?: string;
  is_active: boolean;
  created_at: string;
}

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('platform');
  const [_settings, setSettings] = useState<Settings>({});
  const [_loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Admin management state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [adminForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  useEffect(() => {
    fetchSettings();
    fetchAdmins();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      // For now, we'll get settings for the first bot or use a default bot_id
      // In a real scenario, you might want to select which bot's settings to load
      const response = await apiClient.getSettings('default');
      setSettings(response.settings || {});
      form.setFieldsValue(response.settings || {});
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      message.warning('加载设置失败，使用默认值');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdmins = async () => {
    try {
      const response = await apiClient.getAdmins();
      setAdmins(response.admins || []);
    } catch (error) {
      console.error('Failed to fetch admins:', error);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const values = await form.validateFields();
      await apiClient.updateSettings('default', values);
      message.success('设置保存成功');
      setSettings(values);
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      message.error(error.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAdminModal = (admin?: AdminUser) => {
    if (admin) {
      setEditingAdmin(admin);
      adminForm.setFieldsValue({
        username: admin.username,
        email: admin.email || '',
        role: admin.role,
        full_name: admin.full_name || '',
      });
    } else {
      setEditingAdmin(null);
      adminForm.resetFields();
    }
    setAdminModalOpen(true);
  };

  const handleSaveAdmin = async () => {
    try {
      const values = await adminForm.validateFields();
      
      if (editingAdmin) {
        await apiClient.updateAdmin(editingAdmin.id, values);
        message.success('管理员更新成功');
      } else {
        await apiClient.createAdmin(values);
        message.success('管理员创建成功');
      }
      
      setAdminModalOpen(false);
      fetchAdmins();
    } catch (error: any) {
      console.error('Failed to save admin:', error);
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleDeleteAdmin = async (id: string) => {
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
    if (!editingAdmin) return;

    try {
      const values = await passwordForm.validateFields();
      
      if (values.new_password !== values.confirm_password) {
        message.error('新密码和确认密码不匹配');
        return;
      }

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

  const adminColumns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '姓名',
      dataIndex: 'full_name',
      key: 'full_name',
      render: (text: string) => text || '-',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (text: string) => text || '-',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        const roleMap: Record<string, string> = {
          super_admin: '超级管理员',
          admin: '管理员',
          reviewer: '审核员',
        };
        return roleMap[role] || role;
      },
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (is_active: boolean) => (
        <span style={{ color: is_active ? '#52c41a' : '#999' }}>
          {is_active ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: AdminUser) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenAdminModal(record)}
          >
            编辑
          </Button>
          <Button
            type="text"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => handleOpenPasswordModal(record)}
          >
            改密
          </Button>
          <Popconfirm
            title="确定要删除这个管理员吗？"
            onConfirm={() => handleDeleteAdmin(record.id)}
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
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>系统设置</h2>
        <p style={{ color: '#666', marginTop: 4 }}>配置平台参数和管理员</p>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="平台设置" key="platform">
          <Card>
            <Form form={form} layout="vertical">
              <h3 style={{ marginBottom: 16 }}>平台配置</h3>
              <Form.Item name="platform_name" label="平台名称">
                <Input placeholder="输入平台名称" />
              </Form.Item>
              <Form.Item name="platform_url" label="平台链接">
                <Input placeholder="https://example.com" />
              </Form.Item>
              <Form.Item name="required_channel_id" label="必需频道 ID">
                <Input placeholder="@channel_username" />
              </Form.Item>
              <Form.Item name="required_group_id" label="必需群组 ID">
                <Input placeholder="-1001234567890" />
              </Form.Item>

              <h3 style={{ marginTop: 24, marginBottom: 16 }}>钱包配置</h3>
              <Form.Item name="support_telegram" label="客服 Telegram 用户名" extra="不含@符号，例如：support_agent。设置后用户点击联系客服将直接跳转 Telegram。">
                <Input placeholder="support_agent" />
              </Form.Item>
              <Form.Item name="wallet_tip_message" label="钱包页提示语" extra="显示在用户钱包页底部的提示文字">
                <Input.TextArea rows={2} placeholder="例如：如有问题请联系客服" />
              </Form.Item>
              <Form.Item name="withdraw_min_amount" label="最低提现金额 ($)">
                <InputNumber min={0} step={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="transfer_min_amount" label="最低转账金额 ($)">
                <InputNumber min={0} step={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="withdraw_fee_rate" label="提现手续费率 (0~1，例如 0.02 = 2%)">
                <InputNumber min={0} max={1} step={0.01} precision={4} style={{ width: '100%' }} />
              </Form.Item>

              <h3 style={{ marginTop: 24, marginBottom: 16 }}>奖励设置</h3>
              <Form.Item name="follow_reward" label="关注奖励 ($)">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="bind_reward" label="绑定奖励 ($)">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="invite_reward" label="邀请奖励 ($)">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="new_user_credits" label="新用户积分">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="screenshot_reward_credits" label="截图奖励积分">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={handleSaveSettings}
                >
                  保存设置
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </TabPane>

        <TabPane tab="管理员管理" key="admins">
          <Card>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleOpenAdminModal()}
              >
                添加管理员
              </Button>
            </div>
            <Table
              columns={adminColumns}
              dataSource={admins}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>
      </Tabs>

      {/* Admin Modal */}
      <Modal
        title={editingAdmin ? '编辑管理员' : '添加管理员'}
        open={adminModalOpen}
        onOk={handleSaveAdmin}
        onCancel={() => setAdminModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={adminForm} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input disabled={!!editingAdmin} />
          </Form.Item>
          {!editingAdmin && (
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6个字符' }]}
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="full_name" label="姓名">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input type="email" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select>
              <Select.Option value="super_admin">超级管理员</Select.Option>
              <Select.Option value="admin">管理员</Select.Option>
              <Select.Option value="reviewer">审核员</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Password Modal */}
      <Modal
        title="修改密码"
        open={passwordModalOpen}
        onOk={handleChangePassword}
        onCancel={() => setPasswordModalOpen(false)}
        okText="修改"
        cancelText="取消"
      >
        <Form form={passwordForm} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item name="current_password" label="当前密码">
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6个字符' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            rules={[{ required: true, message: '请确认新密码' }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
