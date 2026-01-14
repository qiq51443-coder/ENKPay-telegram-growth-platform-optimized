import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Tabs,
  Space,
  message,
  Spin,
  Divider,
  Typography,
  Modal,
} from 'antd';
import { SaveOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { TextArea } = Input;
const { Text } = Typography;

interface SystemSetting {
  key: string;
  value: any;
  description?: string;
  category?: string;
  is_public?: boolean;
  updated_at?: string;
  updated_by_username?: string;
}

export const SystemSettings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [newSettingModalOpen, setNewSettingModalOpen] = useState(false);
  const [newSettingForm] = Form.useForm();

  const categories = [
    { key: 'general', label: '通用设置' },
    { key: 'rewards', label: '奖励设置' },
    { key: 'withdrawals', label: '提现设置' },
    { key: 'messages', label: '消息设置' },
    { key: 'notifications', label: '通知设置' },
    { key: 'security', label: '安全设置' },
  ];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getSystemSettings();
      const settingsData = response.settings || [];
      setSettings(settingsData);

      // Set form values
      const formValues: any = {};
      settingsData.forEach((setting: SystemSetting) => {
        formValues[setting.key] = parseSettingValue(setting.value);
      });
      form.setFieldsValue(formValues);
    } catch (error: any) {
      console.error('Failed to fetch system settings:', error);
      message.error('加载设置失败');
    } finally {
      setLoading(false);
    }
  };

  const parseSettingValue = (value: any): any => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        // Validate that parsed value is a primitive or simple object
        if (parsed !== null && typeof parsed === 'object') {
          // Check for prototype pollution attempts
          if (parsed.__proto__ || parsed.constructor || parsed.prototype) {
            console.warn('Suspicious JSON object detected, using raw value');
            return value;
          }
        }
        return parsed;
      } catch {
        return value;
      }
    }
    return value;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const values = form.getFieldsValue();
      
      // Prepare settings for bulk update
      const settingsToUpdate = Object.keys(values).map((key) => ({
        key,
        value: values[key],
      }));

      const response = await apiClient.bulkUpdateSystemSettings(settingsToUpdate);

      if (response.errors && response.errors.length > 0) {
        message.warning(`更新完成，但有 ${response.errors.length} 个设置失败`);
        console.error('Failed settings:', response.errors);
      } else {
        message.success('系统设置保存成功');
      }

      fetchSettings();
    } catch (error: any) {
      console.error('Failed to save system settings:', error);
      message.error(error.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSetting = async () => {
    try {
      const values = await newSettingForm.validateFields();

      await apiClient.createSystemSetting({
        ...values,
        value: values.value.toString(),
      });

      message.success('设置创建成功');
      setNewSettingModalOpen(false);
      newSettingForm.resetFields();
      fetchSettings();
    } catch (error: any) {
      console.error('Failed to create setting:', error);
      message.error(error.response?.data?.error || '创建失败');
    }
  };

  const renderSettingField = (setting: SystemSetting) => {
    const value = parseSettingValue(setting.value);
    const isBoolean = typeof value === 'boolean';
    const isNumber = typeof value === 'number' && !isBoolean;

    if (isBoolean) {
      return (
        <Form.Item
          key={setting.key}
          name={setting.key}
          label={setting.description || setting.key}
          valuePropName="checked"
        >
          <Switch checkedChildren="启用" unCheckedChildren="禁用" />
        </Form.Item>
      );
    }

    if (isNumber) {
      return (
        <Form.Item
          key={setting.key}
          name={setting.key}
          label={setting.description || setting.key}
        >
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
      );
    }

    // For strings, check if it's a long text
    if (typeof value === 'string' && value.length > 100) {
      return (
        <Form.Item
          key={setting.key}
          name={setting.key}
          label={setting.description || setting.key}
        >
          <TextArea rows={3} />
        </Form.Item>
      );
    }

    return (
      <Form.Item
        key={setting.key}
        name={setting.key}
        label={setting.description || setting.key}
      >
        <Input />
      </Form.Item>
    );
  };

  const renderCategorySettings = (categoryKey: string) => {
    const categorySettings = settings.filter((s) => s.category === categoryKey);

    if (categorySettings.length === 0) {
      return (
        <Card>
          <Text type="secondary">此类别暂无设置项</Text>
        </Card>
      );
    }

    return (
      <Card>
        {categorySettings.map((setting, index) => (
          <div key={setting.key}>
            {renderSettingField(setting)}
            {setting.updated_at && (
              <Text type="secondary" style={{ fontSize: '12px', marginTop: -16, display: 'block' }}>
                最后更新: {new Date(setting.updated_at).toLocaleString('zh-CN')}
                {setting.updated_by_username && ` 由 ${setting.updated_by_username}`}
              </Text>
            )}
            {index < categorySettings.length - 1 && <Divider />}
          </div>
        ))}
      </Card>
    );
  };

  const tabItems = categories.map((category) => ({
    key: category.key,
    label: category.label,
    children: renderCategorySettings(category.key),
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>系统设置</h2>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setNewSettingModalOpen(true)}>
            新增设置
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchSettings}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            保存所有设置
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Form form={form} layout="vertical">
          <Tabs items={tabItems} />
        </Form>
      </Spin>

      {/* New Setting Modal */}
      <Modal
        title="新增设置"
        open={newSettingModalOpen}
        onOk={handleCreateSetting}
        onCancel={() => setNewSettingModalOpen(false)}
        width={600}
      >
        <Form form={newSettingForm} layout="vertical">
          <Form.Item
            name="key"
            label="设置键"
            rules={[
              { required: true, message: '请输入设置键' },
              { pattern: /^[a-z_]+$/, message: '只能使用小写字母和下划线' },
            ]}
          >
            <Input placeholder="例如: new_feature_enabled" />
          </Form.Item>

          <Form.Item
            name="value"
            label="设置值"
            rules={[{ required: true, message: '请输入设置值' }]}
          >
            <Input placeholder="例如: true, 100, 或文本值" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input placeholder="设置的描述信息" />
          </Form.Item>

          <Form.Item
            name="category"
            label="分类"
            rules={[{ required: true, message: '请输入分类' }]}
          >
            <Input placeholder="例如: general, rewards, security" />
          </Form.Item>

          <Form.Item name="is_public" label="公开可见" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SystemSettings;
