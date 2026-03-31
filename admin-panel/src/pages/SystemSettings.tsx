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
} from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
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
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [form] = Form.useForm();

  // QR code state
  const [qrInput, setQrInput] = useState('');
  const [qrUrl, setQrUrl] = useState('');

  const staticCategories = [
    { key: 'general', label: '通用设置' },
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

  const handleSaveCategory = async (categoryKey: string) => {
    setSavingCategory(categoryKey);
    try {
      const values = form.getFieldsValue();
      const categorySettingKeys = settings
        .filter((s) => s.category === categoryKey)
        .map((s) => s.key);

      const settingsToUpdate = categorySettingKeys
        .filter((key) => key in values)
        .map((key) => ({ key, value: values[key] }));

      const response = await apiClient.bulkUpdateSystemSettings(settingsToUpdate);

      if (response.errors && response.errors.length > 0) {
        message.warning(`更新完成，但有 ${response.errors.length} 个设置失败`);
        console.error('Failed settings:', response.errors);
      } else {
        message.success('该分类设置保存成功');
      }

      fetchSettings();
    } catch (error: any) {
      console.error('Failed to save category settings:', error);
      message.error(error.response?.data?.error || '保存失败');
    } finally {
      setSavingCategory(null);
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

    return (
      <Card>
        {categorySettings.length === 0 ? (
          <Text type="secondary">此类别暂无设置项</Text>
        ) : (
          categorySettings.map((setting, index) => (
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
          ))
        )}
        <Divider />
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={savingCategory === categoryKey}
          onClick={() => handleSaveCategory(categoryKey)}
        >
          保存本页设置
        </Button>
      </Card>
    );
  };

  const handleGenerateQr = () => {
    if (!qrInput.trim()) {
      message.warning('请先输入要生成二维码的内容');
      return;
    }
    const encoded = encodeURIComponent(qrInput.trim());
    setQrUrl(`https://chart.googleapis.com/chart?cht=qr&chs=256x256&chl=${encoded}`);
  };

  const handleDownloadQr = async () => {
    if (!qrUrl) return;
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `qrcode_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      message.error('下载失败，请重试');
    }
  };

  const qrCodeTab = (
    <Card title="二维码生成工具">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Input
          value={qrInput}
          onChange={(e) => setQrInput(e.target.value)}
          placeholder="请输入链接或文字内容..."
          onPressEnter={handleGenerateQr}
        />
        <Button type="primary" onClick={handleGenerateQr}>
          生成二维码
        </Button>
        {qrUrl && (
          <>
            <img src={qrUrl} alt="QR Code" width={256} height={256} />
            <Button onClick={handleDownloadQr}>下载二维码</Button>
          </>
        )}
      </Space>
    </Card>
  );

  const tabItems = [
    ...staticCategories.map((category) => ({
      key: category.key,
      label: category.label,
      children: renderCategorySettings(category.key),
    })),
    {
      key: 'qrcode',
      label: '二维码生成',
      children: qrCodeTab,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>系统设置</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchSettings}>
            刷新
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Form form={form} layout="vertical">
          <Tabs items={tabItems} />
        </Form>
      </Spin>
    </div>
  );
};

export default SystemSettings;
