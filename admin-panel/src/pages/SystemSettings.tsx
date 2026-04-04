import React, { useState, useEffect, useRef } from 'react';
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
  List,
  Radio,
  Upload,
  InputNumber,
} from 'antd';
import {
  ReloadOutlined,
  TranslationOutlined,
  SearchOutlined,
  QrcodeOutlined,
  UploadOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
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

  // QR code (old simple tool) state
  const [qrInput, setQrInput] = useState('');
  const [qrUrl, setQrUrl] = useState('');

  // User payment QR code generator state
  const [qrSearchInput, setQrSearchInput] = useState('');
  const [qrSearchResults, setQrSearchResults] = useState<any[] | null>(null);
  const [qrSearchLoading, setQrSearchLoading] = useState(false);
  const [qrSelectedUser, setQrSelectedUser] = useState<any | null>(null);
  const [qrLogoFile, setQrLogoFile] = useState<File | null>(null);
  const [qrLogoPreview, setQrLogoPreview] = useState('');
  const [qrImageDataUrl, setQrImageDataUrl] = useState('');
  const [qrContent, setQrContent] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState('');
  const [qrGenerating, setQrGenerating] = useState(false);
  const [qrExpiresMonths, setQrExpiresMonths] = useState(1);
  const [qrStyle, setQrStyle] = useState<'standard' | 'dark' | 'gradient'>('standard');
  const [qrErrorLevel, setQrErrorLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');

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

  const QR_STYLES = {
    standard: { dark: '#000000', light: '#FFFFFF' },
    dark:     { dark: '#F0B90B', light: '#1a1a2e' },
    gradient: { dark: '#6366f1', light: '#FFFFFF' },
  };

  const handleQrUserSearch = async () => {
    if (!qrSearchInput.trim()) return;
    setQrSearchLoading(true);
    try {
      const res = await apiClient.getUsers({ search: qrSearchInput.trim(), limit: 5 });
      setQrSearchResults(res.users || []);
      if ((res.users || []).length === 0) message.info('未找到用户');
    } catch {
      message.error('搜索失败');
    } finally {
      setQrSearchLoading(false);
    }
  };

  const handleGenerateUserQR = async () => {
    if (!qrSelectedUser) { message.warning('请先选择用户'); return; }
    setQrGenerating(true);
    try {
      const result = await apiClient.generateUserQRCode({
        user_id: qrSelectedUser.id,
        expires_months: qrExpiresMonths,
      });
      setQrContent(result.content);
      setQrExpiresAt(result.expires_at);

      const styleConfig = QR_STYLES[qrStyle];
      const canvas = document.createElement('canvas');
      const QRCode = (await import('qrcode')).default;
      await QRCode.toCanvas(canvas, result.content, {
        width: 512,
        errorCorrectionLevel: qrErrorLevel,
        color: { dark: styleConfig.dark, light: styleConfig.light },
        margin: 2,
      });

      if (qrLogoFile && qrLogoPreview) {
        const ctx = canvas.getContext('2d')!;
        const img = new Image();
        img.src = qrLogoPreview;
        await new Promise(resolve => { img.onload = resolve; });
        const logoSize = canvas.width * 0.22;
        const x = (canvas.width - logoSize) / 2;
        const y = (canvas.height - logoSize) / 2;
        ctx.fillStyle = styleConfig.light;
        ctx.beginPath();
        // 6px padding around logo, 10px border radius for the background box
        ctx.roundRect(x - 6, y - 6, logoSize + 12, logoSize + 12, 10);
        ctx.fill();
        ctx.drawImage(img, x, y, logoSize, logoSize);
      }

      setQrImageDataUrl(canvas.toDataURL('image/png'));
      message.success('收款码生成成功');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '生成失败');
    } finally {
      setQrGenerating(false);
    }
  };

  const handleDownloadUserQR = (size: number) => {
    if (!qrImageDataUrl) return;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `enkpay_qr_${qrSelectedUser?.id || 'user'}_${size}px.png`;
      a.click();
    };
    img.src = qrImageDataUrl;
  };

  const qrCodeTab = (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Step 1: Search & Select User */}
      <Card title="第一步：选择用户">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={qrSearchInput}
              onChange={(e) => setQrSearchInput(e.target.value)}
              placeholder="输入用户名、姓名或 ID 搜索..."
              onPressEnter={handleQrUserSearch}
            />
            <Button
              icon={<SearchOutlined />}
              loading={qrSearchLoading}
              onClick={handleQrUserSearch}
            >
              搜索
            </Button>
          </Space.Compact>

          {qrSearchResults !== null && qrSearchResults.length > 0 && (
            <List
              size="small"
              bordered
              dataSource={qrSearchResults}
              renderItem={(user: any) => (
                <List.Item
                  style={{ cursor: 'pointer', background: qrSelectedUser?.id === user.id ? '#e6f4ff' : undefined }}
                  onClick={() => { setQrSelectedUser(user); setQrSearchResults(null); }}
                >
                  <Space>
                    <Tag color="blue">{user.unique_id || user.id}</Tag>
                    <span>{user.first_name || user.username || '—'}</span>
                    {user.username && <Text type="secondary">@{user.username}</Text>}
                  </Space>
                </List.Item>
              )}
            />
          )}

          {qrSelectedUser && (
            <Card size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}>
              <Space>
                <Tag color="green">已选用户</Tag>
                <Tag color="blue">{qrSelectedUser.unique_id || qrSelectedUser.id}</Tag>
                <span>{qrSelectedUser.first_name || qrSelectedUser.username || '—'}</span>
                {qrSelectedUser.username && <Text type="secondary">@{qrSelectedUser.username}</Text>}
                <Button size="small" type="link" danger onClick={() => setQrSelectedUser(null)}>取消选择</Button>
              </Space>
            </Card>
          )}
        </Space>
      </Card>

      {/* Step 2: Style Settings */}
      <Card title="第二步：样式设置">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Form layout="inline">
            <Form.Item label="有效期（月）">
              <InputNumber
                min={1}
                max={24}
                value={qrExpiresMonths}
                onChange={(v) => setQrExpiresMonths(v || 1)}
              />
            </Form.Item>
            <Form.Item label="样式">
              <Radio.Group value={qrStyle} onChange={(e) => setQrStyle(e.target.value)}>
                <Radio.Button value="standard">标准</Radio.Button>
                <Radio.Button value="dark">深色</Radio.Button>
                <Radio.Button value="gradient">蓝紫</Radio.Button>
              </Radio.Group>
            </Form.Item>
            <Form.Item label="纠错级别">
              <Radio.Group value={qrErrorLevel} onChange={(e) => setQrErrorLevel(e.target.value)}>
                <Radio.Button value="L">L</Radio.Button>
                <Radio.Button value="M">M</Radio.Button>
                <Radio.Button value="Q">Q</Radio.Button>
                <Radio.Button value="H">H</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Form>
          <Form.Item label="Logo（可选）" style={{ marginBottom: 0 }}>
            <Upload
              accept="image/*"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => {
                setQrLogoFile(file);
                const reader = new FileReader();
                reader.onload = (e) => setQrLogoPreview(e.target?.result as string);
                reader.readAsDataURL(file);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>上传 Logo</Button>
            </Upload>
            {qrLogoPreview && (
              <Space style={{ marginLeft: 12 }}>
                <img src={qrLogoPreview} alt="logo" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 4 }} />
                <Button size="small" danger onClick={() => { setQrLogoFile(null); setQrLogoPreview(''); }}>移除</Button>
              </Space>
            )}
          </Form.Item>
          <Button
            type="primary"
            icon={<QrcodeOutlined />}
            loading={qrGenerating}
            disabled={!qrSelectedUser}
            onClick={handleGenerateUserQR}
            size="large"
          >
            生成收款码
          </Button>
        </Space>
      </Card>

      {/* Step 3: Preview */}
      {qrImageDataUrl && (
        <Card title="第三步：预览与下载">
          <Space direction="vertical" align="center" style={{ width: '100%' }}>
            <img src={qrImageDataUrl} alt="Payment QR Code" width={256} height={256} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
            {qrSelectedUser && (
              <Space>
                <Tag color="blue">收款方：{qrSelectedUser.first_name || qrSelectedUser.username || qrSelectedUser.id}</Tag>
                <Tag>ID: {qrSelectedUser.unique_id || qrSelectedUser.id}</Tag>
              </Space>
            )}
            {qrExpiresAt && (
              <Text type="secondary">有效期至：{new Date(qrExpiresAt).toLocaleDateString('zh-CN')}</Text>
            )}
            {qrContent && (
              <Input.TextArea
                value={qrContent}
                readOnly
                rows={2}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
                onClick={(e) => {
                  (e.target as HTMLTextAreaElement).select();
                  navigator.clipboard?.writeText(qrContent).then(() => message.success('已复制'));
                }}
              />
            )}
            <Space>
              <Button icon={<DownloadOutlined />} onClick={() => handleDownloadUserQR(256)}>
                下载 256px
              </Button>
              <Button icon={<DownloadOutlined />} type="primary" onClick={() => handleDownloadUserQR(512)}>
                下载 512px
              </Button>
            </Space>
          </Space>
        </Card>
      )}
    </Space>
  );

  const tabItems = [
    {
      key: 'user_agreement',
      label: '用户协议',
      children: renderAgreementTab(),
    },
    {
      key: 'qrcode',
      label: '用户收款码',
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

