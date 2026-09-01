import crypto from 'crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query, transaction } from '../db';
import { loginLimiter } from '../middleware/rateLimiter';
import { signWebUserToken, authenticateWebUser, WebAuthRequest } from '../middleware/web-auth';
import { sendVerificationCodeEmail, detectLangFromAcceptLanguage } from '../services/email.service';
import { generateUniqueUserId } from '../utils/uniqueId';
import { buildWebProfile } from './web-shared';

const router = express.Router();

const webAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webProfileLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isAsciiEmailPart(value: string) {
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    const isAllowedSymbol = `.!#$%&'*+/=?^_\`{|}~-`.includes(char);
    if (!isDigit && !isUpper && !isLower && !isAllowedSymbol) return false;
  }
  return true;
}

function isValidEmail(email: string) {
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@') || atIndex === email.length - 1) return false;
  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1);
  if (!localPart || !domainPart || localPart.length > 64 || domainPart.length > 253 ||
      localPart.startsWith('.') || localPart.endsWith('.') || domainPart.startsWith('.') || domainPart.endsWith('.') ||
      localPart.includes('..') || domainPart.includes('..') || !domainPart.includes('.')) return false;
  if (!isAsciiEmailPart(localPart)) return false;
  const domainLabels = domainPart.split('.');
  if (domainLabels.some((label) => !label || label.startsWith('-') || label.endsWith('-'))) return false;
  return domainLabels.every((label) => {
    for (const char of label) {
      const code = char.charCodeAt(0);
      const isDigit = code >= 48 && code <= 57;
      const isUpper = code >= 65 && code <= 90;
      const isLower = code >= 97 && code <= 122;
      if (!isDigit && !isUpper && !isLower && char !== '-') return false;
    }
    return true;
  });
}

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function parsePurpose(raw: unknown): 'register' | 'reset_password' {
  const p = String(raw || 'register').toLowerCase();
  if (p === 'reset_password' || p === 'reset' || p === 'forgot') return 'reset_password';
  return 'register';
}

router.post('/send-code', webAuthLimiter, loginLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''));
    const purpose = parsePurpose(req.body?.purpose);
    if (!isValidEmail(email)) return res.status(400).json({ error: '请输入有效邮箱地址' });

    const { getMailServiceConfig } = await import('../services/email.service');
    const mailConfig = await getMailServiceConfig();
    if (!mailConfig.enabled) return res.status(400).json({ error: '邮件服务未启用，无法发送验证码' });

    const existingUser = await query('SELECT id, register_type FROM users WHERE email = $1 LIMIT 1', [email]);
    if (purpose === 'register') {
      if (existingUser.rows.length > 0) return res.status(409).json({ error: '该邮箱已注册，请直接登录' });
    } else {
      if (existingUser.rows.length === 0) return res.status(404).json({ error: '该邮箱未注册或无法重置密码' });
      if (existingUser.rows[0].register_type !== 'email') return res.status(400).json({ error: '该账号不支持邮箱重置密码' });
    }

    const recentCode = await query(
      `SELECT created_at FROM email_verification_codes WHERE email = $1 AND purpose = $2 ORDER BY created_at DESC LIMIT 1`,
      [email, purpose]
    );
    if (recentCode.rows.length > 0) {
      const createdAt = new Date(recentCode.rows[0].created_at).getTime();
      if (Date.now() - createdAt < 60 * 1000) {
        const wait = Math.ceil((60 * 1000 - (Date.now() - createdAt)) / 1000);
        return res.status(429).json({ error: `验证码发送过于频繁，请 ${wait} 秒后重试`, retry_after: wait });
      }
    }

    const code = generateCode();
    await query(
      `INSERT INTO email_verification_codes (email, code_hash, purpose, expires_at, requested_ip)
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', $4)`,
      [email, hashCode(code), purpose, req.ip]
    );

    const lang = detectLangFromAcceptLanguage(req.headers['accept-language']);
    await sendVerificationCodeEmail(email, code, lang, purpose);
    return res.json({ success: true, message: '验证码已发送，请注意查收邮件', expires_in: 600 });
  } catch (error: any) {
    console.error('Web send code error:', error);
    return res.status(500).json({ error: error.message || '发送验证码失败' });
  }
});

router.post('/register', webAuthLimiter, loginLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''));
    const code = String(req.body?.code || '').trim();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirm_password || '');
    const agreed = Boolean(req.body?.agreed);
    if (!isValidEmail(email)) return res.status(400).json({ error: '请输入有效邮箱地址' });

    const { getMailServiceConfig } = await import('../services/email.service');
    const mailConfig = await getMailServiceConfig();
    if (mailConfig.enabled && !/^\d{6}$/.test(code)) return res.status(400).json({ error: '请输入 6 位邮箱验证码' });
    if (password.length < 8) return res.status(400).json({ error: '密码至少需要 8 位' });
    if (password !== confirmPassword) return res.status(400).json({ error: '两次输入的密码不一致' });
    if (!agreed) return res.status(400).json({ error: '请先同意相关协议' });

    const existingUser = await query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
    if (existingUser.rows.length > 0) return res.status(409).json({ error: '该邮箱已注册，请直接登录' });

    let codeRow: any = null;
    if (mailConfig.enabled) {
      const codeResult = await query(
        `SELECT id, code_hash, expires_at, used_at FROM email_verification_codes
         WHERE email = $1 AND purpose = 'register' ORDER BY created_at DESC LIMIT 1`, [email]
      );
      if (codeResult.rows.length === 0) return res.status(400).json({ error: '请先获取邮箱验证码' });
      codeRow = codeResult.rows[0];
      if (codeRow.used_at) return res.status(400).json({ error: '验证码已使用，请重新获取' });
      if (new Date(codeRow.expires_at).getTime() < Date.now()) return res.status(400).json({ error: '验证码已过期，请重新获取' });
      if (codeRow.code_hash !== hashCode(code)) return res.status(400).json({ error: '邮箱验证码错误' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const uniqueId = await generateUniqueUserId();
    const displayName = email.split('@')[0].slice(0, 32);

    const createdUser = await transaction(async (client) => {
      const insertResult = await client.query(
        `INSERT INTO users (
           telegram_id, email, password_hash, email_verified, register_type,
           first_name, language_code, wallet_balance, reward_balance, frozen_balance,
           red_packet_credits, unique_id
         ) VALUES (NULL, $1, $2, $3, 'email', $4, 'zh', 0, 0, 0, 3, $5)
         RETURNING id, email`,
        [email, passwordHash, mailConfig.enabled, displayName, uniqueId]
      );
      if (mailConfig.enabled && codeRow) {
        await client.query(`UPDATE email_verification_codes SET used_at = NOW() WHERE id = $1`, [codeRow.id]);
      }
      return insertResult.rows[0];
    });

    const profile = await buildWebProfile(createdUser.id);
    if (!profile) return res.status(500).json({ error: '注册成功，但读取用户信息失败' });
    return res.json({ success: true, token: signWebUserToken({ id: createdUser.id, email }), user: profile });
  } catch (error: any) {
    console.error('Web register error:', error);
    return res.status(500).json({ error: error.message || '注册失败' });
  }
});

router.post('/reset-password', webAuthLimiter, loginLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''));
    const code = String(req.body?.code || '').trim();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirm_password || '');
    if (!isValidEmail(email)) return res.status(400).json({ error: '请输入有效邮箱地址' });

    const { getMailServiceConfig } = await import('../services/email.service');
    const mailConfig = await getMailServiceConfig();
    if (!mailConfig.enabled) return res.status(400).json({ error: '邮件服务未启用，无法重置密码' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: '请输入 6 位邮箱验证码' });
    if (password.length < 8) return res.status(400).json({ error: '密码至少需要 8 位' });
    if (password !== confirmPassword) return res.status(400).json({ error: '两次输入的密码不一致' });

    const userResult = await query(`SELECT id, register_type FROM users WHERE email = $1 LIMIT 1`, [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: '该邮箱未注册' });
    if (userResult.rows[0].register_type !== 'email') return res.status(400).json({ error: '该账号不支持邮箱重置密码' });

    const codeResult = await query(
      `SELECT id, code_hash, expires_at, used_at FROM email_verification_codes
       WHERE email = $1 AND purpose = 'reset_password' ORDER BY created_at DESC LIMIT 1`, [email]
    );
    if (codeResult.rows.length === 0) return res.status(400).json({ error: '请先获取邮箱验证码' });
    const codeRow = codeResult.rows[0];
    if (codeRow.used_at) return res.status(400).json({ error: '验证码已使用，请重新获取' });
    if (new Date(codeRow.expires_at).getTime() < Date.now()) return res.status(400).json({ error: '验证码已过期，请重新获取' });
    if (codeRow.code_hash !== hashCode(code)) return res.status(400).json({ error: '邮箱验证码错误' });

    const passwordHash = await bcrypt.hash(password, 12);
    await transaction(async (client) => {
      await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, userResult.rows[0].id]);
      await client.query(`UPDATE email_verification_codes SET used_at = NOW() WHERE id = $1`, [codeRow.id]);
      await client.query(
        `UPDATE email_verification_codes SET used_at = NOW()
         WHERE email = $1 AND purpose = 'reset_password' AND used_at IS NULL AND id <> $2`,
        [email, codeRow.id]
      );
    });

    return res.json({ success: true, message: '密码已重置，请使用新密码登录' });
  } catch (error: any) {
    console.error('Web reset password error:', error);
    return res.status(500).json({ error: error.message || '重置密码失败' });
  }
});

router.post('/login', webAuthLimiter, loginLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''));
    const password = String(req.body?.password || '');
    if (!isValidEmail(email) || !password) return res.status(400).json({ error: '请输入邮箱和密码' });

    const result = await query(
      `SELECT id, email, password_hash FROM users WHERE email = $1 AND register_type = 'email' LIMIT 1`, [email]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: '邮箱或密码错误' });
    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash || '');
    if (!passwordValid) return res.status(401).json({ error: '邮箱或密码错误' });

    const profile = await buildWebProfile(user.id);
    if (!profile) return res.status(404).json({ error: '用户不存在' });
    return res.json({ success: true, token: signWebUserToken({ id: user.id, email: user.email }), user: profile });
  } catch (error: any) {
    console.error('Web login error:', error);
    return res.status(500).json({ error: error.message || '登录失败' });
  }
});

router.get('/me', webProfileLimiter, authenticateWebUser, async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const profile = await buildWebProfile(userId);
    if (!profile) return res.status(404).json({ error: '用户不存在' });
    return res.json({ success: true, user: profile });
  } catch (error: any) {
    console.error('Web me error:', error);
    return res.status(500).json({ error: error.message || '获取用户信息失败' });
  }
});

export default router;
