import express from 'express';
import { query } from '../db';

const router = express.Router();

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
        : query('SELECT COUNT(*) AS cnt FROM users', []).then(r => parseInt(r.rows[0].cnt, 10)),
      nftOverride > 0
        ? Promise.resolve(nftOverride)
        : query('SELECT COUNT(*) AS cnt FROM nft_products WHERE is_active = true', []).then(r => parseInt(r.rows[0].cnt, 10)),
      charityOverride > 0
        ? Promise.resolve(charityOverride)
        : query(`SELECT COALESCE(SUM(amount), 0) AS total FROM charity_donations WHERE status = 'completed'`, []).then(r => parseFloat(r.rows[0].total)),
    ]);

    // 3. NFT 产品（最多6个，上架中，按时间倒序）
    const nftResult = await query(
      `SELECT id, name, image_url, type, price, annual_yield, description
       FROM nft_products
       WHERE is_active = true
       ORDER BY created_at DESC
       LIMIT 6`,
      []
    );
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
    );
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

export default router;
