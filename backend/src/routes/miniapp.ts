import express from 'express';
import { query } from '../db';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';

const router = express.Router();

/**
 * GET /api/miniapp/profile
 * Get current user's profile (authenticated via Telegram initData)
 */
router.get('/profile', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await query(
      `SELECT id, unique_id, username, first_name, last_name, language_code,
              balance, telegram_id, wallet_balance, red_packet_credits,
              account_status
       FROM users WHERE telegram_id = $1 LIMIT 1`,
      [telegramId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch wallet_tip_message from system settings
    let walletTipMessage = '';
    try {
      const tipResult = await query(
        `SELECT value FROM system_settings WHERE key = 'wallet_tip_message' LIMIT 1`
      );
      walletTipMessage = tipResult.rows[0]?.value || '';
    } catch {/* non-critical */}

    const user = result.rows[0];
    res.json({
      success: true,
      user: {
        ...user,
        nft_balance: parseFloat(String(user.wallet_balance ?? 0)),
        red_packet_balance: parseFloat(String(user.red_packet_credits ?? 0)),
        wallet_tip_message: walletTipMessage,
      },
    });
  } catch (error: any) {
    console.error('Miniapp profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/miniapp/transactions
 * Get current user's transaction history
 */
router.get('/transactions', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    const userResult = await query(
      `SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`,
      [telegramId]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    const { limit = 50 } = req.query;
    const result = await query(
      `SELECT id, type, amount, balance_after, description, created_at
       FROM transactions WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, Number(limit)]
    );

    res.json({ success: true, transactions: result.rows });
  } catch (error: any) {
    console.error('Miniapp transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/miniapp/announcements
 * Get public announcements (optionally filtered by show_on_app_launch)
 */
router.get('/announcements', async (req, res) => {
  try {
    const { show_on_app_launch } = req.query;

    let queryText = `SELECT id, title, content, images, is_pinned, show_on_app_launch, created_at
                     FROM announcements WHERE status = 'sent'`;
    const params: any[] = [];

    if (show_on_app_launch === 'true') {
      queryText += ` AND show_on_app_launch = true`;
    }

    queryText += ` ORDER BY is_pinned DESC, created_at DESC LIMIT 20`;

    const result = await query(queryText, params);
    res.json({ success: true, announcements: result.rows });
  } catch (error: any) {
    console.error('Miniapp announcements error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/miniapp/language
 * Update user's language preference
 */
router.post('/language', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
    const { language_code, language } = req.body;
    const lang = language_code || language;
    if (!lang) return res.status(400).json({ error: 'language_code is required' });

    await query(
      `UPDATE users SET language_code = $1 WHERE telegram_id = $2`,
      [lang, telegramId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Miniapp language error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
