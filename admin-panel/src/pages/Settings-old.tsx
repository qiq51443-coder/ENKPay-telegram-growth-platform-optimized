import React, { useState, useEffect } from 'react';
import { Save, Plus, Edit, Trash2, Key } from 'lucide-react';
import { Layout } from '../components/Layout/Layout';
import { Loading } from '../components/Common/Loading';
import { Button } from '../components/Forms/Button';
import { Input } from '../components/Forms/Input';
import { Select } from '../components/Forms/Select';
import { Modal } from '../components/Common/Modal';
import { Table } from '../components/Common/Table';
import apiClient from '../services/api';
import { Bot, Settings as SettingsType } from '../services/types';

interface AdminUser {
  id: string;
  username: string;
  email?: string;
  role: string;
  full_name?: string;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
}

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'platform' | 'admins'>('platform');
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Admin management state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [adminFormData, setAdminFormData] = useState({
    username: '',
    password: '',
    email: '',
    role: 'admin',
    full_name: '',
  });
  const [passwordFormData, setPasswordFormData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  useEffect(() => {
    fetchBots();
    fetchAdmins();
  }, []);

  useEffect(() => {
    if (selectedBotId) {
      fetchSettings();
    }
  }, [selectedBotId]);

  const fetchBots = async () => {
    try {
      const response = await apiClient.getBots();
      setBots(response.bots || []);
      if (response.bots && response.bots.length > 0) {
        setSelectedBotId(response.bots[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch bots:', error);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getSettings(selectedBotId);
      setSettings(response.settings);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
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

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await apiClient.updateSettings(selectedBotId, settings);
      alert('保存成功');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof SettingsType, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  // Admin management functions
  const handleOpenAdminModal = (admin?: AdminUser) => {
    if (admin) {
      setEditingAdmin(admin);
      setAdminFormData({
        username: admin.username,
        password: '',
        email: admin.email || '',
        role: admin.role,
        full_name: admin.full_name || '',
      });
    } else {
      setEditingAdmin(null);
      setAdminFormData({
        username: '',
        password: '',
        email: '',
        role: 'admin',
        full_name: '',
      });
    }
    setAdminModalOpen(true);
  };

  const handleSaveAdmin = async () => {
    try {
      if (editingAdmin) {
        await apiClient.updateAdmin(editingAdmin.id, {
          username: adminFormData.username,
          email: adminFormData.email,
          role: adminFormData.role,
          full_name: adminFormData.full_name,
        });
        alert('管理员更新成功');
      } else {
        if (!adminFormData.password) {
          alert('请输入密码');
          return;
        }
        await apiClient.createAdmin(adminFormData);
        alert('管理员创建成功');
      }
      setAdminModalOpen(false);
      fetchAdmins();
    } catch (error: any) {
      console.error('Failed to save admin:', error);
      const errorMessage = error.response?.data?.error || '操作失败';
      alert(errorMessage);
    }
  };

  const handleDeleteAdmin = async (id: string) => {
    if (!confirm('确定要删除这个管理员吗？')) return;
    try {
      await apiClient.deleteAdmin(id);
      alert('管理员删除成功');
      fetchAdmins();
    } catch (error: any) {
      console.error('Failed to delete admin:', error);
      const errorMessage = error.response?.data?.error || '删除失败';
      alert(errorMessage);
    }
  };

  const handleOpenPasswordModal = (admin: AdminUser) => {
    setEditingAdmin(admin);
    setPasswordFormData({
      current_password: '',
      new_password: '',
      confirm_password: '',
    });
    setPasswordModalOpen(true);
  };

  const handleChangePassword = async () => {
    if (!editingAdmin) return;

    if (passwordFormData.new_password !== passwordFormData.confirm_password) {
      alert('新密码和确认密码不匹配');
      return;
    }

    if (passwordFormData.new_password.length < 6) {
      alert('密码至少需要 6 个字符');
      return;
    }

    try {
      await apiClient.changeAdminPassword(editingAdmin.id, {
        current_password: passwordFormData.current_password || undefined,
        new_password: passwordFormData.new_password,
      });
      alert('密码修改成功');
      setPasswordModalOpen(false);
    } catch (error: any) {
      console.error('Failed to change password:', error);
      const errorMessage = error.response?.data?.error || '密码修改失败';
      alert(errorMessage);
    }
  };

  const adminColumns = [
    {
      key: 'username',
      title: '用户名',
      render: (admin: AdminUser) => admin.username,
    },
    {
      key: 'full_name',
      title: '姓名',
      render: (admin: AdminUser) => admin.full_name || '-',
    },
    {
      key: 'email',
      title: '邮箱',
      render: (admin: AdminUser) => admin.email || '-',
    },
    {
      key: 'role',
      title: '角色',
      render: (admin: AdminUser) => {
        const roleMap: Record<string, string> = {
          super_admin: '超级管理员',
          admin: '管理员',
          reviewer: '审核员',
        };
        return (
          <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
            {roleMap[admin.role] || admin.role}
          </span>
        );
      },
    },
    {
      key: 'is_active',
      title: '状态',
      render: (admin: AdminUser) => (
        <span
          className={`px-2 py-1 rounded-full text-xs ${
            admin.is_active
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {admin.is_active ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (admin: AdminUser) => (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="text-xs py-1 px-2"
            onClick={() => handleOpenAdminModal(admin)}
          >
            <Edit className="w-3 h-3" />
          </Button>
          <Button
            variant="secondary"
            className="text-xs py-1 px-2"
            onClick={() => handleOpenPasswordModal(admin)}
          >
            <Key className="w-3 h-3" />
          </Button>
          <Button
            variant="danger"
            className="text-xs py-1 px-2"
            onClick={() => handleDeleteAdmin(admin.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ),
    },
  ];

  if (loading && !settings && activeTab === 'platform') {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
          <p className="text-gray-600 mt-1">配置平台参数和管理员</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('platform')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'platform'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              平台设置
            </button>
            <button
              onClick={() => setActiveTab('admins')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'admins'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              管理员管理
            </button>
          </nav>
        </div>

        {/* Platform Settings Tab */}
        {activeTab === 'platform' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="mb-6">
              <Select
                label="选择 Bot"
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(e.target.value)}
                options={bots.map((bot) => ({ value: bot.id, label: bot.name }))}
              />
            </div>

            {settings && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">平台配置</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="平台名称"
                      value={settings.platform_name || ''}
                      onChange={(e) => updateSetting('platform_name', e.target.value)}
                    />
                    <Input
                      label="平台链接"
                      value={settings.platform_url || ''}
                      onChange={(e) => updateSetting('platform_url', e.target.value)}
                    />
                    <Input
                      label="必需频道 ID"
                      value={settings.required_channel_id || ''}
                      onChange={(e) =>
                        updateSetting('required_channel_id', e.target.value)
                      }
                      placeholder="@channel_username"
                    />
                    <Input
                      label="必需群组 ID"
                      value={settings.required_group_id || ''}
                      onChange={(e) => updateSetting('required_group_id', e.target.value)}
                      placeholder="-1001234567890"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">奖励设置</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="关注奖励 ($)"
                      type="number"
                      step="0.01"
                      value={settings.follow_reward}
                      onChange={(e) =>
                        updateSetting('follow_reward', parseFloat(e.target.value))
                      }
                    />
                    <Input
                      label="绑定奖励 ($)"
                      type="number"
                      step="0.01"
                      value={settings.bind_reward}
                      onChange={(e) =>
                        updateSetting('bind_reward', parseFloat(e.target.value))
                      }
                    />
                    <Input
                      label="邀请奖励 ($)"
                      type="number"
                      step="0.01"
                      value={settings.invite_reward}
                      onChange={(e) =>
                        updateSetting('invite_reward', parseFloat(e.target.value))
                      }
                    />
                    <Input
                      label="新用户积分"
                      type="number"
                      value={settings.new_user_credits}
                      onChange={(e) =>
                        updateSetting('new_user_credits', parseInt(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleSave}
                    loading={saving}
                    variant="primary"
                    className="px-6"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    保存设置
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Admin Management Tab */}
        {activeTab === 'admins' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => handleOpenAdminModal()}>
                <Plus className="w-4 h-4 mr-2" />
                添加管理员
              </Button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <Table columns={adminColumns} data={admins} loading={false} />
            </div>
          </div>
        )}

        {/* Admin Modal */}
        <Modal
          isOpen={adminModalOpen}
          onClose={() => setAdminModalOpen(false)}
          title={editingAdmin ? '编辑管理员' : '添加管理员'}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAdminModalOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={handleSaveAdmin}>
                保存
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="用户名"
              value={adminFormData.username}
              onChange={(e) =>
                setAdminFormData({ ...adminFormData, username: e.target.value })
              }
              required
              disabled={!!editingAdmin}
            />
            {!editingAdmin && (
              <Input
                label="密码"
                type="password"
                value={adminFormData.password}
                onChange={(e) =>
                  setAdminFormData({ ...adminFormData, password: e.target.value })
                }
                required
              />
            )}
            <Input
              label="姓名"
              value={adminFormData.full_name}
              onChange={(e) =>
                setAdminFormData({ ...adminFormData, full_name: e.target.value })
              }
            />
            <Input
              label="邮箱"
              type="email"
              value={adminFormData.email}
              onChange={(e) =>
                setAdminFormData({ ...adminFormData, email: e.target.value })
              }
            />
            <Select
              label="角色"
              value={adminFormData.role}
              onChange={(e) =>
                setAdminFormData({ ...adminFormData, role: e.target.value })
              }
              options={[
                { value: 'super_admin', label: '超级管理员' },
                { value: 'admin', label: '管理员' },
                { value: 'reviewer', label: '审核员' },
              ]}
            />
          </div>
        </Modal>

        {/* Password Modal */}
        <Modal
          isOpen={passwordModalOpen}
          onClose={() => setPasswordModalOpen(false)}
          title="修改密码"
          footer={
            <>
              <Button variant="secondary" onClick={() => setPasswordModalOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={handleChangePassword}>
                修改
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="当前密码"
              type="password"
              value={passwordFormData.current_password}
              onChange={(e) =>
                setPasswordFormData({
                  ...passwordFormData,
                  current_password: e.target.value,
                })
              }
            />
            <Input
              label="新密码"
              type="password"
              value={passwordFormData.new_password}
              onChange={(e) =>
                setPasswordFormData({
                  ...passwordFormData,
                  new_password: e.target.value,
                })
              }
              required
            />
            <Input
              label="确认新密码"
              type="password"
              value={passwordFormData.confirm_password}
              onChange={(e) =>
                setPasswordFormData({
                  ...passwordFormData,
                  confirm_password: e.target.value,
                })
              }
              required
            />
          </div>
        </Modal>
      </div>
    </Layout>
  );
};
