import { query } from '../db';
import { decrypt } from './deposit.service';

export const MAIL_SETTING_KEYS = [
  'mail_provider',
  'mail_enabled',
  'mail_resend_api_key',
  'mail_from_email',
  'mail_from_name',
  'mail_smtp_host',
  'mail_smtp_port',
  'mail_smtp_username',
  'mail_smtp_password',
] as const;

export const SENSITIVE_SYSTEM_SETTING_KEYS = new Set([
  'mail_resend_api_key',
  'mail_smtp_password',
]);

export function parseSystemSettingValue<T = any>(raw: any): T | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

export function maskSensitiveSettingValue(key: string, value: any) {
  if (!SENSITIVE_SYSTEM_SETTING_KEYS.has(key)) return value;
  const parsed = parseSystemSettingValue<string>(value);
  if (!parsed) return '';
  return '••••••••';
}

export function maybeDecryptSettingValue(value: any): string {
  const parsed = parseSystemSettingValue<string>(value);
  if (!parsed || typeof parsed !== 'string') return '';
  try {
    return decrypt(parsed);
  } catch {
    return parsed;
  }
}

export async function getSystemSettingsMap(keys: readonly string[]) {
  const result = await query(
    `SELECT key, value
       FROM system_settings
      WHERE key = ANY($1::text[])`,
    [keys]
  );

  return result.rows.reduce<Record<string, any>>((acc, row) => {
    acc[row.key] = parseSystemSettingValue(row.value);
    return acc;
  }, {});
}
