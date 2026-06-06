import express from 'express';
import { timingSafeEqual } from 'crypto';
import { query } from '../db';
import { authenticateAdmin, requireRoles, AuthRequest } from '../middleware/auth';
import { logAuditAction, AuditActions } from '../utils/audit';
import { adminLimiter } from '../middleware/rateLimiter';
import { translateToAllLangs } from '../utils/translate';
import { inviteUpload, miniappBgUpload, toPublicUrl } from '../services/storage.service';
import { MINIAPP_BG_EMPTY_CONFIG, normalizeMiniAppBgConfig } from '../services/miniapp-bg.service';
import { invalidateBotMessageEmojiConfigCache } from '../utils/emoji-config';
import { invalidateAnimatedEmojiCache } from '../utils/animated-emojis';

const router = express.Router();

/**
 * GET /admin/system-settings/bot/invite
 * Bot-internal endpoint: returns all invite-category settings that are marked
 * is_public = true.  Does NOT require an admin token; instead it accepts an
 * optional x-bot-token / Bearer token that must match BOT_INTERNAL_TOKEN or
 * BOT_API_KEY when either of those env-vars is set.
 *
 * IMPORTANT: this route is registered BEFORE adminLimiter so that Bot requests
 * (which all originate from a single IP) are not subject to the 60 req/min
 * rate limit that applies to the admin panel routes.
 */
router.get('/bot/invite', async (req, res) => {
  try {
    const authHeader = (req.headers['authorization'] as string) || '';
    const xBotToken = (req.headers['x-bot-token'] as string) || '';
    const token = xBotToken || authHeader.replace('Bearer ', '');
    const validToken = process.env.BOT_INTERNAL_TOKEN || process.env.BOT_API_KEY || '';

    if (validToken) {
      // Use constant-time comparison to prevent timing-based token enumeration
      const maxLen = Math.max(token.length, validToken.length);
      const a = Buffer.from(token.padEnd(maxLen));
      const b = Buffer.from(validToken.padEnd(maxLen));
      if (!timingSafeEqual(a, b)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const result = await query(
      `SELECT key, value FROM system_settings WHERE category = 'invite' AND is_public = true`
    );

    const settings: Record<string, any> = {};
    for (const row of result.rows) {
      try {
        settings[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      } catch {
        settings[row.key] = row.value;
      }
    }

    res.json(settings);
  } catch (error: any) {
    console.error('Bot invite settings read error:', error);
    if (error.code === '42P01') return res.json({});
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Apply rate limiting to all admin system settings routes (registered after /bot/invite)
router.use(adminLimiter);

/**
 * Ensure a value is always stored as a valid JSON string in the database.
 * The system_settings.value column may be JSONB or TEXT; in either case we
 * must never write a bare empty string, as PostgreSQL JSONB cannot parse it.
 */
function toJsonValue(value: any): string {
  if (value === undefined || value === null) return '""';
  if (typeof value === 'string') {
    if (value === '') return '""';
    // Already valid JSON – pass through unchanged
    try { JSON.parse(value); return value; } catch {}
    // Plain string – wrap as a JSON string literal
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

/**
 * GET /admin/system-settings
 * Get all system settings or filter by category
 */
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { category, is_public } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(category);
    }

    if (is_public !== undefined) {
      conditions.push(`is_public = $${paramIndex++}`);
      params.push(is_public === 'true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT 
        ss.key, 
        ss.value, 
        ss.description, 
        ss.category, 
        ss.is_public, 
        ss.updated_at,
        ss.updated_by,
        au.username as updated_by_username
       FROM system_settings ss
       LEFT JOIN admin_users au ON ss.updated_by = au.id
       ${whereClause}
       ORDER BY ss.category, ss.key`,
      params
    );

    res.json({ settings: result.rows });
  } catch (error: any) {
    console.error('Get system settings error:', error);
    // If the table doesn't exist yet, return empty settings instead of 500
    if (error.code === '42P01') {
      return res.json({ settings: [] });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/system-settings/categories/list
 * Get list of all categories
 */
router.get('/categories/list', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT category 
       FROM system_settings 
       WHERE category IS NOT NULL
       ORDER BY category`
    );

    res.json({ categories: result.rows.map(row => row.category) });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/system-settings/:key
 * Get a specific system setting by key
 */
router.get('/:key', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;

    const result = await query(
      `SELECT 
        ss.key, 
        ss.value, 
        ss.description, 
        ss.category, 
        ss.is_public, 
        ss.updated_at,
        ss.updated_by,
        au.username as updated_by_username
       FROM system_settings ss
       LEFT JOIN admin_users au ON ss.updated_by = au.id
       WHERE ss.key = $1`,
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ setting: result.rows[0] });
  } catch (error: any) {
    console.error('Get system setting error:', error);
    // If the table doesn't exist yet, treat as not found
    if (error.code === '42P01') {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /admin/system-settings/:key
 * Update a specific system setting
 */
router.put('/:key', authenticateAdmin, requireRoles(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {

    const { key } = req.params;
    const { value, description, category, is_public } = req.body;

    // Check if setting exists
    const existing = await query(
      'SELECT key, value FROM system_settings WHERE key = $1',
      [key]
    );

    if (existing.rows.length === 0) {
      const insertResult = await query(
        `INSERT INTO system_settings (key, value, description, category, is_public, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          key,
          toJsonValue(value),
          description || null,
          category || null,
          is_public ?? false,
          req.user?.id,
        ]
      );

      await logAuditAction({
        adminUserId: req.user!.id,
        action: AuditActions.UPDATE_SETTINGS,
        resourceType: 'system_setting',
        resourceId: key,
        details: {
          key,
          old_value: null,
          new_value: value,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      if (key === 'bot_message_emoji_config') {
        invalidateBotMessageEmojiConfigCache();
        invalidateAnimatedEmojiCache();
      }

      return res.json({
        setting: insertResult.rows[0],
        message: 'Setting created successfully',
      });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (value !== undefined) {
      params.push(toJsonValue(value));
      updates.push(`value = $${paramIndex++}`);
    }

    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${paramIndex++}`);
    }

    if (category !== undefined) {
      params.push(category);
      updates.push(`category = $${paramIndex++}`);
    }

    if (is_public !== undefined) {
      params.push(is_public);
      updates.push(`is_public = $${paramIndex++}`);
    }

    // Always update updated_by and updated_at
    params.push(req.user?.id);
    updates.push(`updated_by = $${paramIndex++}`);
    updates.push(`updated_at = NOW()`);

    params.push(key);

    const result = await query(
      `UPDATE system_settings 
       SET ${updates.join(', ')}
       WHERE key = $${paramIndex}
       RETURNING *`,
      params
    );

    // Log audit action
    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.UPDATE_SETTINGS,
      resourceType: 'system_setting',
      resourceId: key,
      details: {
        key,
        old_value: existing.rows[0].value,
        new_value: value,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (key === 'bot_message_emoji_config') {
      invalidateBotMessageEmojiConfigCache();
      invalidateAnimatedEmojiCache();
    }

    res.json({
      setting: result.rows[0],
      message: 'Setting updated successfully',
    });
  } catch (error) {
    console.error('Update system setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/system-settings
 * Create a new system setting
 */
router.post('/', authenticateAdmin, requireRoles(['super_admin']), async (req: AuthRequest, res) => {
  try {

    const { key, value, description, category, is_public = false } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    // Check if setting already exists
    const existing = await query(
      'SELECT key FROM system_settings WHERE key = $1',
      [key]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Setting already exists' });
    }

    const result = await query(
      `INSERT INTO system_settings (key, value, description, category, is_public, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        key,
        toJsonValue(value),
        description,
        category,
        is_public,
        req.user?.id,
      ]
    );

    // Log audit action
    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.UPDATE_SETTINGS,
      resourceType: 'system_setting',
      resourceId: key,
      details: { key, value },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (key === 'bot_message_emoji_config') {
      invalidateBotMessageEmojiConfigCache();
      invalidateAnimatedEmojiCache();
    }

    res.json({
      setting: result.rows[0],
      message: 'Setting created successfully',
    });
  } catch (error) {
    console.error('Create system setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/system-settings/bulk-update
 * Bulk update multiple system settings
 */
router.post('/bulk-update', authenticateAdmin, requireRoles(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {

    const { settings } = req.body;

    if (!Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json({ error: 'Settings array is required' });
    }

    const updated: any[] = [];
    const errors: any[] = [];

    for (const setting of settings) {
      try {
        const { key, value } = setting;

        if (!key || value === undefined) {
          errors.push({ key, error: 'Key and value are required' });
          continue;
        }

        const result = await query(
          `UPDATE system_settings 
           SET value = $1, updated_by = $2, updated_at = NOW()
           WHERE key = $3
           RETURNING *`,
          [toJsonValue(value), req.user?.id, key]
        );

        if (result.rows.length === 0) {
          errors.push({ key, error: 'Setting not found' });
        } else {
          updated.push(result.rows[0]);
        }
      } catch (error: any) {
        errors.push({ key: setting.key, error: error.message });
      }
    }

    // Log audit action
    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.BULK_UPDATE_SETTINGS,
      resourceType: 'system_setting',
      details: {
        updated_count: updated.length,
        error_count: errors.length,
        settings: settings.map(s => s.key),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      updated,
      errors,
      message: `Updated ${updated.length} settings, ${errors.length} errors`,
    });
  } catch (error) {
    console.error('Bulk update system settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/system-settings/invite-card/upload
 * Upload invite card image (JPG, PNG, GIF, WebP), max 10 MB.
 * Saves the public URL to system_settings key = 'invite_card_image'.
 */
router.post(
  '/invite-card/upload',
  authenticateAdmin,
  requireRoles(['super_admin', 'admin']),
  inviteUpload.single('image'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '请选择要上传的图片文件' });
      }

      const url = toPublicUrl(req.file.path);

      await query(
        `INSERT INTO system_settings (key, value, description, category, is_public, updated_by, updated_at)
         VALUES ('invite_card_image', $1, '邀请卡图片 URL', 'invite', true, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [JSON.stringify(url), req.user?.id]
      );

      await logAuditAction({
        adminUserId: req.user!.id,
        action: AuditActions.UPDATE_SETTINGS,
        resourceType: 'system_setting',
        resourceId: 'invite_card_image',
        details: { url },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ url, message: '邀请卡图片上传成功' });
    } catch (error: any) {
      console.error('Upload invite card image error:', error);
      if (error.message?.includes('不支持') || error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: error.message || '文件过大，最大 10MB' });
      }
      res.status(500).json({ error: '上传失败，请重试' });
    }
  }
);

/**
 * POST /admin/system-settings/miniapp-bg/upload
 * 上传迷你 App 背景图片（JPG/PNG/GIF/WebP），最大 10MB
 */
router.post(
  '/miniapp-bg/upload',
  authenticateAdmin,
  requireRoles(['super_admin', 'admin']),
  miniappBgUpload.single('image'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '请选择要上传的图片文件' });
      }
      const url = toPublicUrl(req.file.path);
      res.json({ url, message: '迷你APP背景图片上传成功' });
    } catch (error: any) {
      console.error('Upload miniapp bg image error:', error);
      if (error.message?.includes('不支持') || error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: error.message || '文件过大，最大 10MB' });
      }
      res.status(500).json({ error: '上传失败，请重试' });
    }
  }
);

/**
 * GET /admin/system-settings/miniapp-bg/groups
 * 获取迷你 App 背景分组配置
 */
router.get(
  '/miniapp-bg/groups',
  authenticateAdmin,
  requireRoles(['super_admin', 'admin']),
  async (_req: AuthRequest, res) => {
    try {
      const result = await query(
        `SELECT value FROM system_settings WHERE key = 'miniapp_bg_groups' LIMIT 1`
      );
      const rawValue = result.rows[0]?.value;
      const config = rawValue ? normalizeMiniAppBgConfig(rawValue) : MINIAPP_BG_EMPTY_CONFIG;
      res.json(config);
    } catch (error: any) {
      console.error('Get miniapp bg groups error:', error);
      if (error.code === '42P01') return res.json(MINIAPP_BG_EMPTY_CONFIG);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /admin/system-settings/miniapp-bg/groups
 * 保存迷你 App 背景分组配置（整包覆盖）
 */
router.post(
  '/miniapp-bg/groups',
  authenticateAdmin,
  requireRoles(['super_admin', 'admin']),
  async (req: AuthRequest, res) => {
    try {
      const payload = normalizeMiniAppBgConfig(req.body || {});
      await query(
        `INSERT INTO system_settings (key, value, description, category, is_public, updated_by, updated_at)
         VALUES ('miniapp_bg_groups', $1, '迷你App背景图片分组配置', 'miniapp', true, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           is_public = EXCLUDED.is_public,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [toJsonValue(payload), req.user?.id]
      );

      await logAuditAction({
        adminUserId: req.user!.id,
        action: AuditActions.UPDATE_SETTINGS,
        resourceType: 'system_setting',
        resourceId: 'miniapp_bg_groups',
        details: {
          group_count: payload.groups.length,
          rotation: payload.rotation,
          current_group_id: payload.current_group_id,
          rotation_start: payload.rotation_start,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ config: payload, message: '迷你APP背景设置保存成功' });
    } catch (error) {
      console.error('Save miniapp bg groups error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /admin/system-settings/invite-message/translate-and-save
 * Translate invite message text to all supported languages and save to system_settings.
 */
const INVITE_LANG_DESCRIPTIONS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ar: 'العربية',
  ja: '日本語',
};

router.post('/invite-message/translate-and-save', authenticateAdmin, requireRoles(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { text } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const translations = await translateToAllLangs(String(text));

    const savedKeys: string[] = [];

    for (const [lang, translated] of Object.entries(translations)) {
      const settingKey = `invite_message_${lang}`;
      const description = INVITE_LANG_DESCRIPTIONS[lang] || lang;

      await query(
        `INSERT INTO system_settings (key, value, description, category, is_public, updated_by, updated_at)
         VALUES ($1, $2, $3, 'invite', true, $4, NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           description = EXCLUDED.description,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [settingKey, toJsonValue(translated), description, req.user?.id]
      );

      savedKeys.push(settingKey);
    }

    const translationsMap = translations as Record<string, string>;
    const defaultText = translationsMap['en'] || translationsMap['zh'] || String(text);
    await query(
      `INSERT INTO system_settings (key, value, description, category, is_public, updated_by, updated_at)
       VALUES ('invite_message', $1, '邀请语（默认）', 'invite', true, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [toJsonValue(defaultText), req.user?.id]
    );

    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.UPDATE_SETTINGS,
      resourceType: 'system_setting',
      details: {
        keys: savedKeys,
        source_text_length: String(text).length,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      translations,
      saved_keys: savedKeys,
      message: '邀请语翻译并保存成功',
    });
  } catch (error) {
    console.error('Translate and save invite message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/system-settings/user-agreement/translate-and-save
 * Translate user agreement text to all supported languages and save to system_settings
 */
const AGREEMENT_LANG_DESCRIPTIONS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ar: 'العربية',
  ja: '日本語',
};

router.post('/user-agreement/translate-and-save', authenticateAdmin, requireRoles(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {
    const { text } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const translations = await translateToAllLangs(String(text));

    const savedKeys: string[] = [];

    for (const [lang, translated] of Object.entries(translations)) {
      const settingKey = `user_agreement_${lang}`;
      const description = AGREEMENT_LANG_DESCRIPTIONS[lang] || lang;

      await query(
        `INSERT INTO system_settings (key, value, description, category, is_public, updated_by, updated_at)
         VALUES ($1, $2, $3, 'general', true, $4, NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           is_public = EXCLUDED.is_public,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [settingKey, toJsonValue(translated), description, req.user?.id]
      );

      savedKeys.push(settingKey);
    }

    // Extra write: save bare 'user_agreement' key for backward compatibility
    // (Mini App reads /settings/public/user_agreement without a lang suffix)
    const defaultText = (translations as Record<string, string>)['en'] || (translations as Record<string, string>)['zh'] || String(text);
    await query(
      `INSERT INTO system_settings (key, value, description, category, is_public, updated_by, updated_at)
       VALUES ('user_agreement', $1, '用户协议内容（默认）', 'general', true, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [toJsonValue(defaultText), req.user?.id]
    );

    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.UPDATE_SETTINGS,
      resourceType: 'system_setting',
      details: {
        keys: savedKeys,
        source_text_length: String(text).length,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      translations,
      saved_keys: savedKeys,
      message: '用户协议翻译并保存成功',
    });
  } catch (error) {
    console.error('Translate and save user agreement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /admin/system-settings/:key
 * Delete a system setting
 */
router.delete('/:key', authenticateAdmin, requireRoles(['super_admin']), async (req: AuthRequest, res) => {
  try {

    const { key } = req.params;

    const result = await query(
      'DELETE FROM system_settings WHERE key = $1 RETURNING *',
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.UPDATE_SETTINGS,
      resourceType: 'system_setting',
      resourceId: key,
      details: { key, deleted: true },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'Setting deleted successfully',
    });
  } catch (error) {
    console.error('Delete system setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
