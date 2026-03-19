import React, { useState } from 'react';
import { Button, Collapse, Typography, Space, Spin, message } from 'antd';
import { TranslationOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;

const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
  { code: 'ja', label: '日本語' },
];

interface TranslateButtonProps {
  text: string;
  onTranslated: (translations: Record<string, string>) => void;
}

export const TranslateButton: React.FC<TranslateButtonProps> = ({ text, onTranslated }) => {
  const [loading, setLoading] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string> | null>(null);

  const handleTranslate = async () => {
    if (!text?.trim()) {
      message.warning('请先输入需要翻译的内容');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/admin/translate',
        { text, languages: SUPPORTED_LANGUAGES.map((l) => l.code) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const result: Record<string, string> = response.data.translations || {};
      setTranslations(result);
    } catch (error: any) {
      console.error('Translation error:', error);
      message.error(error.response?.data?.error || '翻译失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const collapseItems = translations
    ? SUPPORTED_LANGUAGES.filter((l) => translations[l.code]).map((l) => ({
        key: l.code,
        label: (
          <Space>
            <Text strong>{l.label}</Text>
            <Button
              size="small"
              type="link"
              onClick={(e) => {
                e.stopPropagation();
                onTranslated({ [l.code]: translations[l.code] });
                message.success(`已使用 ${l.label} 翻译覆盖内容`);
              }}
            >
              使用此翻译
            </Button>
          </Space>
        ),
        children: <Text style={{ whiteSpace: 'pre-wrap' }}>{translations[l.code]}</Text>,
      }))
    : [];

  return (
    <div style={{ marginTop: 8 }}>
      <Spin spinning={loading}>
        <Button
          icon={<TranslationOutlined />}
          onClick={handleTranslate}
          disabled={loading}
          size="small"
        >
          自动翻译
        </Button>
      </Spin>
      {translations && collapseItems.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Collapse
            size="small"
            items={collapseItems}
            style={{ background: '#fafafa' }}
          />
          <Button
            size="small"
            style={{ marginTop: 8 }}
            onClick={() => {
              onTranslated(translations);
              message.success('已应用所有翻译结果');
            }}
          >
            使用全部翻译
          </Button>
        </div>
      )}
    </div>
  );
};

export default TranslateButton;
