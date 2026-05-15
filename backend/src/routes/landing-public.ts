import express from 'express';
import { query } from '../db';

const router = express.Router();

function parseSettingValue(raw: string): any {
  try { return JSON.parse(raw); } catch { return raw; }
}

/**
 * GET /api/landing/logo-icon
 * 重定向到当前品牌 Logo（从 system_settings 读取 landing_logo_url）
 * 供 favicon 使用，公开访问
 */
router.get('/logo-icon', async (_req, res) => {
  try {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'landing_logo_url' AND is_public = true LIMIT 1`,
      []
    );
    if (result.rows.length > 0) {
      const logoUrl = parseSettingValue(result.rows[0].value);
      if (logoUrl && typeof logoUrl === 'string' && logoUrl.trim()) {
        res.redirect(302, logoUrl);
        return;
      }
    }
    res.status(204).end();
  } catch (error: any) {
    console.error('[landing-public] logo-icon error:', error);
    res.status(204).end();
  }
});

/**
 * GET /api/landing/config
 * 公开接口，无需认证
 */
router.get('/config', async (_req, res) => {
  try {
    const settings: Record<string, any> = {};
    try {
      const settingsResult = await query(
        `SELECT key, value FROM system_settings WHERE category = 'landing' AND (is_public IS NULL OR is_public = true)`,
        []
      );
      for (const row of settingsResult.rows) {
        settings[row.key] = parseSettingValue(row.value);
      }
    } catch (settingsErr: any) {
      console.error('[landing-public] settings query error:', settingsErr.message);
    }

    const usersOverride   = Number(settings['landing_stat_users_override']   ?? 0);
    const nftOverride     = Number(settings['landing_stat_nft_override']      ?? 0);
    const charityOverride = Number(settings['landing_stat_charity_override']  ?? 0);
    const countries       = Number(settings['landing_stat_countries']         ?? 30);

    const [usersCount, nftCount, charitySum] = await Promise.all([
      usersOverride > 0
        ? Promise.resolve(usersOverride)
        : query('SELECT COUNT(*) AS cnt FROM users', [])
            .then(r => parseInt(r.rows[0].cnt, 10))
            .catch(() => 0),
      nftOverride > 0
        ? Promise.resolve(nftOverride)
        : query("SELECT COUNT(*) AS cnt FROM nft_products WHERE status NOT IN ('draft', 'off_shelf', 'inactive', 'sold_out')", [])
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

    const nftResult = await query(
      `SELECT id, name, image_url, product_type AS type, price,
              COALESCE(annual_yield_rate, daily_yield_rate * 365, 0) AS annual_yield,
              COALESCE(duration_days, term_days, 0) AS duration_days,
              COALESCE(description, '') AS description
       FROM nft_products
       WHERE status NOT IN ('draft', 'off_shelf', 'inactive', 'sold_out')
       ORDER BY created_at DESC LIMIT 6`, []
    ).catch((err: any) => { console.error('[landing-public] nftResult query error:', err.message); return { rows: [] as any[] }; });
    const charityResult = await query(
      `SELECT id, title, image_url, target_amount, raised_amount, progress_override, status,
              COALESCE(description, '') AS description
       FROM charity_projects
       WHERE (
         (status = 'active' AND (is_active IS NULL OR is_active = true))
         OR status = 'completed'
       )
         AND (show_in_app IS NULL OR show_in_app = true)
       ORDER BY created_at DESC LIMIT 3`, []
    ).catch((err: any) => { console.error('[landing-public] charityResult query error:', err.message); return { rows: [] as any[] }; });

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
      statsOverride: {
        users: usersOverride, nftProducts: nftOverride,
        charityTotal: charityOverride, countries,
      },
      stats: {
        users: usersCount, nftProducts: nftCount,
        charityTotal: charitySum, countries,
      },
      nftProducts: nftResult.rows.map((r: any) => ({
        id: r.id, name: r.name, imageUrl: r.image_url, type: r.type,
        price: parseFloat(r.price), annualYield: parseFloat(r.annual_yield ?? 0),
        durationDays: Number(r.duration_days) || 0,
        description: r.description,
      })),
      charityProjects: charityResult.rows.map((r: any) => {
        const target = parseFloat(r.target_amount) || 0;
        const raised = parseFloat(r.raised_amount) || 0;
        let progress = 0;
        if (r.status === 'completed') {
          progress = 100;
        } else if (r.progress_override != null) {
          const override = parseFloat(r.progress_override);
          if (!isNaN(override)) {
            progress = Math.min(100, Math.max(0, override));
          }
        } else if (target > 0) {
          progress = parseFloat(((raised / target) * 100).toFixed(1));
        }
        return {
          id: r.id, title: r.title, coverUrl: r.image_url,
          targetAmount: target, currentAmount: raised,
          status: r.status,
          progress,
          description: r.description,
        };
      }),
      socialLinks: Object.fromEntries(
        Object.entries({
          facebook:  settings['landing_social_facebook']  || null,
          tiktok:    settings['landing_social_tiktok']    || null,
          twitter:   settings['landing_social_twitter']   || null,
          telegram:  settings['landing_social_telegram']  || null,
          youtube:   settings['landing_social_youtube']   || null,
          instagram: settings['landing_social_instagram'] || null,
        }).filter(([_, v]) => v != null)
      ),
      contact: { telegram: settings['landing_contact_telegram'] ?? '' },
      legal: {
        privacy: {
          zh: settings['landing_privacy_zh'] ?? '', en: settings['landing_privacy_en'] ?? '',
          fr: settings['landing_privacy_fr'] ?? '', de: settings['landing_privacy_de'] ?? '',
          es: settings['landing_privacy_es'] ?? '', ar: settings['landing_privacy_ar'] ?? '',
          ja: settings['landing_privacy_ja'] ?? '',
        },
        terms: {
          zh: settings['landing_terms_zh'] ?? '', en: settings['landing_terms_en'] ?? '',
          fr: settings['landing_terms_fr'] ?? '', de: settings['landing_terms_de'] ?? '',
          es: settings['landing_terms_es'] ?? '', ar: settings['landing_terms_ar'] ?? '',
          ja: settings['landing_terms_ja'] ?? '',
        },
      },
    });
  } catch (error: any) {
    console.error('[landing-public] config error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
