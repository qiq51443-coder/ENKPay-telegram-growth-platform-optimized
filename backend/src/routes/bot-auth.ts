import express from 'express';
import axios from 'axios';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Apply rate limiting to all bot-auth routes
router.use(adminLimiter);

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
 * POST /api/bot-auth/groups/register
 * Register a group when the bot is added to it (called by the bot process)
 */
router.post('/groups/register', async (req, res) => {
  try {
    const { bot_id, group_id, group_name, group_type, country, language, member_count } = req.body;
    const normalizedMemberCount = Number.isFinite(Number(member_count)) ? Number(member_count) : null;

    if (!bot_id || !group_id) {
      return res.status(400).json({ error: 'bot_id and group_id are required' });
    }

    // Verify bot_id exists and is active to prevent unauthorized registration
    const botCheck = await query('SELECT id FROM bots WHERE id = $1 AND is_active = true', [bot_id]);
    if (botCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or inactive bot_id' });
    }

    // If X-Bot-Id header is present, verify it matches the body bot_id
    const headerBotId = req.headers['x-bot-id'];
    if (headerBotId && headerBotId !== bot_id) {
      return res.status(403).json({ error: 'bot_id mismatch' });
    }

    // Handle bot leaving/being kicked — mark group as inactive
    if (req.body.is_leaving === true) {
      await query(
        `UPDATE authorized_groups SET is_active = false, updated_at = NOW()
         WHERE bot_id = $1 AND group_id = $2`,
        [bot_id, group_id]
      );
      return res.json({ success: true, action: 'deactivated' });
    }

    // Upsert the group
    await query(
      `INSERT INTO authorized_groups (
         bot_id, group_id, group_name, group_type, country, language, member_count, member_count_updated_at, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 IS NULL THEN NULL ELSE NOW() END, true)
       ON CONFLICT (bot_id, group_id)
       DO UPDATE SET group_name = EXCLUDED.group_name,
         is_active = true,
         updated_at = NOW(),
         country = COALESCE(EXCLUDED.country, authorized_groups.country),
         language = COALESCE(EXCLUDED.language, authorized_groups.language),
         member_count = COALESCE(EXCLUDED.member_count, authorized_groups.member_count),
         member_count_updated_at = CASE
           WHEN EXCLUDED.member_count IS NULL THEN authorized_groups.member_count_updated_at
           ELSE NOW()
         END`,
      [bot_id, group_id, group_name || '', group_type || 'group', country || null, language || null, normalizedMemberCount]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Register group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/bot-auth/groups/manual-register
 * Allow admins to manually register a group that was not auto-synced
 */
router.post('/groups/manual-register', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { bot_id, group_id, group_name, group_type, country, language } = req.body;

    if (!bot_id || !group_id) {
      return res.status(400).json({ error: 'bot_id and group_id are required' });
    }

    // Verify bot_id exists
    const botCheck = await query('SELECT id FROM bots WHERE id = $1 AND is_active = true', [bot_id]);
    if (botCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid or inactive bot_id' });
    }

    // Upsert the group
    await query(
      `INSERT INTO authorized_groups (bot_id, group_id, group_name, group_type, country, language, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (bot_id, group_id)
       DO UPDATE SET group_name = EXCLUDED.group_name,
         is_active = true,
         updated_at = NOW(),
         country = COALESCE(EXCLUDED.country, authorized_groups.country),
         language = COALESCE(EXCLUDED.language, authorized_groups.language)`,
      [bot_id, group_id, group_name || '', group_type || 'group', country || null, language || null]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Manual register group error:', error);
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
