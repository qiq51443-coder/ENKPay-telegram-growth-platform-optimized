import express from 'express';
import axios from 'axios';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * POST /api/bot-auth/authorize
 * Authorize a new bot by providing its API token
 */
router.post('/authorize', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { token, default_language, welcome_message } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Bot token is required' });
    }

    // Validate token with Telegram API
    let botInfo: any;
    try {
      const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
      if (!response.data.ok) {
        return res.status(400).json({ error: 'Invalid bot token' });
      }
      botInfo = response.data.result;
    } catch (err) {
      return res.status(400).json({ error: 'Failed to validate bot token with Telegram API' });
    }

    // Check if bot already exists
    const existing = await query('SELECT id FROM bots WHERE token = $1', [token]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Bot already authorized' });
    }

    // Save bot to database
    const result = await query(
      `INSERT INTO bots (name, token, username, is_active, default_language, welcome_message)
       VALUES ($1, $2, $3, true, $4, $5)
       RETURNING id, name, username, is_active, default_language, created_at`,
      [
        botInfo.first_name,
        token,
        botInfo.username,
        default_language || 'en',
        welcome_message || null,
      ]
    );

    res.json({ bot: result.rows[0], telegram_info: botInfo });
  } catch (error) {
    console.error('Bot authorization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/bot-auth/groups
 * Get all authorized groups
 */
router.get('/groups', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { bot_id } = req.query;
    let queryText = `
      SELECT ag.*, b.name as bot_name, b.username as bot_username
      FROM authorized_groups ag
      JOIN bots b ON ag.bot_id = b.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (bot_id) {
      params.push(bot_id);
      queryText += ` AND ag.bot_id = $${params.length}`;
    }

    queryText += ' ORDER BY ag.joined_at DESC';

    const result = await query(queryText, params);
    res.json({ groups: result.rows });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/bot-auth/groups/:id
 * Remove an authorized group
 */
router.delete('/groups/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM authorized_groups WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
