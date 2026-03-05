import express from 'express';
import { query } from '../db';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';

const router = express.Router();

/**
 * POST /api/profile/language
 * Update user's preferred language (mini-app global language sync)
 */
router.post('/language', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
    const { language_code, language } = req.body;
    const lang = language_code || language;
    if (!lang) return res.status(400).json({ error: 'language is required' });

    await query(
      `UPDATE users SET language_code = $1 WHERE telegram_id = $2`,
      [lang, telegramId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Profile language error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
