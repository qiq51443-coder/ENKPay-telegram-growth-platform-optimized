import express from 'express';
import { query } from '../db';
import { logoUpload, nftUpload, charityUpload, miscUpload, toPublicUrl } from '../services/storage.service';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

const LANDING_LANGS = ['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja'] as const;
const SOCIAL_PLATFORMS = ['facebook', 'tiktok', 'twitter', 'telegram', 'youtube', 'instagram'] as const;

/** 解析 system_settings value 字段（JSON 字符串 → 原始值） */
function parseSettingValue(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * GET /api/landing/config
 * 公开接口，无需认证，为官网落地页提供所有配置数据
 */
router.get('/config', async (_req, res) => {
  try {
    // 1. 读取所有 landing 分类设置
    const settingsResult = await query(
      `SELECT key, value FROM system_settings WHERE category = 'landing' AND is_public = true`,
      []
    );
    const settings: Record<string, any> = {};
    for (const row of settingsResult.rows) {
      settings[row.key] = parseSettingValue(row.value);
    }

    // 2. 统计数据（支持 override）
    const usersOverride = Number(settings['landing_stat_users_override'] ?? 0);
    const nftOverride = Number(settings['landing_stat_nft_override'] ?? 0);
    const charityOverride = Number(settings['landing_stat_charity_override'] ?? 0);
    const countries = Number(settings['landing_stat_countries'] ?? 30);

    const [usersCount, nftCount, charitySum] = await Promise.all([
      usersOverride > 0
        ? Promise.resolve(usersOverride)
        : query('SELECT COUNT(*) AS cnt FROM users', [])
            .then(r => parseInt(r.rows[0].cnt, 10))
            .catch(() => 0),
      nftOverride > 0
        ? Promise.resolve(nftOverride)
        : query("SELECT COUNT(*) AS cnt FROM nft_products WHERE status IN ('active', 'on_sale')", [])
            .then(r => parseInt(r.rows[0].cnt, 10))
            .catch(() => 0),
      charityOverride > 0
        ? Promise.resolve(charityOverride)
        : query(
            `SELECT COALESCE(SUM(raised_amount), 0) AS total
             FROM charity_projects
             WHERE status IN ('active', 'completed')`,
            []
          )
            .then(r => parseFloat(r.rows[0].total) || 0)
            .catch(() => 0),
    ]);

    // 3. NFT 产品（最多6个，上架中，按时间倒序）
    const nftResult = await query(
      `SELECT id, name, image_url, type, price,
              COALESCE(annual_yield_rate, daily_yield_rate * 365, 0) AS annual_yield,
              description
       FROM nft_products
       WHERE status IN ('active', 'on_sale')
       ORDER BY created_at DESC
       LIMIT 6`,
      []
    ).catch((err: any) => { console.error('[landing] nftResult query error:', err.message); return { rows: [] as any[] }; });
    const nftProducts = nftResult.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      imageUrl: r.image_url,
      type: r.type,
      price: parseFloat(r.price),
      annualYield: parseFloat(r.annual_yield ?? 0),
      description: r.description,
    }));

    // 4. 公益项目（最多3个，活跃中，按时间倒序）
    const charityResult = await query(
      `SELECT id, title, image_url, target_amount, raised_amount
       FROM charity_projects
       WHERE status = 'active'
       ORDER BY created_at DESC
       LIMIT 3`,
      []
    ).catch((err: any) => { console.error('[landing] charityResult query error:', err.message); return { rows: [] as any[] }; });
    const charityProjects = charityResult.rows.map((r: any) => {
      const target = parseFloat(r.target_amount) || 0;
      const raised = parseFloat(r.raised_amount) || 0;
      const progress = target > 0 ? parseFloat(((raised / target) * 100).toFixed(1)) : 0;
      return {
        id: r.id,
        title: r.title,
        coverUrl: r.image_url,
        targetAmount: target,
        currentAmount: raised,
        progress,
      };
    });

    // 5. 组装响应
    res.json({
      brand: {
        name: settings['landing_brand_name'] ?? 'ENKPay',
        logoUrl: settings['landing_logo_url'] ?? '',
      },
      slogans: {
        zh: settings['landing_slogan_zh'] ?? '',
        en: settings['landing_slogan_en'] ?? '',
        fr: settings['landing_slogan_fr'] ?? '',
        de: settings['landing_slogan_de'] ?? '',
        es: settings['landing_slogan_es'] ?? '',
        ar: settings['landing_slogan_ar'] ?? '',
        ja: settings['landing_slogan_ja'] ?? '',
      },
      stats: {
        users: usersCount,
        nftProducts: nftCount,
        charityTotal: charitySum,
        countries,
      },
      nftProducts,
      charityProjects,
      socialLinks: {
        facebook:  settings['landing_social_facebook']  ?? '',
        tiktok:    settings['landing_social_tiktok']    ?? '',
        twitter:   settings['landing_social_twitter']   ?? '',
        telegram:  settings['landing_social_telegram']  ?? '',
        youtube:   settings['landing_social_youtube']   ?? '',
        instagram: settings['landing_social_instagram'] ?? '',
      },
      contact: {
        telegram: settings['landing_contact_telegram'] ?? '',
      },
      legal: {
        privacy: {
          zh: settings['landing_privacy_zh'] ?? '',
          en: settings['landing_privacy_en'] ?? '',
          fr: settings['landing_privacy_fr'] ?? '',
          de: settings['landing_privacy_de'] ?? '',
          es: settings['landing_privacy_es'] ?? '',
          ar: settings['landing_privacy_ar'] ?? '',
          ja: settings['landing_privacy_ja'] ?? '',
        },
        terms: {
          zh: settings['landing_terms_zh'] ?? '',
          en: settings['landing_terms_en'] ?? '',
          fr: settings['landing_terms_fr'] ?? '',
          de: settings['landing_terms_de'] ?? '',
          es: settings['landing_terms_es'] ?? '',
          ar: settings['landing_terms_ar'] ?? '',
          ja: settings['landing_terms_ja'] ?? '',
        },
      },
    });
  } catch (error: any) {
    console.error('[landing] config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/landing/upload-logo
 * 上传品牌 Logo
 * 需要管理员认证（JWT）
 * 请求：multipart/form-data，字段名 "logo"
 * 响应：{ logoUrl: "/uploads/logos/uuid.png", message: "..." }
 */
router.post(
  '/upload-logo',
  authenticateAdmin,
  logoUpload.single('logo'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '请选择要上传的图片文件' });
      }

      // 转换为公开访问 URL
      const logoUrl = toPublicUrl(req.file.path);

      // 更新 system_settings 中的 landing_logo_url
      await query(
        `UPDATE system_settings
         SET value = $1, updated_at = NOW()
         WHERE key = 'landing_logo_url'`,
        [JSON.stringify(logoUrl)]
      );

      res.json({
        logoUrl,
        message: 'Logo 上传成功',
      });
    } catch (error: any) {
      console.error('Upload logo error:', error);
      // multer 文件类型/大小错误
      if (error.message?.includes('不支持') || error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: error.message || '文件过大，Logo 最大 2MB' });
      }
      res.status(500).json({ error: '上传失败，请重试' });
    }
  }
);

/**
 * POST /api/admin/landing/upload-image
 * 通用图片上传（NFT封面、公益封面等）
 * 需要管理员认证（JWT）
 * 请求：multipart/form-data
 *   - 字段 "image"：图片文件
 *   - 查询参数 "category"：分类，可选值 "nft" | "charity" | "misc"（默认 misc）
 * 响应：{ imageUrl: "/uploads/{category}/uuid.png", message: "..." }
 */
router.post(
  '/upload-image',
  authenticateAdmin,
  (req, res, next) => {
    // category is read from query string (req.body is not yet populated before multer runs)
    const category = (req.query?.category as string) || 'misc';
    const validCategories = ['nft', 'charity', 'misc'];
    if (!validCategories.includes(category)) {
      res.status(400).json({ error: `无效的分类 "${category}"，允许值：nft / charity / misc` });
      return;
    }
    let upload;
    if (category === 'nft') upload = nftUpload;
    else if (category === 'charity') upload = charityUpload;
    else upload = miscUpload;
    upload.single('image')(req, res, next);
  },
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '请选择要上传的图片文件' });
      }
      const imageUrl = toPublicUrl(req.file.path);
      res.json({
        imageUrl,
        message: '图片上传成功',
      });
    } catch (error: any) {
      console.error('Upload image error:', error);
      if (error.message?.includes('不支持') || error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: error.message || '文件过大，最大 5MB' });
      }
      res.status(500).json({ error: '上传失败，请重试' });
    }
  }
);

/**
 * PUT /api/admin/landing/brand
 * 保存品牌设置（品牌名 + 7语言 Slogan + 统计覆盖值）
 * 需要管理员认证
 */
router.put('/brand', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { brandName, slogans, statsOverride } = req.body;

    const updates: Array<{ key: string; value: any }> = [];

    if (brandName !== undefined) {
      updates.push({ key: 'landing_brand_name', value: brandName });
    }

    if (slogans && typeof slogans === 'object') {
      for (const lang of LANDING_LANGS) {
        if (slogans[lang] !== undefined) {
          updates.push({ key: `landing_slogan_${lang}`, value: slogans[lang] });
        }
      }
    }

    if (statsOverride && typeof statsOverride === 'object') {
      if (statsOverride.users !== undefined)
        updates.push({ key: 'landing_stat_users_override', value: String(statsOverride.users) });
      if (statsOverride.nftProducts !== undefined)
        updates.push({ key: 'landing_stat_nft_override', value: String(statsOverride.nftProducts) });
      if (statsOverride.charityTotal !== undefined)
        updates.push({ key: 'landing_stat_charity_override', value: String(statsOverride.charityTotal) });
      if (statsOverride.countries !== undefined)
        updates.push({ key: 'landing_stat_countries', value: String(statsOverride.countries) });
    }

    for (const { key, value } of updates) {
      await query(
        `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = $2`,
        [JSON.stringify(value), key]
      );
    }

    res.json({ message: '品牌设置保存成功', updated: updates.length });
  } catch (error: any) {
    console.error('[landing] save brand error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/landing/social
 * 保存社交媒体链接 + 联系 Telegram 用户名
 * 需要管理员认证
 */
router.put('/social', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { socialLinks, contactTelegram } = req.body;

    const updates: Array<{ key: string; value: string }> = [];

    if (socialLinks && typeof socialLinks === 'object') {
      for (const platform of SOCIAL_PLATFORMS) {
        if (socialLinks[platform] !== undefined) {
          updates.push({ key: `landing_social_${platform}`, value: socialLinks[platform] });
        }
      }
    }

    if (contactTelegram !== undefined) {
      const clean = String(contactTelegram).replace(/^@/, '');
      updates.push({ key: 'landing_contact_telegram', value: clean });
    }

    for (const { key, value } of updates) {
      await query(
        `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = $2`,
        [JSON.stringify(value), key]
      );
    }

    res.json({ message: '社交设置保存成功', updated: updates.length });
  } catch (error: any) {
    console.error('[landing] save social error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/landing/privacy/translate
 * 翻译隐私政策并保存 7 种语言到 system_settings
 * 需要管理员认证
 */
router.post('/privacy/translate', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { text } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: '请输入隐私政策内容' });
    }

    const { translateToAllLangs } = await import('../utils/translate');
    const translations = await translateToAllLangs(String(text)) as Record<string, string>;

    for (const lang of LANDING_LANGS) {
      if (translations[lang] !== undefined) {
        await query(
          `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = $2`,
          [JSON.stringify(translations[lang]), `landing_privacy_${lang}`]
        );
      }
    }

    res.json({ translations, message: '隐私政策翻译并保存成功' });
  } catch (error: any) {
    console.error('[landing] privacy translate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/landing/terms/translate
 * 翻译服务条款并保存 7 种语言到 system_settings
 * 需要管理员认证
 */
router.post('/terms/translate', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { text } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: '请输入服务条款内容' });
    }

    const { translateToAllLangs } = await import('../utils/translate');
    const translations = await translateToAllLangs(String(text)) as Record<string, string>;

    for (const lang of LANDING_LANGS) {
      if (translations[lang] !== undefined) {
        await query(
          `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = $2`,
          [JSON.stringify(translations[lang]), `landing_terms_${lang}`]
        );
      }
    }

    res.json({ translations, message: '服务条款翻译并保存成功' });
  } catch (error: any) {
    console.error('[landing] terms translate error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
