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

function parseBool(value: any, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

export async function getMailServiceConfig(): Promise<MailServiceConfig> {
  const dbSettings = await getSystemSettingsMap(MAIL_SETTING_KEYS);

  const provider = String(
    dbSettings.mail_provider ||
    process.env.MAIL_PROVIDER ||
    'resend'
  ).toLowerCase() as MailProvider;

  const resendApiKey = maybeDecryptSettingValue(dbSettings.mail_resend_api_key) || process.env.RESEND_API_KEY || '';
  const fromEmail = String(dbSettings.mail_from_email || process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || '').trim();
  const fromName = String(dbSettings.mail_from_name || process.env.EMAIL_FROM_NAME || process.env.RESEND_FROM_NAME || 'ENKPay').trim();
  const smtpHost = String(dbSettings.mail_smtp_host || process.env.SMTP_HOST || '').trim();
  const smtpPortRaw = dbSettings.mail_smtp_port ?? process.env.SMTP_PORT ?? '';
  const smtpPort = smtpPortRaw === '' ? null : Number(smtpPortRaw);
  const smtpUsername = String(dbSettings.mail_smtp_username || process.env.SMTP_USERNAME || '').trim();
  const smtpPassword = maybeDecryptSettingValue(dbSettings.mail_smtp_password) || process.env.SMTP_PASSWORD || '';

  const enabled = parseBool(
    dbSettings.mail_enabled ?? process.env.MAIL_ENABLED,
    Boolean(resendApiKey || smtpHost)
  );

  return {
    provider,
    enabled,
    resendApiKey,
    fromEmail,
    fromName,
    smtpHost,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : null,
    smtpUsername,
    smtpPassword,
  };
}

export async function sendVerificationCodeEmail(email: string, code: string) {
  const config = await getMailServiceConfig();

  if (!config.enabled) {
    throw new Error('Mail service is disabled');
  }

  if (config.provider !== 'resend') {
    throw new Error(`Mail provider '${config.provider}' is not supported yet`);
  }

  if (!config.resendApiKey || !config.fromEmail) {
    throw new Error('Mail service is not fully configured');
  }

  const resend = new Resend(config.resendApiKey);
  const from = config.fromName
    ? `${config.fromName} <${config.fromEmail}>`
    : config.fromEmail;

  await resend.emails.send({
    from,
    to: email,
    subject: 'ENKPay 邮箱验证码',
    text: `您的 ENKPay 邮箱验证码是 ${code}，10 分钟内有效。如非本人操作，请忽略此邮件。`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="margin-bottom:12px;">ENKPay 邮箱验证码</h2>
        <p>您的验证码是：</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">${code}</div>
        <p>验证码 10 分钟内有效，且只能使用一次。</p>
        <p>如果这不是您的操作，请忽略此邮件。</p>
      </div>
    `,
  });
}
