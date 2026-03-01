import express from 'express';
import { query } from '../db';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';

const router = express.Router();

/**
 * GET /api/miniapp/profile
 * Get user profile from Telegram initData
 */
router.get('/profile', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const tgUser = req.telegramUser;
    if (!tgUser) {
      return res.status(400).json({ error: 'No user in init data' });
    }

    const result = await query(
      `SELECT id, unique_id, balance, username, first_name, last_name, language_code
       FROM users WHERE telegram_id = $1`,
      [tgUser.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error: any) {
    console.error('MiniApp profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/miniapp/language
 * Update user language preference
 */
router.post('/language', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const { user_id, lang_code } = req.body;

    if (!user_id || !lang_code) {
      return res.status(400).json({ error: 'user_id and lang_code are required' });
    }

    await query(
      `UPDATE users SET language_code = $1 WHERE id = $2`,
      [lang_code, user_id]
    );

    res.json({ success: true, message: 'Language updated' });
  } catch (error: any) {
    console.error('Update language error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
