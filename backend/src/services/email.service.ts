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

// Default multi-language verification email templates
export const DEFAULT_VERIFICATION_TEMPLATES: Record<string, { subject: string; html: string; text: string }> = {
  zh: {
    subject: '{{platform_name}} 邮箱验证码',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin-bottom:12px;">{{platform_name}} 邮箱验证码</h2>
      <p>您的验证码是：</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div>
      <p>验证码 {{valid_minutes}} 分钟内有效，且只能使用一次。</p>
      <p>如果这不是您的操作，请忽略此邮件。</p>
    </div>`,
    text: `您的 {{platform_name}} 邮箱验证码是 {{code}}，{{valid_minutes}} 分钟内有效。如非本人操作，请忽略此邮件。`,
  },
  en: {
    subject: '{{platform_name}} Email Verification Code',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin-bottom:12px;">{{platform_name}} Verification Code</h2>
      <p>Your verification code is:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div>
      <p>This code is valid for {{valid_minutes}} minutes and can only be used once.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>`,
    text: `Your {{platform_name}} verification code is {{code}}, valid for {{valid_minutes}} minutes. If you did not request this, please ignore this email.`,
  },
  fr: {
    subject: 'Code de vérification {{platform_name}}',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin-bottom:12px;">Code de vérification {{platform_name}}</h2>
      <p>Votre code de vérification est :</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div>
      <p>Ce code est valable {{valid_minutes}} minutes et ne peut être utilisé qu'une seule fois.</p>
      <p>Si vous n'avez pas effectué cette demande, veuillez ignorer cet e-mail.</p>
    </div>`,
    text: `Votre code de vérification {{platform_name}} est {{code}}, valable {{valid_minutes}} minutes.`,
  },
  de: {
    subject: '{{platform_name}} E-Mail-Verifizierungscode',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin-bottom:12px;">{{platform_name}} Verifizierungscode</h2>
      <p>Ihr Verifizierungscode lautet:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div>
      <p>Dieser Code ist {{valid_minutes}} Minuten gültig und kann nur einmal verwendet werden.</p>
      <p>Wenn Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail bitte.</p>
    </div>`,
    text: `Ihr {{platform_name}} Verifizierungscode ist {{code}}, gültig für {{valid_minutes}} Minuten.`,
  },
  es: {
    subject: 'Código de verificación de {{platform_name}}',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin-bottom:12px;">Código de verificación de {{platform_name}}</h2>
      <p>Su código de verificación es:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div>
      <p>Este código es válido por {{valid_minutes}} minutos y solo se puede usar una vez.</p>
      <p>Si no realizó esta solicitud, ignore este correo electrónico.</p>
    </div>`,
    text: `Su código de verificación de {{platform_name}} es {{code}}, válido por {{valid_minutes}} minutos.`,
  },
  ar: {
    subject: 'رمز التحقق من {{platform_name}}',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;direction:rtl">
      <h2 style="margin-bottom:12px;">رمز التحقق من {{platform_name}}</h2>
      <p>رمز التحقق الخاص بك هو:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div>
      <p>هذا الرمز صالح لمدة {{valid_minutes}} دقائق ويمكن استخدامه مرة واحدة فقط.</p>
      <p>إذا لم تطلب هذا، يرجى تجاهل هذا البريد الإلكتروني.</p>
    </div>`,
    text: `رمز التحقق من {{platform_name}} هو {{code}}، صالح لمدة {{valid_minutes}} دقائق.`,
  },
  ja: {
    subject: '{{platform_name}} メール認証コード',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin-bottom:12px;">{{platform_name}} 認証コード</h2>
      <p>認証コードは：</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div>
      <p>このコードは {{valid_minutes}} 分間有効で、1 回のみ使用できます。</p>
      <p>お心当たりのない場合は、このメールを無視してください。</p>
    </div>`,
    text: `{{platform_name}} の認証コードは {{code}} です。{{valid_minutes}} 分間有効です。`,
  },
  ko: {
    subject: '{{platform_name}} 이메일 인증 코드',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin-bottom:12px;">{{platform_name}} 인증 코드</h2>
      <p>인증 코드:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div>
      <p>이 코드는 {{valid_minutes}}분 동안 유효하며 한 번만 사용할 수 있습니다.</p>
      <p>본인이 요청하지 않았다면 이 이메일을 무시하세요.</p>
    </div>`,
    text: `{{platform_name}} 인증 코드는 {{code}}이며, {{valid_minutes}}분 동안 유효합니다.`,
  },
  ru: {
    subject: 'Код подтверждения {{platform_name}}',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin-bottom:12px;">Код подтверждения {{platform_name}}</h2>
      <p>Ваш код подтверждения:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#7c3aed;">{{code}}</div>
      <p>Этот код действителен в течение {{valid_minutes}} минут и может быть использован только один раз.</p>
      <p>Если вы не запрашивали это, проигнорируйте это письмо.</p>
    </div>`,
    text: `Ваш код подтверждения {{platform_name}}: {{code}}, действителен в течение {{valid_minutes}} минут.`,
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

/**
 * Parse Accept-Language header and return the best matching supported language code
 * Falls back to 'en' if no match, then 'zh' as final fallback
 */
export function detectLangFromAcceptLanguage(acceptLanguage: string | undefined): string {
  const supported = ['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja'];
  if (!acceptLanguage) return 'en';

  // Parse "zh-CN,zh;q=0.9,en;q=0.8" format
  const langs = acceptLanguage.split(',')
    .map(part => {
      const [lang, q] = part.trim().split(';q=');
      return {
        lang: lang.trim().split('-')[0].toLowerCase(),
        q: q ? parseFloat(q) : 1.0,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of langs) {
    if (supported.includes(lang)) return lang;
  }
  return 'en';
}

/**
 * Render template by replacing {{key}} with values from vars
 */
function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
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

export async function sendVerificationCodeEmail(email: string, code: string, lang = 'zh') {
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

  // Fetch multi-language template settings from database
  const templateKeys = ['mail_tpl_verification_subject', 'mail_tpl_verification_html', 'mail_tpl_verification_text'];
  const tplSettings = await getSystemSettingsMap(templateKeys);

  // Helper: get template by language with fallback chain
  const getTemplate = (field: 'subject' | 'html' | 'text') => {
    const settingKey = `mail_tpl_verification_${field}`;
    const stored = tplSettings[settingKey];
    const storedMap = typeof stored === 'object' && stored !== null ? stored : {};

    return String(
      storedMap[lang] ||
      storedMap['en'] ||
      storedMap['zh'] ||
      DEFAULT_VERIFICATION_TEMPLATES[lang]?.[field] ||
      DEFAULT_VERIFICATION_TEMPLATES['en']?.[field] ||
      DEFAULT_VERIFICATION_TEMPLATES['zh'][field]
    );
  };

  // Template variables
  const vars = {
    code,
    platform_name: config.fromName || 'ENKPay',
    valid_minutes: '10',
  };

  const subject = renderTemplate(getTemplate('subject'), vars);
  const html = renderTemplate(getTemplate('html'), vars);
  const text = renderTemplate(getTemplate('text'), vars);

  const resend = new Resend(config.resendApiKey);
  const from = config.fromName
    ? `${config.fromName} <${config.fromEmail}>`
    : config.fromEmail;

  await resend.emails.send({
    from,
    to: email,
    subject,
    text,
    html,
  });
}
