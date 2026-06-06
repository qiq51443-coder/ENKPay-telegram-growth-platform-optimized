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
  Switch,
  Divider,
  Alert,
  DatePicker,
} from 'antd';
import {
  ReloadOutlined,
  TranslationOutlined,
  SearchOutlined,
  QrcodeOutlined,
  UploadOutlined,
  DownloadOutlined,
  GlobalOutlined,
  LinkOutlined,
  PictureOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { apiClient } from '../services/api';
import dayjs, { Dayjs } from 'dayjs';
import AnimatedEmojiPanel from '../components/AnimatedEmojiPanel';

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

const LANG_CONFIG = [
  { code: 'zh', label: '中文',     flag: '🇨🇳', dir: 'ltr' as const },
  { code: 'en', label: 'English',  flag: '🇬🇧', dir: 'ltr' as const },
  { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' as const },
  { code: 'de', label: 'Deutsch',  flag: '🇩🇪', dir: 'ltr' as const },
  { code: 'es', label: 'Español',  flag: '🇪🇸', dir: 'ltr' as const },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl' as const },
  { code: 'ja', label: '日本語',   flag: '🇯🇵', dir: 'ltr' as const },
];

const SOCIAL_CONFIG = [
  { key: 'facebook',  label: 'Facebook',       icon: '📘', placeholder: 'https://facebook.com/yourpage' },
  { key: 'tiktok',    label: 'TikTok',          icon: '🎵', placeholder: 'https://tiktok.com/@youraccount' },
  { key: 'twitter',   label: 'X / Twitter',     icon: '🐦', placeholder: 'https://x.com/youraccount' },
  { key: 'telegram',  label: 'Telegram 官方频道',   icon: '✈️', placeholder: 'https://t.me/yourchannel 或 yourchannel' },
  { key: 'youtube',   label: 'YouTube',         icon: '▶️', placeholder: 'https://youtube.com/@yourchannel' },
  { key: 'instagram', label: 'Instagram',       icon: '📷', placeholder: 'https://instagram.com/youraccount' },
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

type MiniAppBgRotation = 'manual' | 'weekly' | 'monthly';
type MiniAppBgKey = 'trading' | 'auction' | 'period' | 'charity' | 'profile';

interface MiniAppBgGroup {
  id: string;
  name: string;
  trading: string;
  auction: string;
  period: string;
  charity: string;
  profile: string;
}

const MINIAPP_BG_FIELDS: Array<{ key: MiniAppBgKey; label: string }> = [
  { key: 'trading', label: '即时交易' },
  { key: 'auction', label: '夺宝' },
  { key: 'period', label: '定期' },
  { key: 'charity', label: '公益项目' },
  { key: 'profile', label: '个人中心' },
];

/** Maximum characters shown in the Collapse panel header preview */
const PREVIEW_TEXT_LENGTH = 30;

interface BotMessageEmojiConfig {
  header_enabled: boolean;
  header_emoji_id: string;
  header_emoji_fallback: string;
  header_text: string;
  emoji_success: string;
  emoji_reject: string;
  emoji_pending: string;
  emoji_warning: string;
  field_order_id: string;
  field_network: string;
  field_amount: string;
  field_address: string;
  field_time: string;
  field_fee: string;
  field_balance: string;
  field_wallet_title: string;
  field_id: string;
  field_nft: string;
  field_redpacket: string;
  field_account_status: string;
  field_txhash: string;
  field_deposit: string;
  field_withdraw: string;
  field_transfer_send: string;
  field_transfer_recv: string;
  field_min: string;
  notify_gift: string;
  notify_people: string;
  notify_sparkles: string;
  notify_alarm: string;
  notify_pin: string;
  notify_clock: string;
  notify_memo: string;
  notify_number: string;
  notify_target: string;
  notify_speech: string;
}

const DEFAULT_BOT_MESSAGE_EMOJI_CONFIG: BotMessageEmojiConfig = {
  header_enabled: false,
  header_emoji_id: '',
  header_emoji_fallback: '💎',
  header_text: 'ENKPAY',
  emoji_success: '✅',
  emoji_reject: '❌',
  emoji_pending: '⏳',
  emoji_warning: '⚠️',
  field_order_id: '📋',
  field_network: '🌐',
  field_amount: '💰',
  field_address: '📍',
  field_time: '🕐',
  field_fee: '💸',
  field_balance: '💳',
  field_wallet_title: '💰',
  field_id: '🆔',
  field_nft: '💎',
  field_redpacket: '🧧',
  field_account_status: '📊',
  field_txhash: '🔗',
  field_deposit: '📥',
  field_withdraw: '📤',
  field_transfer_send: '📤',
  field_transfer_recv: '💰',
  field_min: '💡',
  notify_gift: '🎁',
  notify_people: '👥',
  notify_sparkles: '✨',
  notify_alarm: '⏰',
  notify_pin: '📌',
  notify_clock: '🕙',
  notify_memo: '📝',
  notify_number: '🔢',
  notify_target: '🎯',
  notify_speech: '💬',
};

const FIELD_EMOJI_ITEMS: Array<{ key: keyof BotMessageEmojiConfig; label: string }> = [
  { key: 'field_order_id', label: '订单号' },
  { key: 'field_network', label: '网络' },
  { key: 'field_amount', label: '金额' },
  { key: 'field_address', label: '地址' },
  { key: 'field_time', label: '时间' },
  { key: 'field_fee', label: '手续费' },
  { key: 'field_balance', label: '余额' },
  { key: 'field_wallet_title', label: '钱包标题' },
  { key: 'field_id', label: '钱包ID' },
  { key: 'field_nft', label: 'NFT' },
  { key: 'field_redpacket', label: '红包余额' },
  { key: 'field_account_status', label: '账户状态' },
  { key: 'field_txhash', label: '交易哈希' },
  { key: 'field_deposit', label: '充值标题' },
  { key: 'field_withdraw', label: '提现标题' },
  { key: 'field_transfer_send', label: '转账发送' },
  { key: 'field_transfer_recv', label: '转账收到' },
  { key: 'field_min', label: '最小金额' },
];

const NOTIFICATION_EMOJI_SECTIONS: Array<{
  title: string;
  items: Array<{ key: keyof BotMessageEmojiConfig; label: string }>;
}> = [
  {
    title: '红包消息',
    items: [
      { key: 'notify_people', label: '👥 数量' },
      { key: 'notify_alarm', label: '⏰ 有效期' },
      { key: 'notify_sparkles', label: '✨ 领取引导' },
    ],
  },
  {
    title: '领取红包通知',
    items: [{ key: 'notify_gift', label: '🎁 标题' }],
  },
  {
    title: '收益结算通知',
    items: [{ key: 'notify_clock', label: '🕙 结算时间' }],
  },
  {
    title: '收益结算 / 本金返还通知',
    items: [{ key: 'notify_pin', label: '📌 来源/标注' }],
  },
  {
    title: '本金返还通知',
    items: [{ key: 'notify_memo', label: '📝 说明' }],
  },
  {
    title: '交易策略信号',
    items: [
      { key: 'notify_number', label: '🔢 期号' },
      { key: 'notify_target', label: '🎯 概率' },
      { key: 'notify_speech', label: '💬 自定义文案' },
    ],
  },
];

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
  // 文案设置
  const [qrPlatformName, setQrPlatformName] = useState('ENKPay');
  const [qrPlatformFontSize, setQrPlatformFontSize] = useState(22);
  const [qrPlatformColor, setQrPlatformColor] = useState('#1a1a2e');
  const [qrSubtitleText, setQrSubtitleText] = useState('');
  const [qrSubtitleEdited, setQrSubtitleEdited] = useState(false);
  const [qrSubtitleFontSize, setQrSubtitleFontSize] = useState(16);
  const [qrSubtitleColor, setQrSubtitleColor] = useState('#595959');

  // ── 网页管理 Tab 状态 ──────────────────────────────────────────────────
  const [activeMainTab, setActiveMainTab]       = useState('user_agreement');
  const [landingLoaded, setLandingLoaded]       = useState(false);

  // 品牌
  const [brandName, setBrandName]               = useState('ENKPay');
  const [logoUrl, setLogoUrl]                   = useState('');
  const [logoUploading, setLogoUploading]       = useState(false);
  const [brandSaving, setBrandSaving]           = useState(false);
  const [slogans, setSlogans]                   = useState<Record<string, string>>(
    { zh: '', en: '', fr: '', de: '', es: '', ar: '', ja: '' }
  );
  const [statsOverride, setStatsOverride]       = useState(
    { users: 0, nftProducts: 0, charityTotal: 0, countries: 30 }
  );

  // 社交
  const [socialLinks, setSocialLinks]           = useState<Record<string, string>>(
    { facebook: '', tiktok: '', twitter: '', telegram: '', youtube: '', instagram: '' }
  );
  const [contactTelegram, setContactTelegram]   = useState('');
  const [socialSaving, setSocialSaving]         = useState(false);

  // 法律文件
  const [privacyText, setPrivacyText]           = useState('');
  const [privacyTranslations, setPrivacyTranslations] = useState<Record<string, string> | null>(null);
  const [privacySaving, setPrivacySaving]       = useState(false);
  const [termsText, setTermsText]               = useState('');
  const [termsTranslations, setTermsTranslations] = useState<Record<string, string> | null>(null);
  const [termsSaving, setTermsSaving]           = useState(false);

  // 预览
  const [previewData, setPreviewData]           = useState<any>(null);
  const [previewLoading, setPreviewLoading]     = useState(false);

  // ── 邀请设置 Tab 状态 ──────────────────────────────────────────────────
  const [inviteCardUrl, setInviteCardUrl]               = useState('');
  const [inviteCardUploading, setInviteCardUploading]   = useState(false);
  const [inviteMessageText, setInviteMessageText]       = useState('');
  const [inviteMessageTranslations, setInviteMessageTranslations] = useState<Record<string, string> | null>(null);
  const [inviteMessageSaving, setInviteMessageSaving]   = useState(false);
  const [inviteRewardEnabled, setInviteRewardEnabled]   = useState(true);
  const [inviteRewardAmount, setInviteRewardAmount]     = useState<number>(2.00);
  const [inviteRewardSaving, setInviteRewardSaving]     = useState(false);
  const [miniAppBgGroups, setMiniAppBgGroups]           = useState<MiniAppBgGroup[]>([]);
  const [miniAppBgRotation, setMiniAppBgRotation]       = useState<MiniAppBgRotation>('manual');
  const [miniAppBgCurrentGroupId, setMiniAppBgCurrentGroupId] = useState<string | null>(null);
  const [miniAppBgRotationStart, setMiniAppBgRotationStart] = useState<Dayjs | null>(null);
  const [miniAppBgLoaded, setMiniAppBgLoaded]           = useState(false);
  const [miniAppBgLoading, setMiniAppBgLoading]         = useState(false);
  const [miniAppBgSaving, setMiniAppBgSaving]           = useState(false);
  const [miniAppBgUploadingMap, setMiniAppBgUploadingMap] = useState<Record<string, boolean>>({});
  const [botEmojiConfig, setBotEmojiConfig] = useState<BotMessageEmojiConfig>(DEFAULT_BOT_MESSAGE_EMOJI_CONFIG);
  const [botEmojiSaving, setBotEmojiSaving] = useState(false);

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

      // Pre-fill invite settings
      const inviteCard = settingsData.find((s: SystemSetting) => s.key === 'invite_card_image');
      if (inviteCard?.value) setInviteCardUrl(unwrapJsonString(inviteCard.value));

      const inviteMsg = settingsData.find((s: SystemSetting) => s.key === 'invite_message_zh');
      if (inviteMsg?.value && !inviteMessageText) setInviteMessageText(unwrapJsonString(inviteMsg.value));

      const inviteEnabled = settingsData.find((s: SystemSetting) => s.key === 'invite_reward_enabled');
      if (inviteEnabled?.value !== undefined) {
        const parsed = unwrapJsonString(inviteEnabled.value);
        setInviteRewardEnabled(parsed !== 'false');
      }

      const inviteAmount = settingsData.find((s: SystemSetting) => s.key === 'invite_reward_amount');
      if (inviteAmount?.value !== undefined) {
        const parsed = parseFloat(unwrapJsonString(inviteAmount.value));
        if (!isNaN(parsed)) setInviteRewardAmount(parsed);
      }

      const botEmojiSetting = settingsData.find((s: SystemSetting) => s.key === 'bot_message_emoji_config');
      if (botEmojiSetting?.value !== undefined) {
        let parsed: any = botEmojiSetting.value;
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed); } catch { parsed = null; }
        }
        if (parsed && typeof parsed === 'object') {
          setBotEmojiConfig({
            ...DEFAULT_BOT_MESSAGE_EMOJI_CONFIG,
            ...parsed,
            header_enabled: Boolean(parsed.header_enabled),
          });
        }
      } else {
        setBotEmojiConfig(DEFAULT_BOT_MESSAGE_EMOJI_CONFIG);
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

  const fetchLandingConfig = async () => {
    if (landingLoaded) return;
    try {
      const data = await apiClient.getLandingConfig();
      if (data.brand?.name)     setBrandName(data.brand.name);
      if (data.brand?.logoUrl)  setLogoUrl(data.brand.logoUrl);
      if (data.slogans)         setSlogans(s => ({ ...s, ...data.slogans }));
      if (data.statsOverride)   setStatsOverride(data.statsOverride);
      if (data.socialLinks)     setSocialLinks(s => ({ ...s, ...data.socialLinks }));
      if (data.contact?.telegram) setContactTelegram(data.contact.telegram);
      if (data.legal?.privacy?.zh) { setPrivacyText(data.legal.privacy.zh); setPrivacyTranslations(data.legal.privacy); }
      if (data.legal?.terms?.zh)   { setTermsText(data.legal.terms.zh);   setTermsTranslations(data.legal.terms); }
      setLandingLoaded(true);
    } catch (e) { console.error('[landing] fetchLandingConfig error:', e); /* 静默，不影响其他 Tab */ }
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const result = await apiClient.uploadLandingLogo(file);
      setLogoUrl(result.logoUrl);
      message.success('Logo 上传成功');
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Logo 上传失败');
    } finally { setLogoUploading(false); }
    return false;
  };

  const handleSaveBrand = async () => {
    setBrandSaving(true);
    try {
      await apiClient.saveLandingBrand({ brandName, slogans, statsOverride });
      message.success('品牌设置保存成功');
    } catch (e: any) {
      message.error(e?.response?.data?.error || '保存失败');
    } finally { setBrandSaving(false); }
  };

  const handleSaveSocial = async () => {
    setSocialSaving(true);
    try {
      await apiClient.saveLandingSocial({ socialLinks, contactTelegram });
      message.success('社交设置保存成功');
    } catch (e: any) {
      message.error(e?.response?.data?.error || '保存失败');
    } finally { setSocialSaving(false); }
  };

  const handleSavePrivacy = async () => {
    if (!privacyText.trim()) { message.warning('请先输入隐私政策内容'); return; }
    setPrivacySaving(true);
    try {
      const result = await apiClient.translateAndSavePrivacy(privacyText);
      setPrivacyTranslations(result.translations);
      message.success('隐私政策已翻译并保存 7 种语言');
    } catch (e: any) {
      message.error(e?.response?.data?.error || '保存失败');
    } finally { setPrivacySaving(false); }
  };

  const handleSaveTerms = async () => {
    if (!termsText.trim()) { message.warning('请先输入服务条款内容'); return; }
    setTermsSaving(true);
    try {
      const result = await apiClient.translateAndSaveTerms(termsText);
      setTermsTranslations(result.translations);
      message.success('服务条款已翻译并保存 7 种语言');
    } catch (e: any) {
      message.error(e?.response?.data?.error || '保存失败');
    } finally { setTermsSaving(false); }
  };

  const handleBotEmojiFieldChange = (key: keyof BotMessageEmojiConfig, value: string | boolean) => {
    setBotEmojiConfig((prev) => ({ ...prev, [key]: value } as BotMessageEmojiConfig));
  };

  const handleBotEmojiInsert = (key: keyof BotMessageEmojiConfig, tag: string) => {
    setBotEmojiConfig((prev) => ({ ...prev, [key]: String((prev as any)[key] || '') + tag } as BotMessageEmojiConfig));
  };

  const handleSaveBotEmojiConfig = async () => {
    setBotEmojiSaving(true);
    try {
      await apiClient.updateSystemSetting('bot_message_emoji_config', {
        value: botEmojiConfig,
        category: 'bot',
        description: 'Global bot message emoji and header style config',
      });
      message.success('Bot 消息样式保存成功');
      await fetchSettings();
    } catch (e: any) {
      message.error(e?.response?.data?.error || '保存失败');
    } finally {
      setBotEmojiSaving(false);
    }
  };

  const fetchPreviewData = async () => {
    setPreviewLoading(true);
    try {
      const data = await apiClient.getLandingConfig();
      setPreviewData(data);
    } catch (e: any) { message.error(e?.message || '加载预览失败'); }
    finally { setPreviewLoading(false); }
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

  const renderLandingTab = () => {
    // ── 子 Tab A：品牌设置 ───────────────────────────────────────────────
    const brandTab = (
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Card title="🎨 品牌标识">
          <Form layout="vertical">
            <Form.Item label="品牌名称">
              <Input value={brandName} onChange={e => setBrandName(e.target.value)}
                placeholder="ENKPay" style={{ maxWidth: 300 }} />
            </Form.Item>
            <Form.Item label="官网 Logo">
              <Space align="start">
                <div style={{
                  width: 80, height: 80, borderRadius: 12, border: '2px dashed #d9d9d9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', background: '#fafafa', flexShrink: 0,
                }}>
                  {logoUrl
                    ? <img src={logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <PictureOutlined style={{ fontSize: 28, color: '#bfbfbf' }} />}
                </div>
                <div>
                  <Upload accept=".png,.jpg,.jpeg,.svg,.webp,.gif" maxCount={1} showUploadList={false}
                    beforeUpload={handleLogoUpload}>
                    <Button icon={<UploadOutlined />} loading={logoUploading}>
                      {logoUploading ? '上传中...' : '上传新 Logo'}
                    </Button>
                  </Upload>
                  <div style={{ marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>
                    支持 PNG / SVG / WebP / GIF，建议 512×512px，最大 2MB
                  </div>
                  {logoUrl && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#52c41a' }}>
                      <CheckCircleOutlined /> 已上传
                    </div>
                  )}
                </div>
              </Space>
            </Form.Item>
          </Form>
        </Card>

        <Card title="💬 各语言 Slogan">
          <Form layout="vertical">
            {LANG_CONFIG.map(lang => (
              <Form.Item key={lang.code} label={<span>{lang.flag} {lang.label}</span>} style={{ marginBottom: 10 }}>
                <Input
                  value={slogans[lang.code] || ''}
                  onChange={e => setSlogans(prev => ({ ...prev, [lang.code]: e.target.value }))}
                  placeholder={`${lang.label} Slogan`}
                  dir={lang.dir}
                  style={{ textAlign: lang.dir === 'rtl' ? 'right' : 'left' }}
                />
              </Form.Item>
            ))}
          </Form>
        </Card>

        <Card title="📊 统计数字显示（填 0 = 自动读取数据库）">
          <Space wrap size={16}>
            {[
              { label: '👥 用户数',       field: 'users' as const },
              { label: '🎨 NFT 产品',     field: 'nftProducts' as const },
              { label: '❤️ 公益总额 USDT', field: 'charityTotal' as const },
              { label: '🌍 覆盖国家',     field: 'countries' as const },
            ].map(({ label, field }) => (
              <Form.Item key={field} label={label} style={{ marginBottom: 0 }}>
                <InputNumber
                  min={0} value={statsOverride[field]}
                  onChange={v => setStatsOverride(prev => ({ ...prev, [field]: v || 0 }))}
                  style={{ width: 140 }}
                />
              </Form.Item>
            ))}
          </Space>
        </Card>

        <Button type="primary" icon={<SaveOutlined />} loading={brandSaving}
          onClick={handleSaveBrand} size="large">
          💾 保存品牌设置
        </Button>
      </Space>
    );

    // ── 子 Tab B：社交 & 联系 ─────────────────────────────────────────────
    const socialTab = (
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Card title="📱 社交媒体链接">
          <Alert message="留空的平台不会在官网显示" type="info" showIcon style={{ marginBottom: 16 }} />
          <Form layout="vertical">
            {SOCIAL_CONFIG.map(s => (
              <Form.Item key={s.key} label={<span>{s.icon} {s.label}</span>} style={{ marginBottom: 10 }}>
                <Input
                  value={socialLinks[s.key] || ''}
                  onChange={e => setSocialLinks(prev => ({ ...prev, [s.key]: e.target.value }))}
                  placeholder={s.placeholder}
                  prefix={<LinkOutlined style={{ color: '#bfbfbf' }} />}
                />
              </Form.Item>
            ))}
          </Form>
        </Card>

        <Card title="✈️ 联系我们">
          <Alert
            message="仅支持 Telegram 用户名，官网页脚点击后跳转到对应 Telegram"
            type="info" showIcon style={{ marginBottom: 16 }}
          />
          <Form layout="vertical">
            <Form.Item label="Telegram 用户名（不含 @）">
              <Input
                value={contactTelegram}
                onChange={e => setContactTelegram(e.target.value.replace(/^@/, ''))}
                placeholder="enkpay_support"
                prefix={<Text type="secondary">@</Text>}
                style={{ maxWidth: 300 }}
              />
            </Form.Item>
          </Form>
        </Card>

        <Button type="primary" icon={<SaveOutlined />} loading={socialSaving}
          onClick={handleSaveSocial} size="large">
          💾 保存社交设置
        </Button>
      </Space>
    );

    // ── 子 Tab C：隐私 & 条款 ─────────────────────────────────────────────
    const legalTab = (
      <Space direction="vertical" style={{ width: '100%' }} size={24}>
        <Card title="🔒 隐私政策">
          <Form.Item label="原文（中文或英文，系统自动翻译为 7 种语言）">
            <Input.TextArea rows={5} value={privacyText}
              onChange={e => setPrivacyText(e.target.value)} placeholder="请输入隐私政策内容..." />
            <Button type="primary" icon={<TranslationOutlined />} loading={privacySaving}
              onClick={handleSavePrivacy} disabled={!privacyText.trim()} style={{ marginTop: 8 }}>
              🌐 翻译并保存（7 种语言）
            </Button>
          </Form.Item>
          {privacyTranslations && (
            <>
              <Divider>各语言预览</Divider>
              <Collapse size="small" items={LANG_CONFIG.map(lang => ({
                key: lang.code,
                label: <span><Tag color="blue">{lang.code.toUpperCase()}</Tag>{lang.flag} {lang.label}
                  {privacyTranslations[lang.code] &&
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      ({privacyTranslations[lang.code].slice(0, 30)}{privacyTranslations[lang.code].length > 30 ? '…' : ''})
                    </Text>}
                </span>,
                children: privacyTranslations[lang.code]
                  ? <div style={{ whiteSpace: 'pre-wrap' }}>{privacyTranslations[lang.code]}</div>
                  : <Text type="secondary">暂无内容</Text>,
              }))} />
            </>
          )}
        </Card>

        <Card title="📋 服务条款">
          <Form.Item label="原文（中文或英文，系统自动翻译为 7 种语言）">
            <Input.TextArea rows={5} value={termsText}
              onChange={e => setTermsText(e.target.value)} placeholder="请输入服务条款内容..." />
            <Button type="primary" icon={<TranslationOutlined />} loading={termsSaving}
              onClick={handleSaveTerms} disabled={!termsText.trim()} style={{ marginTop: 8 }}>
              🌐 翻译并保存（7 种语言）
            </Button>
          </Form.Item>
          {termsTranslations && (
            <>
              <Divider>各语言预览</Divider>
              <Collapse size="small" items={LANG_CONFIG.map(lang => ({
                key: lang.code,
                label: <span><Tag color="green">{lang.code.toUpperCase()}</Tag>{lang.flag} {lang.label}
                  {termsTranslations[lang.code] &&
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      ({termsTranslations[lang.code].slice(0, 30)}{termsTranslations[lang.code].length > 30 ? '…' : ''})
                    </Text>}
                </span>,
                children: termsTranslations[lang.code]
                  ? <div style={{ whiteSpace: 'pre-wrap' }}>{termsTranslations[lang.code]}</div>
                  : <Text type="secondary">暂无内容</Text>,
              }))} />
            </>
          )}
        </Card>
      </Space>
    );

    // ── 子 Tab D：数据预览 ────────────────────────────────────────────────
    const previewTab = (
      <Spin spinning={previewLoading}>
        <Card
          title="📊 当前官网数据状态"
          extra={<Button icon={<ReloadOutlined />} size="small" onClick={fetchPreviewData}>刷新</Button>}
        >
          {previewData ? (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div><Tag color="purple">品牌</Tag>
                名称：<strong>{previewData.brand?.name || '—'}</strong>
                <span style={{ marginLeft: 16 }}>Logo：{previewData.brand?.logoUrl
                  ? <Tag color="green"><CheckCircleOutlined /> 已上传</Tag>
                  : <Tag color="red"><ExclamationCircleOutlined /> 未上传</Tag>}
                </span>
              </div>
              <div><Tag color="blue">实时统计</Tag>
                👥 {(previewData.stats?.users || 0).toLocaleString()} 用户 ·
                🎨 {previewData.stats?.nftProducts || 0} NFT ·
                ❤️ ${(previewData.stats?.charityTotal || 0).toLocaleString()} ·
                🌍 {previewData.stats?.countries || 0} 国家
              </div>
              <div><Tag color="cyan">展示内容</Tag>
                NFT {previewData.nftProducts?.length || 0} 个 · 公益 {previewData.charityProjects?.length || 0} 个
              </div>
              <div><Tag color="orange">社交媒体</Tag>
                {Object.entries(previewData.socialLinks || {}).filter(([, v]) => v)
                  .map(([k]) => <Tag key={k}>{k}</Tag>)}
                {Object.values(previewData.socialLinks || {}).filter(Boolean).length === 0 &&
                  <Text type="secondary">未配置</Text>}
              </div>
              <div><Tag color="geekblue">联系</Tag>
                {previewData.contact?.telegram
                  ? <><CheckCircleOutlined style={{ color: '#52c41a' }} /> @{previewData.contact.telegram}</>
                  : <Text type="secondary">未配置</Text>}
              </div>
              <div><Tag color="red">法律文件</Tag>
                隐私政策：{previewData.legal?.privacy?.zh
                  ? <Tag color="green">✅ 已配置</Tag> : <Tag color="red">❌ 未配置</Tag>}
                服务条款：{previewData.legal?.terms?.zh
                  ? <Tag color="green">✅ 已配置</Tag> : <Tag color="red">❌ 未配置</Tag>}
              </div>
            </Space>
          ) : (
            <Text type="secondary">点击右上角「刷新」加载数据</Text>
          )}
        </Card>
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" icon={<GlobalOutlined />} onClick={() => window.open('/', '_blank')}>
            🔗 打开官网预览
          </Button>
          <Button onClick={() => window.open('/api/landing/config', '_blank')}>
            📡 查看 API 数据
          </Button>
        </Space>
      </Spin>
    );

    return (
      <Tabs
        defaultActiveKey="brand"
        onChange={key => { if (key === 'preview') fetchPreviewData(); }}
        items={[
          { key: 'brand',   label: '🎨 品牌设置',   children: brandTab },
          { key: 'social',  label: '📱 社交 & 联系', children: socialTab },
          { key: 'legal',   label: '📋 隐私 & 条款', children: legalTab },
          { key: 'preview', label: '📊 数据预览',    children: previewTab },
        ]}
      />
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

  const handleDownloadUserQR = (qrSize: number) => {
    if (!qrImageDataUrl) return;

    const platformName = qrPlatformName || 'ENKPay';
    const subtitle = qrSubtitleText || qrSelectedUser?.first_name || qrSelectedUser?.username || '';
    const scale = qrSize / 256; // scale factor relative to base 256

    // Poster layout: padding + title + qr + subtitle
    const padding = Math.round(32 * scale);
    const titleFontSize = Math.round(qrPlatformFontSize * scale);
    const subtitleFontPx = Math.round(qrSubtitleFontSize * scale);
    const titleHeight = titleFontSize + Math.round(24 * scale);
    const subtitleHeight = subtitleFontPx + Math.round(24 * scale);
    const canvasWidth = qrSize + padding * 2;
    const canvasHeight = padding + titleHeight + qrSize + subtitleHeight + padding;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d')!;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Platform name
    ctx.font = `700 ${titleFontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = qrPlatformColor || '#1a1a2e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(platformName, canvasWidth / 2, padding);

    // QR code image
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, padding + titleHeight, qrSize, qrSize);

      // Subtitle
      if (subtitle) {
        ctx.font = `500 ${subtitleFontPx}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.fillStyle = qrSubtitleColor || '#595959';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(subtitle, canvasWidth / 2, padding + titleHeight + qrSize + Math.round(12 * scale));
      }

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      const safeName = (qrSelectedUser?.first_name || qrSelectedUser?.username || 'user')
        .replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_');
      a.download = `enkpay_收款码_${safeName}_${qrSize}px.png`;
      a.click();
    };
    img.src = qrImageDataUrl;
  };

  const StepTitle = ({ num, title }: { num: number; title: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'linear-gradient(135deg, #1890ff, #096dd9)',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, flexShrink: 0,
      }}>{num}</div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
    </div>
  );

  const styleCards = [
    { key: 'standard', label: '标准', fg: '#000000', bg: '#FFFFFF', emoji: '⚫' },
    { key: 'dark',     label: '深色', fg: '#F0B90B', bg: '#1a1a2e', emoji: '⬛' },
    { key: 'gradient', label: '蓝紫', fg: '#6366f1', bg: '#FFFFFF', emoji: '🎨' },
  ];

  const qrCodeTab = (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* 左栏 */}
      <div style={{ flex: 1, minWidth: 380 }}>
        {/* 第一步：选择用户 */}
        <Card style={{ marginBottom: 16, borderRadius: 10 }} styles={{ body: { padding: 20 } }}>
          <StepTitle num={1} title="选择收款用户" />
          <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
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
              style={{ marginBottom: 12 }}
              dataSource={qrSearchResults}
              renderItem={(user: any) => (
                <List.Item
                  style={{ cursor: 'pointer', background: qrSelectedUser?.id === user.id ? '#e6f4ff' : undefined }}
                  onClick={() => {
                    setQrSelectedUser(user);
                    setQrSearchResults(null);
                    if (!qrSubtitleEdited) {
                      setQrSubtitleText(user.first_name || user.username || '');
                    }
                  }}
                >
                  <Space>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #1890ff, #096dd9)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(user.first_name?.[0] || user.username?.[0] || '?').toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 500 }}>{user.first_name || user.username || '—'}</span>
                    {user.username && <Text type="secondary">@{user.username}</Text>}
                    <Tag color="blue" style={{ margin: 0 }}>UID: #{user.unique_id || user.id}</Tag>
                    {(user.wallet_balance !== undefined || user.balance !== undefined) && (
                      <Tag color="cyan" style={{ margin: 0 }}>
                        ${parseFloat(user.wallet_balance || user.balance || 0).toFixed(2)} USDT
                      </Tag>
                    )}
                  </Space>
                </List.Item>
              )}
            />
          )}

          {qrSelectedUser && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'linear-gradient(135deg, #f6ffed, #d9f7be)',
              border: '1px solid #52c41a', borderRadius: 10, padding: '12px 16px',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg, #52c41a, #389e0d)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700, flexShrink: 0,
              }}>
                {(qrSelectedUser.first_name?.[0] || qrSelectedUser.username?.[0] || '?').toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#135200', fontSize: 15 }}>
                  {qrSelectedUser.first_name || qrSelectedUser.username || '—'}
                  {qrSelectedUser.username && (
                    <span style={{ color: '#52c41a', marginLeft: 8, fontSize: 13 }}>@{qrSelectedUser.username}</span>
                  )}
                </div>
                <Space size={6} style={{ marginTop: 4 }}>
                  <Tag color="green" style={{ margin: 0 }}>UID: #{qrSelectedUser.unique_id || qrSelectedUser.id}</Tag>
                  <Tag color="blue" style={{ margin: 0 }}>
                    ${parseFloat(qrSelectedUser.wallet_balance || qrSelectedUser.balance || 0).toFixed(2)} USDT
                  </Tag>
                </Space>
              </div>
              <Button size="small" onClick={() => {
                setQrSelectedUser(null);
                setQrImageDataUrl('');
                setQrSubtitleEdited(false);
                setQrSubtitleText('');
              }}>重新选择</Button>
            </div>
          )}
        </Card>

        {/* 第二步：配置样式 */}
        <Card style={{ borderRadius: 10 }} styles={{ body: { padding: 20 } }}>
          <StepTitle num={2} title="配置样式" />

          {/* 有效期 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>⏳ 有效期</div>
            <Space>
              <InputNumber
                min={1}
                max={24}
                value={qrExpiresMonths}
                onChange={(v) => setQrExpiresMonths(v || 1)}
                addonAfter="个月"
                style={{ width: 140 }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                到期：{(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + qrExpiresMonths); return d.toLocaleDateString('zh-CN'); })()}
              </Text>
            </Space>
          </div>

          {/* 样式卡片 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>🎨 二维码样式</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {styleCards.map(s => (
                <div
                  key={s.key}
                  onClick={() => setQrStyle(s.key as any)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${qrStyle === s.key ? '#1890ff' : '#d9d9d9'}`,
                    background: qrStyle === s.key ? '#e6f4ff' : '#fafafa',
                    textAlign: 'center', transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 6, margin: '0 auto 6px',
                    background: s.bg, border: '1px solid #e8e8e8',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: 16, height: 16, background: s.fg, borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: qrStyle === s.key ? 700 : 400, color: qrStyle === s.key ? '#1890ff' : '#595959' }}>
                    {s.emoji} {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 纠错级别 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>
              🔒 纠错级别 <span style={{ fontSize: 11, color: '#8c8c8c' }}>（级别越高，Logo遮挡越大也能识别，推荐 Q）</span>
            </div>
            <Radio.Group value={qrErrorLevel} onChange={(e) => setQrErrorLevel(e.target.value)}>
              <Radio.Button value="L">L</Radio.Button>
              <Radio.Button value="M">M</Radio.Button>
              <Radio.Button value="Q">Q ✓</Radio.Button>
              <Radio.Button value="H">H</Radio.Button>
            </Radio.Group>
          </div>

          {/* Logo 上传 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>
              🖼 Logo（可选）<span style={{ fontSize: 11, color: '#8c8c8c' }}>建议正方形 PNG/SVG，200×200px</span>
            </div>
            <Space align="center">
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
                <Button icon={<UploadOutlined />} size="small">上传 Logo</Button>
              </Upload>
              {qrLogoPreview && (
                <>
                  <img src={qrLogoPreview} alt="logo" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, border: '1px solid #d9d9d9' }} />
                  <Button size="small" danger onClick={() => { setQrLogoFile(null); setQrLogoPreview(''); }}>移除</Button>
                </>
              )}
            </Space>
          </div>

          {/* 文案设置 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 10, fontWeight: 600 }}>✏️ 文案设置</div>

            {/* 平台名称 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>平台名称</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  value={qrPlatformName}
                  onChange={(e) => setQrPlatformName(e.target.value)}
                  placeholder="ENKPay"
                  maxLength={30}
                  style={{ flex: 1 }}
                />
                <InputNumber
                  min={12}
                  max={36}
                  value={qrPlatformFontSize}
                  onChange={(v) => setQrPlatformFontSize(v || 22)}
                  addonAfter="px"
                  style={{ width: 88 }}
                />
                <input
                  type="color"
                  value={qrPlatformColor}
                  onChange={(e) => setQrPlatformColor(e.target.value)}
                  title="平台名称字体颜色"
                  style={{
                   width: 36, height: 32, border: '1px solid #d9d9d9', borderRadius: '0 6px 6px 0',
                   padding: 2, cursor: 'pointer', background: 'white', flexShrink: 0,
                  }}
                />
              </Space.Compact>
            </div>

            {/* 底部姓名 / 提示语 */}
            <div>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>底部姓名 / 提示语</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  value={qrSubtitleText}
                  onChange={(e) => {
                   setQrSubtitleText(e.target.value);
                   setQrSubtitleEdited(true);
                  }}
                  placeholder={qrSelectedUser?.first_name || qrSelectedUser?.username || '用户姓名或提示语'}
                  maxLength={60}
                  style={{ flex: 1 }}
                />
                <InputNumber
                  min={12}
                  max={36}
                  value={qrSubtitleFontSize}
                  onChange={(v) => setQrSubtitleFontSize(v || 16)}
                  addonAfter="px"
                  style={{ width: 88 }}
                />
                <input
                  type="color"
                  value={qrSubtitleColor}
                  onChange={(e) => setQrSubtitleColor(e.target.value)}
                  title="底部文字字体颜色"
                  style={{
                   width: 36, height: 32, border: '1px solid #d9d9d9', borderRadius: '0 6px 6px 0',
                   padding: 2, cursor: 'pointer', background: 'white', flexShrink: 0,
                  }}
                />
              </Space.Compact>
            </div>
          </div>

          {/* 生成按钮 */}
          <Button
            type="primary"
            size="large"
            icon={<QrcodeOutlined />}
            loading={qrGenerating}
            disabled={!qrSelectedUser}
            onClick={handleGenerateUserQR}
            style={{
              width: '100%', height: 48, fontSize: 16, fontWeight: 600,
              background: qrSelectedUser ? 'linear-gradient(135deg, #1890ff, #096dd9)' : undefined,
              border: 'none',
            }}
          >
            {qrGenerating ? '生成中...' : '🔄 生成收款码'}
          </Button>
        </Card>
      </div>

      {/* 右栏：预览区 */}
      <div style={{ width: 440, flexShrink: 0, position: 'sticky', top: 24 }}>
        <Card
          title={<span><QrcodeOutlined style={{ marginRight: 8 }} />收款码预览</span>}
          style={{ borderRadius: 12 }}
          styles={{ body: { padding: '24px 20px' } }}
        >
          {!qrImageDataUrl ? (
            <div style={{
              background: '#fff', borderRadius: 16,
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
              padding: '28px 24px', textAlign: 'center',
            }}>
              {/* 空态平台名占位 */}
              <div style={{
                fontSize: qrPlatformFontSize, fontWeight: 700,
                color: qrPlatformColor || '#bfbfbf',
                marginBottom: 20, letterSpacing: 1,
                opacity: qrPlatformName ? 1 : 0.35,
              }}>
                {qrPlatformName || 'ENKPay'}
              </div>
              {/* 空态二维码占位 */}
              <div style={{
                width: 320, height: 320, margin: '0 auto 20px',
                border: '2px dashed #d9d9d9', borderRadius: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: '#bfbfbf', background: '#fafafa',
              }}>
                <QrcodeOutlined style={{ fontSize: 64, marginBottom: 12 }} />
                <div style={{ fontSize: 14 }}>选择用户后点击生成</div>
              </div>
              {/* 空态底部文字占位 */}
              <div style={{
                fontSize: qrSubtitleFontSize, color: qrSubtitleColor || '#d9d9d9',
                opacity: qrSubtitleText ? 1 : 0.35,
              }}>
                {qrSubtitleText || (qrSelectedUser ? (qrSelectedUser.first_name || qrSelectedUser.username) : '用户姓名 / 提示语')}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              {/* 海报式预览卡片 */}
              <div style={{
                background: '#fff', borderRadius: 16,
                boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
                padding: '24px 20px 20px', marginBottom: 16,
              }}>
                {/* 顶部平台名称 */}
                <div style={{
                  fontSize: qrPlatformFontSize, fontWeight: 700,
                  color: qrPlatformColor, marginBottom: 18,
                  letterSpacing: 1,
                }}>
                  {qrPlatformName || 'ENKPay'}
                </div>

                {/* 中间二维码 */}
                <div style={{
                  width: 320, height: 320, margin: '0 auto 18px',
                  borderRadius: 12, overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  border: '1px solid #f0f0f0',
                }}>
                  <img src={qrImageDataUrl} alt="Payment QR Code" width={320} height={320} style={{ display: 'block' }} />
                </div>

                {/* 底部姓名 / 提示语 */}
                <div style={{
                  fontSize: qrSubtitleFontSize, color: qrSubtitleColor, fontWeight: 500,
                }}>
                  {qrSubtitleText || qrSelectedUser?.first_name || qrSelectedUser?.username || ''}
                </div>
              </div>

              {/* 辅助信息区 */}
              {qrExpiresAt && (
                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>有效期至</span>
                  <Tag color="orange">{new Date(qrExpiresAt).toLocaleDateString('zh-CN')}</Tag>
                </div>
              )}

              {qrContent && (
                <div
                  style={{
                    background: '#f5f5f5', borderRadius: 6, padding: '8px 10px', marginBottom: 14,
                    fontSize: 11, fontFamily: 'monospace', color: '#595959',
                    wordBreak: 'break-all', lineHeight: 1.5, cursor: 'pointer', textAlign: 'left',
                  }}
                  title="点击复制"
                  onClick={() => {
                    navigator.clipboard?.writeText(qrContent)
                      .then(() => message.success('已复制'))
                      .catch(() => message.error('复制失败，请手动复制'));
                  }}
                >
                  {qrContent.length > 80 ? qrContent.slice(0, 80) + '...' : qrContent}
                  <div style={{ color: '#1890ff', fontSize: 11, marginTop: 4 }}>📋 点击复制完整内容</div>
                </div>
              )}

              <Space direction="vertical" style={{ width: '100%' }}>
                <Button icon={<DownloadOutlined />} style={{ width: '100%' }} onClick={() => handleDownloadUserQR(256)}>
                  下载 PNG 256px
                </Button>
                <Button icon={<DownloadOutlined />} type="primary" style={{ width: '100%' }} onClick={() => handleDownloadUserQR(512)}>
                  下载 PNG 512px
                </Button>
              </Space>
            </div>
          )}
        </Card>
      </div>
    </div>
  );

  const handleInviteCardUpload = async (file: File) => {
    setInviteCardUploading(true);
    try {
      const result = await apiClient.uploadInviteCardImage(file);
      setInviteCardUrl(result.url);
      message.success('邀请卡图片上传成功');
    } catch (e: any) {
      message.error(e?.response?.data?.error || '图片上传失败');
    } finally { setInviteCardUploading(false); }
    return false;
  };

  const handleInviteMessageTranslateAndSave = async () => {
    if (!inviteMessageText.trim()) {
      message.warning('请先输入邀请语内容');
      return;
    }
    setInviteMessageSaving(true);
    try {
      const result = await apiClient.translateAndSaveInviteMessage(inviteMessageText);
      setInviteMessageTranslations(result.translations);
      message.success(`邀请语已翻译并保存 ${result.saved_keys?.length || 0} 个语言版本`);
      await fetchSettings();
    } catch (error: any) {
      console.error('Failed to save invite message:', error);
      message.error(error?.response?.data?.error || '翻译保存失败');
    } finally {
      setInviteMessageSaving(false);
    }
  };

  const handleSaveInviteReward = async () => {
    setInviteRewardSaving(true);
    try {
      await apiClient.bulkUpdateSystemSettings([
        { key: 'invite_reward_enabled', value: String(inviteRewardEnabled) },
        { key: 'invite_reward_amount', value: String(inviteRewardAmount) },
      ]);
      message.success('邀请奖励设置已保存');
      await fetchSettings();
    } catch (error: any) {
      console.error('Failed to save invite reward settings:', error);
      message.error(error?.response?.data?.error || '保存失败');
    } finally {
      setInviteRewardSaving(false);
    }
  };

  const createMiniAppBgGroup = (index: number): MiniAppBgGroup => ({
    id: `group_${index}`,
    name: `第${index}组`,
    trading: '',
    auction: '',
    period: '',
    charity: '',
    profile: '',
  });

  const fetchMiniAppBgGroups = async () => {
    if (miniAppBgLoaded) return;
    setMiniAppBgLoading(true);
    try {
      const data = await apiClient.getMiniAppBgGroups();
      const groups = Array.isArray(data?.groups) && data.groups.length > 0
        ? data.groups
        : [createMiniAppBgGroup(1)];
      setMiniAppBgGroups(groups);
      setMiniAppBgRotation(data?.rotation === 'weekly' || data?.rotation === 'monthly' ? data.rotation : 'manual');
      setMiniAppBgCurrentGroupId(data?.current_group_id || groups[0]?.id || null);
      setMiniAppBgRotationStart(data?.rotation_start ? dayjs(data.rotation_start) : null);
      setMiniAppBgLoaded(true);
    } catch (error: any) {
      console.error('Failed to fetch miniapp bg groups:', error);
      message.error(error?.response?.data?.error || '加载迷你APP背景设置失败');
    } finally {
      setMiniAppBgLoading(false);
    }
  };

  const handleMiniAppBgUpload = async (groupId: string, key: MiniAppBgKey, file: File) => {
    const mapKey = `${groupId}_${key}`;
    setMiniAppBgUploadingMap(prev => ({ ...prev, [mapKey]: true }));
    try {
      const result = await apiClient.uploadMiniAppBgImage(file);
      setMiniAppBgGroups(prev => prev.map(g => (g.id === groupId ? { ...g, [key]: result.url } : g)));
      message.success(`${MINIAPP_BG_FIELDS.find(f => f.key === key)?.label || '背景'}上传成功`);
    } catch (error: any) {
      message.error(error?.response?.data?.error || '上传失败');
    } finally {
      setMiniAppBgUploadingMap(prev => ({ ...prev, [mapKey]: false }));
    }
    return false;
  };

  const handleSaveMiniAppBgGroups = async () => {
    setMiniAppBgSaving(true);
    try {
      const groups = miniAppBgGroups.length > 0 ? miniAppBgGroups : [createMiniAppBgGroup(1)];
      const currentGroupId = miniAppBgCurrentGroupId && groups.some(g => g.id === miniAppBgCurrentGroupId)
        ? miniAppBgCurrentGroupId
        : (groups[0]?.id || null);
      await apiClient.saveMiniAppBgGroups({
        groups,
        rotation: miniAppBgRotation,
        current_group_id: currentGroupId,
        rotation_start: miniAppBgRotation !== 'manual' && miniAppBgRotationStart ? miniAppBgRotationStart.toISOString() : null,
      });
      setMiniAppBgCurrentGroupId(currentGroupId);
      message.success('迷你APP背景设置保存成功');
    } catch (error: any) {
      console.error('Failed to save miniapp bg groups:', error);
      message.error(error?.response?.data?.error || '保存失败');
    } finally {
      setMiniAppBgSaving(false);
    }
  };

  const renderMiniAppBgTab = () => {
    const groups = miniAppBgGroups.length > 0 ? miniAppBgGroups : [createMiniAppBgGroup(1)];

    return (
      <Spin spinning={miniAppBgLoading}>
        <Card title="⚙️ 轮换设置" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Form.Item label="轮换模式" style={{ marginBottom: 0 }}>
              <Radio.Group
                value={miniAppBgRotation}
                onChange={(e) => setMiniAppBgRotation(e.target.value)}
              >
                <Radio value="manual">手动切换</Radio>
                <Radio value="weekly">每周自动</Radio>
                <Radio value="monthly">每月自动</Radio>
              </Radio.Group>
            </Form.Item>

            {miniAppBgRotation !== 'manual' && (
              <Form.Item label="首次生效时间" style={{ marginBottom: 0 }}>
                <DatePicker
                  showTime
                  style={{ width: 280 }}
                  value={miniAppBgRotationStart}
                  onChange={setMiniAppBgRotationStart}
                  placeholder="请选择首次生效时间"
                />
              </Form.Item>
            )}

            <Button type="primary" icon={<SaveOutlined />} loading={miniAppBgSaving} onClick={handleSaveMiniAppBgGroups}>
              保存设置
            </Button>
          </Space>
        </Card>

        {groups.map((group, idx) => (
          <Card
            key={group.id}
            title={`🎨 第 ${idx + 1} 组 - ${group.name || '未命名'}`}
            style={{ marginBottom: 16 }}
            extra={(
              <Button
                danger
                size="small"
                disabled={idx === 0}
                onClick={() => {
                  if (idx === 0) return;
                  const nextGroups = groups.filter(g => g.id !== group.id);
                  setMiniAppBgGroups(nextGroups);
                  if (miniAppBgCurrentGroupId === group.id) {
                    setMiniAppBgCurrentGroupId(nextGroups[0]?.id || null);
                  }
                }}
              >
                删除本组
              </Button>
            )}
          >
            <Form layout="vertical">
              <Form.Item label="组名">
                <Input
                  value={group.name}
                  onChange={(e) => setMiniAppBgGroups(prev => prev.map(g => (g.id === group.id ? { ...g, name: e.target.value } : g)))}
                  placeholder={`请输入第 ${idx + 1} 组名称`}
                />
              </Form.Item>
            </Form>

            <Space wrap size={16}>
              {MINIAPP_BG_FIELDS.map(field => {
                const url = group[field.key];
                const mapKey = `${group.id}_${field.key}`;
                const uploading = !!miniAppBgUploadingMap[mapKey];
                return (
                  <Card key={field.key} size="small" title={field.label} style={{ width: 190 }}>
                    <div style={{
                      width: 160, height: 100, borderRadius: 8, border: '2px dashed #d9d9d9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', background: '#fafafa', marginBottom: 8,
                    }}>
                      {url
                        ? <img src={url} alt={field.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        : <PictureOutlined style={{ fontSize: 28, color: '#bfbfbf' }} />}
                    </div>
                    <Space>
                      <Upload
                        accept="image/*"
                        maxCount={1}
                        showUploadList={false}
                        beforeUpload={(file) => handleMiniAppBgUpload(group.id, field.key, file)}
                      >
                        <Button size="small" icon={<UploadOutlined />} loading={uploading}>
                          上传图片
                        </Button>
                      </Upload>
                      <Button
                        size="small"
                        danger
                        disabled={!url}
                        onClick={() => setMiniAppBgGroups(prev => prev.map(g => (g.id === group.id ? { ...g, [field.key]: '' } : g)))}
                      >
                        删除
                      </Button>
                    </Space>
                  </Card>
                );
              })}
            </Space>

            {miniAppBgRotation === 'manual' && (
              <div style={{ marginTop: 12 }}>
                {miniAppBgCurrentGroupId === group.id ? (
                  <Tag color="green">✅ 当前使用</Tag>
                ) : (
                  <Button size="small" onClick={() => setMiniAppBgCurrentGroupId(group.id)}>
                    设为当前使用
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}

        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            const next = [...groups, createMiniAppBgGroup(groups.length + 1)];
            setMiniAppBgGroups(next);
          }}
        >
          添加新组
        </Button>
      </Spin>
    );
  };

  const renderInviteSettingsTab = () => {
    const inviteMessageCollapseItems = LANG_CONFIG.map(lang => {
      const existingSetting = settings.find((s) => s.key === `invite_message_${lang.code}`);
      const displayText =
        (inviteMessageTranslations && inviteMessageTranslations[lang.code] !== undefined)
          ? unwrapJsonString(inviteMessageTranslations[lang.code])
          : (existingSetting?.value ? unwrapJsonString(existingSetting.value) : '');

      return {
        key: lang.code,
        label: (
          <span>
            <Tag color="blue" style={{ marginRight: 6 }}>{lang.code.toUpperCase()}</Tag>
            {lang.flag} {lang.label}
            {displayText && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>({displayText.slice(0, PREVIEW_TEXT_LENGTH)}{displayText.length > PREVIEW_TEXT_LENGTH ? '…' : ''})</Text>}
          </span>
        ),
        children: displayText
          ? <div style={{ whiteSpace: 'pre-wrap', padding: '8px 0', color: '#333', direction: lang.dir }}>{displayText}</div>
          : <Text type="secondary">暂无内容</Text>,
      };
    });

    return (
      <>
        {/* Card 1: 邀请卡图片 */}
        <Card title="🖼️ 邀请卡图片" style={{ marginBottom: 16 }}>
          <Space align="start" style={{ flexWrap: 'wrap' as const }}>
            <div style={{
              width: 160, height: 100, borderRadius: 8, border: '2px dashed #d9d9d9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', background: '#fafafa', flexShrink: 0,
            }}>
              {inviteCardUrl
                ? <img src={inviteCardUrl} alt="invite card" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <PictureOutlined style={{ fontSize: 32, color: '#bfbfbf' }} />}
            </div>
            <div>
              <Upload
                accept="image/*"
                maxCount={1}
                showUploadList={false}
                beforeUpload={handleInviteCardUpload}
              >
                <Button icon={<UploadOutlined />} loading={inviteCardUploading} style={{ marginRight: 8 }}>
                  {inviteCardUploading ? '上传中...' : inviteCardUrl ? '替换图片' : '上传图片'}
                </Button>
              </Upload>
              {inviteCardUrl && (
                <Button
                  danger
                  onClick={() => setInviteCardUrl('')}
                  size="small"
                >
                  删除
                </Button>
              )}
              <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                支持 JPG、PNG、GIF 动态图，最大 10MB
              </div>
            </div>
          </Space>
        </Card>

        {/* Card 2: 邀请语设置 */}
        <Card title="💬 邀请语设置" style={{ marginBottom: 16 }}>
          <Form.Item label="原文（中文或英文，系统自动翻译为 7 种语言）">
            <TextArea
              rows={6}
              placeholder="请输入邀请语（建议用中文或英文，系统将自动翻译为 7 种语言）"
              value={inviteMessageText}
              onChange={(e) => setInviteMessageText(e.target.value)}
            />
            <Button
              type="primary"
              icon={<TranslationOutlined />}
              loading={inviteMessageSaving}
              onClick={handleInviteMessageTranslateAndSave}
              disabled={!inviteMessageText.trim()}
              style={{ marginTop: 8 }}
            >
              🌐 翻译并保存（7 种语言）
            </Button>
          </Form.Item>

          {(inviteMessageTranslations || settings.some(s => s.key.startsWith('invite_message_'))) && (
            <>
              <Divider>各语言预览</Divider>
              <Collapse size="small" items={inviteMessageCollapseItems} />
            </>
          )}
        </Card>

        {/* Card 3: 邀请奖励设置 */}
        <Card title="💰 邀请奖励设置">
          <Form.Item label="启用邀请奖励">
            <Switch
              checked={inviteRewardEnabled}
              onChange={setInviteRewardEnabled}
              checkedChildren="开启"
              unCheckedChildren="关闭"
            />
          </Form.Item>
          <Form.Item label="每次邀请奖励金额（USDT）">
            <InputNumber
              min={0}
              step={0.01}
              precision={2}
              value={inviteRewardAmount}
              onChange={(v) => setInviteRewardAmount(v ?? 2.00)}
              style={{ width: 160 }}
            />
          </Form.Item>
          <Alert
            type="info"
            message="被邀请者完成首次充值后，奖励自动到账到邀请人余额"
            style={{ marginBottom: 16 }}
            showIcon
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={inviteRewardSaving}
            onClick={handleSaveInviteReward}
          >
            💾 保存奖励设置
          </Button>
        </Card>
      </>
    );
  };

  const renderBotEmojiTab = () => {
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Card title="品牌标题头设置">
          <Form layout="vertical">
            <Form.Item label="启用标题头">
              <Switch
                checked={botEmojiConfig.header_enabled}
                onChange={(checked) => handleBotEmojiFieldChange('header_enabled', checked)}
              />
            </Form.Item>
            <Form.Item label="Header Emoji ID（可选）">
              <Input
                value={botEmojiConfig.header_emoji_id}
                onChange={(e) => handleBotEmojiFieldChange('header_emoji_id', e.target.value)}
                placeholder="5471952986970267163"
              />
            </Form.Item>
            <Form.Item label="Header Emoji Fallback">
              <Input
                value={botEmojiConfig.header_emoji_fallback}
                onChange={(e) => handleBotEmojiFieldChange('header_emoji_fallback', e.target.value)}
                placeholder="💎"
              />
            </Form.Item>
            <Form.Item label="Header 标题文字">
              <Input
                value={botEmojiConfig.header_text}
                onChange={(e) => handleBotEmojiFieldChange('header_text', e.target.value)}
                placeholder="ENKPAY"
              />
            </Form.Item>
            <Form.Item label="插入 Header 动态表情到 Fallback">
              <AnimatedEmojiPanel onInsert={(tag) => handleBotEmojiInsert('header_emoji_fallback', tag)} />
            </Form.Item>
          </Form>
        </Card>

        <Card title="消息状态表情">
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {[
              ['emoji_success', '成功'],
              ['emoji_reject', '失败'],
              ['emoji_pending', '待审核'],
              ['emoji_warning', '警告'],
            ].map(([key, label]) => (
              <div key={key} style={{ paddingBottom: 8, borderBottom: '1px dashed #f0f0f0' }}>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>{label}</div>
                <Input
                  value={(botEmojiConfig as any)[key] || ''}
                  onChange={(e) => handleBotEmojiFieldChange(key as keyof BotMessageEmojiConfig, e.target.value)}
                />
                <div style={{ marginTop: 8 }}>
                  <AnimatedEmojiPanel onInsert={(tag) => handleBotEmojiInsert(key as keyof BotMessageEmojiConfig, tag)} />
                </div>
              </div>
            ))}
          </Space>
        </Card>

        <Card title="字段表情配置">
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {FIELD_EMOJI_ITEMS.map((item) => (
              <div key={item.key} style={{ paddingBottom: 8, borderBottom: '1px dashed #f0f0f0' }}>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>{item.label}</div>
                <Input
                  value={botEmojiConfig[item.key] || ''}
                  onChange={(e) => handleBotEmojiFieldChange(item.key, e.target.value)}
                />
                <div style={{ marginTop: 8 }}>
                  <AnimatedEmojiPanel onInsert={(tag) => handleBotEmojiInsert(item.key, tag)} />
                </div>
              </div>
            ))}
          </Space>
        </Card>

        <Card title="通知消息动态表情">
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Alert
              type="info"
              showIcon
              message="以下仅配置通知消息新增字段。复用 emoji（如 🧧/💰/📊/✅/⏳）请在上方“消息状态表情 / 字段表情配置”中设置，避免多来源冲突。"
            />
            {NOTIFICATION_EMOJI_SECTIONS.map((section, sectionIndex) => (
              <div key={section.title}>
                {sectionIndex > 0 && <Divider style={{ margin: '8px 0 12px' }} />}
                <div style={{ marginBottom: 8, fontWeight: 600 }}>{section.title}</div>
                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                  {section.items.map((item) => (
                    <div key={item.key} style={{ paddingBottom: 8, borderBottom: '1px dashed #f0f0f0' }}>
                      <div style={{ marginBottom: 8, fontWeight: 500 }}>{item.label}</div>
                      <Input
                        value={botEmojiConfig[item.key] || ''}
                        onChange={(e) => handleBotEmojiFieldChange(item.key, e.target.value)}
                      />
                      <div style={{ marginTop: 8 }}>
                        <AnimatedEmojiPanel onInsert={(tag) => handleBotEmojiInsert(item.key, tag)} />
                      </div>
                    </div>
                  ))}
                </Space>
              </div>
            ))}
          </Space>
        </Card>

        <div style={{ textAlign: 'right' }}>
          <Button type="primary" icon={<SaveOutlined />} loading={botEmojiSaving} onClick={handleSaveBotEmojiConfig}>
            保存 Bot 消息样式
          </Button>
        </div>
      </Space>
    );
  };

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
    {
      key: 'landing',
      label: '网页管理',
      children: renderLandingTab(),
    },
    {
      key: 'invite_settings',
      label: '邀请设置',
      children: renderInviteSettingsTab(),
    },
    {
      key: 'miniapp_bg',
      label: '迷你APP背景设置',
      children: renderMiniAppBgTab(),
    },
    {
      key: 'bot_emoji',
      label: '🎨 Bot 消息样式',
      children: renderBotEmojiTab(),
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
          <Tabs
            items={tabItems}
            activeKey={activeMainTab}
            onChange={key => {
              setActiveMainTab(key);
              if (key === 'landing') fetchLandingConfig();
              if (key === 'miniapp_bg') fetchMiniAppBgGroups();
            }}
          />
        </Form>
      </Spin>
    </div>
  );
};

export default SystemSettings;
