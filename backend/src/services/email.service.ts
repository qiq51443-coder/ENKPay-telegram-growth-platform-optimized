import { Resend } from 'resend';
import { MAIL_SETTING_KEYS, getSystemSettingsMap, maybeDecryptSettingValue } from './system-settings.service';

type MailProvider = 'resend' | 'smtp' | 'other';

export interface MailServiceConfig {
  provider: MailProvider;
  enabled: boolean;
  resendApiKey: string;
  fromEmail: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number | null;
  smtpUsername: string;
  smtpPassword: string;
}

export const DEFAULT_VERIFICATION_TEMPLATES: Record<string, { subject: string; html: string; text: string }> = {
  zh: {
    subject: '{{platform_name}} 邮箱验证码',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><h2 style="margin-bottom:12px;">{{platform_name}} 邮箱验证码</h2><p>您的验证码是：</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div><p>验证码 {{valid_minutes}} 分钟内有效，且只能使用一次。</p><p>如果这不是您的操作，请忽略此邮件。</p></div>`,
    text: `您的 {{platform_name}} 邮箱验证码是 {{code}}，{{valid_minutes}} 分钟内有效。如非本人操作，请忽略此邮件。`,
  },
  en: {
    subject: '{{platform_name}} Email Verification Code',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><h2 style="margin-bottom:12px;">{{platform_name}} Verification Code</h2><p>Your verification code is:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div><p>This code is valid for {{valid_minutes}} minutes and can only be used once.</p><p>If you did not request this, please ignore this email.</p></div>`,
    text: `Your {{platform_name}} verification code is {{code}}, valid for {{valid_minutes}} minutes. If you did not request this, please ignore this email.`,
  },
};

function parseBool(value: any, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

export function detectLangFromAcceptLanguage(acceptLanguage: string | undefined): string {
  const supported = ['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja', 'ko', 'ru'];
  if (!acceptLanguage) return 'en';
  const langs = acceptLanguage.split(',').map(part => {
    const [lang, q] = part.trim().split(';q=');
    return { lang: lang.trim().split('-')[0].toLowerCase(), q: q ? parseFloat(q) : 1.0 };
  }).sort((a, b) => b.q - a.q);
  for (const { lang } of langs) {
    if (supported.includes(lang)) return lang;
  }
  return 'en';
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export async function getMailServiceConfig(): Promise<MailServiceConfig> {
  const dbSettings = await getSystemSettingsMap(MAIL_SETTING_KEYS);
  const provider = String(dbSettings.mail_provider || process.env.MAIL_PROVIDER || 'resend').toLowerCase() as MailProvider;
  const resendApiKey = maybeDecryptSettingValue(dbSettings.mail_resend_api_key) || process.env.RESEND_API_KEY || '';
  const fromEmail = String(dbSettings.mail_from_email || process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || '').trim();
  const fromName = String(dbSettings.mail_from_name || process.env.EMAIL_FROM_NAME || process.env.RESEND_FROM_NAME || 'ENKPay').trim();
  const smtpHost = String(dbSettings.mail_smtp_host || process.env.SMTP_HOST || '').trim();
  const smtpPortRaw = dbSettings.mail_smtp_port ?? process.env.SMTP_PORT ?? '';
  const smtpPort = smtpPortRaw === '' ? null : Number(smtpPortRaw);
  const smtpUsername = String(dbSettings.mail_smtp_username || process.env.SMTP_USERNAME || '').trim();
  const smtpPassword = maybeDecryptSettingValue(dbSettings.mail_smtp_password) || process.env.SMTP_PASSWORD || '';
  const enabled = parseBool(dbSettings.mail_enabled ?? process.env.MAIL_ENABLED, Boolean(resendApiKey || smtpHost));
  return {
    provider, enabled, resendApiKey, fromEmail, fromName, smtpHost,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : null, smtpUsername, smtpPassword,
  };
}

export async function sendVerificationCodeEmail(
  email: string,
  code: string,
  lang = 'zh',
  purpose: 'register' | 'reset_password' = 'register'
) {
  const config = await getMailServiceConfig();
  if (!config.enabled) throw new Error('邮件服务未启用');
  if (config.provider !== 'resend') throw new Error(`当前邮件服务商「${config.provider}」暂不支持，请使用 Resend`);
  if (!config.resendApiKey || !config.fromEmail) throw new Error('邮件服务未完整配置（缺少 Resend API Key 或发件邮箱）');

  const templateKeys = ['mail_tpl_verification_subject', 'mail_tpl_verification_html', 'mail_tpl_verification_text'];
  const tplSettings = await getSystemSettingsMap(templateKeys);
  const getTemplate = (field: 'subject' | 'html' | 'text') => {
    const settingKey = `mail_tpl_verification_${field}`;
    const stored = tplSettings[settingKey];
    const storedMap = typeof stored === 'object' && stored !== null ? stored : {};
    return String(
      storedMap[lang] || storedMap['en'] || storedMap['zh'] ||
      DEFAULT_VERIFICATION_TEMPLATES[lang]?.[field] ||
      DEFAULT_VERIFICATION_TEMPLATES['en']?.[field] ||
      DEFAULT_VERIFICATION_TEMPLATES['zh'][field]
    );
  };

  const vars = { code, platform_name: config.fromName || 'ENKPay', valid_minutes: '10' };
  let subjectTpl = getTemplate('subject');
  let htmlTpl = getTemplate('html');
  let textTpl = getTemplate('text');

  if (purpose === 'reset_password') {
    if (lang.startsWith('zh')) {
      subjectTpl = '{{platform_name}} 重置密码验证码';
      htmlTpl = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:520px;margin:0 auto;padding:24px"><h2 style="margin:0 0 12px;color:#7c3aed;">{{platform_name}} · 重置密码</h2><p>您正在重置登录密码，验证码是：</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#dc2626;background:#fef2f2;padding:16px 20px;border-radius:12px;text-align:center;">{{code}}</div><p style="color:#64748b;">验证码 <strong>{{valid_minutes}}</strong> 分钟内有效，且只能使用一次。</p><p style="color:#94a3b8;font-size:13px;">如果这不是您的操作，请忽略此邮件。</p></div>`;
      textTpl = '您正在重置 {{platform_name}} 登录密码，验证码是 {{code}}，{{valid_minutes}} 分钟内有效。如非本人操作，请忽略。';
    } else {
      subjectTpl = '{{platform_name}} Password Reset Code';
      htmlTpl = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:520px;margin:0 auto;padding:24px"><h2 style="margin:0 0 12px;color:#7c3aed;">{{platform_name}} · Password Reset</h2><p>You are resetting your password. Your code is:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#dc2626;background:#fef2f2;padding:16px 20px;border-radius:12px;text-align:center;">{{code}}</div><p style="color:#64748b;">Valid for <strong>{{valid_minutes}}</strong> minutes, one-time use.</p><p style="color:#94a3b8;font-size:13px;">If you did not request this, ignore this email.</p></div>`;
      textTpl = 'You are resetting your {{platform_name}} password. Code: {{code}}, valid {{valid_minutes}} minutes.';
    }
  }

  const subject = renderTemplate(subjectTpl, vars);
  const html = renderTemplate(htmlTpl, vars);
  const text = renderTemplate(textTpl, vars);
  const resend = new Resend(config.resendApiKey);
  const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;

  const doSend = async () => {
    const result = await resend.emails.send({ from, to: email, subject, text, html });
    if (result && typeof result === 'object' && (result as any).error) {
      const err = (result as any).error;
      throw new Error(err?.message || String(err) || 'Resend 发送失败');
    }
    return result;
  };

  try {
    await doSend();
  } catch (first: any) {
    const msg = String(first?.message || first || '');
    if (!/timeout|network|ECONNRESET|ETIMEDOUT|fetch failed|503|429/i.test(msg)) {
      console.error('[email] Resend send failed:', msg);
      throw new Error(msg || '验证码发送失败，请稍后重试');
    }
    console.warn('[email] Resend retry after:', msg);
    try {
      await doSend();
    } catch (second: any) {
      const finalMsg = String(second?.message || second || '验证码发送失败');
      console.error('[email] Resend retry failed:', finalMsg);
      throw new Error(finalMsg);
    }
  }
}
