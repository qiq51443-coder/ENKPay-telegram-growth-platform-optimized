import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Tabs,
  Space,
  message,
  Spin,
  Collapse,
  Tag,
  Typography,
} from 'antd';
import { ReloadOutlined, TranslationOutlined } from '@ant-design/icons';
import { apiClient } from '../services/api';

const { TextArea } = Input;
const { Text } = Typography;

const AGREEMENT_LANGUAGES: { code: string; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
  { code: 'ja', label: '日本語' },
];

interface SystemSetting {
  key: string;
  value: any;
  description?: string;
  category?: string;
  is_public?: boolean;
  updated_at?: string;
  updated_by_username?: string;
}

/** Maximum characters shown in the Collapse panel header preview */
const PREVIEW_TEXT_LENGTH = 30;

/** Unwrap a value that may be stored as a JSON-encoded string (e.g. `"\"text\""`) */
function unwrapJsonString(v: any): string {
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (typeof parsed === 'string') return parsed;
    } catch {}
  }
  return String(v ?? '');
}

export const SystemSettings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);

  // User agreement state
  const [agreementText, setAgreementText] = useState('');
  const [agreementTranslations, setAgreementTranslations] = useState<Record<string, string> | null>(null);
  const [agreementSaving, setAgreementSaving] = useState(false);

  // QR code state
  const [qrInput, setQrInput] = useState('');
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getSystemSettings();
      const settingsData = response.settings || [];
      setSettings(settingsData);

      // Pre-fill agreement text from stored zh version (only if user hasn't typed anything)
      const zhAgreement = settingsData.find((s: SystemSetting) => s.key === 'user_agreement_zh');
      if (zhAgreement?.value && !agreementText) {
        setAgreementText(unwrapJsonString(zhAgreement.value));
      }
    } catch (error: any) {
      console.error('Failed to fetch system settings:', error);
      const detail = error?.response?.data?.error || error?.message || '未知错误';
      message.error(`加载设置失败: ${detail}`);
      setSettings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAgreementTranslateAndSave = async () => {
    if (!agreementText.trim()) {
      message.warning('请先输入用户协议内容');
      return;
    }
    setAgreementSaving(true);
    try {
      const result = await apiClient.translateAndSaveUserAgreement(agreementText);
      setAgreementTranslations(result.translations);
      message.success(`用户协议已翻译并保存 ${result.saved_keys?.length || 0} 个语言版本`);
      await fetchSettings();
    } catch (error: any) {
      console.error('Failed to save user agreement:', error);
      message.error(error?.response?.data?.error || '翻译保存失败');
    } finally {
      setAgreementSaving(false);
    }
  };

  const renderAgreementTab = () => {
    const translationCollapseItems = AGREEMENT_LANGUAGES.map(({ code, label }) => {
      const existingSetting = settings.find((s) => s.key === `user_agreement_${code}`);
      const displayText =
        (agreementTranslations && agreementTranslations[code] !== undefined)
          ? unwrapJsonString(agreementTranslations[code])
          : (existingSetting?.value ? unwrapJsonString(existingSetting.value) : '');

      return {
        key: code,
        label: (
          <span>
            <Tag color="blue" style={{ marginRight: 6 }}>{code.toUpperCase()}</Tag>
            {label}
            {displayText && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>({displayText.slice(0, PREVIEW_TEXT_LENGTH)}{displayText.length > PREVIEW_TEXT_LENGTH ? '…' : ''})</Text>}
          </span>
        ),
        children: displayText
          ? <div style={{ whiteSpace: 'pre-wrap', padding: '8px 0', color: '#333' }}>{displayText}</div>
          : <Text type="secondary">暂无内容</Text>,
      };
    });

    return (
      <Card title="用户协议管理" style={{ marginBottom: 16 }}>
        <Form.Item label="协议原文">
          <TextArea
            rows={6}
            placeholder="请输入用户协议内容（建议用中文或英文输入，系统将自动翻译为多种语言）"
            value={agreementText}
            onChange={(e) => setAgreementText(e.target.value)}
          />
          <Space style={{ marginTop: 8 }}>
            <Button
              type="primary"
              icon={<TranslationOutlined />}
              loading={agreementSaving}
              onClick={handleAgreementTranslateAndSave}
              disabled={!agreementText.trim()}
            >
              翻译并保存（{AGREEMENT_LANGUAGES.length} 种语言）
            </Button>
          </Space>
        </Form.Item>

        {(agreementTranslations || settings.some(s => s.key.startsWith('user_agreement_'))) && (
          <>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>🌐 各语言翻译预览</div>
            <Collapse
              size="small"
              items={translationCollapseItems}
            />
          </>
        )}
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
    {
      key: 'user_agreement',
      label: '用户协议',
      children: renderAgreementTab(),
    },
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
        <Form layout="vertical">
          <Tabs items={tabItems} />
        </Form>
      </Spin>
    </div>
  );
};

export default SystemSettings;

