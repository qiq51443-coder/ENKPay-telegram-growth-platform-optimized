import express from 'express';
import axios from 'axios';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

router.use(adminLimiter);
router.use(authenticateAdmin);

router.get('/', async (_req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, bot_name, username, is_active, created_at
       FROM strategy_bots
       ORDER BY created_at DESC`,
      []
    );
    res.json({ bots: result.rows });
  } catch (error) {
    console.error('Get strategy bots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid bot token format' });
    }

    let botInfo: any;
    try {
      // Token is validated by regex above — safe to embed directly.
      // encodeURIComponent would encode `:` as `%3A` which Telegram rejects.
      const telegramUrl = `https://api.telegram.org/bot${token}/getMe`;
      const response = await axios.get(telegramUrl, { timeout: 15000 });
      if (!response.data?.ok) {
        return res.status(400).json({ error: 'Invalid bot token' });
      }
      botInfo = response.data.result;
    } catch (err: any) {
      const detail = err?.response?.data?.description || err?.message || 'unknown error';
      return res.status(400).json({ error: `Failed to validate bot token with Telegram API: ${detail}` });
    }

    const existing = await query('SELECT id FROM strategy_bots WHERE bot_token = $1', [token]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Bot already authorized' });
    }

    const created = await query(
      `INSERT INTO strategy_bots (bot_token, bot_name, username, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, bot_name, username, is_active, created_at`,
      [token, botInfo.first_name || null, botInfo.username || null]
    );

    res.json({ bot: created.rows[0] });
  } catch (error) {
    console.error('Create strategy bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active(boolean) is required' });
    }

    const updated = await query(
      `UPDATE strategy_bots
       SET is_active = $1
       WHERE id = $2
       RETURNING id, bot_name, username, is_active, created_at`,
      [is_active, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Strategy bot not found' });
    }

    res.json({ bot: updated.rows[0] });
  } catch (error) {
    console.error('Update strategy bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const deleted = await query('DELETE FROM strategy_bots WHERE id = $1 RETURNING id', [id]);
    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: 'Strategy bot not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete strategy bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/groups', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, strategy_bot_id, chat_id, chat_title, language, is_active, joined_at
       FROM strategy_bot_groups
       WHERE strategy_bot_id = $1
       ORDER BY joined_at DESC`,
      [id]
    );
    res.json({ groups: result.rows });
  } catch (error) {
    console.error('Get strategy bot groups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/groups', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const chatId = String(req.body?.chat_id || '').trim();
    const chatTitle = req.body?.chat_title ? String(req.body.chat_title).trim() : null;
    const language = req.body?.language ? String(req.body.language).trim().toLowerCase() : null;

    if (!chatId) {
      return res.status(400).json({ error: 'chat_id is required' });
    }
    // Accept both -100xxx (supergroup) and regular negative IDs
    if (!/^-\d+$/.test(chatId)) {
      return res.status(400).json({ error: 'chat_id must be a negative number (e.g. -1001234567890)' });
    }

    const inserted = await query(
      `INSERT INTO strategy_bot_groups (strategy_bot_id, chat_id, chat_title, language, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (strategy_bot_id, chat_id)
       DO UPDATE SET
         chat_title = EXCLUDED.chat_title,
         language = EXCLUDED.language,
         is_active = true
       RETURNING id, strategy_bot_id, chat_id, chat_title, language, is_active, joined_at`,
      [id, chatId, chatTitle, language]
    );

    res.json({ group: inserted.rows[0] });
  } catch (error) {
    console.error('Create strategy bot group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/groups/:groupId', async (req: AuthRequest, res) => {
  try {
    const { id, groupId } = req.params;
    const values: any[] = [];
    const sets: string[] = [];

    if (req.body?.chat_title !== undefined) {
      values.push(req.body.chat_title ? String(req.body.chat_title).trim() : null);
      sets.push(`chat_title = $${values.length}`);
    }
    if (req.body?.language !== undefined) {
      values.push(req.body.language ? String(req.body.language).trim().toLowerCase() : null);
      sets.push(`language = $${values.length}`);
    }
    if (req.body?.is_active !== undefined) {
      values.push(Boolean(req.body.is_active));
      sets.push(`is_active = $${values.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id, groupId);

    const updated = await query(
      `UPDATE strategy_bot_groups
       SET ${sets.join(', ')}
       WHERE strategy_bot_id = $${values.length - 1} AND id = $${values.length}
       RETURNING id, strategy_bot_id, chat_id, chat_title, language, is_active, joined_at`,
      values
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ group: updated.rows[0] });
  } catch (error) {
    console.error('Update strategy bot group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/groups/:groupId', async (req: AuthRequest, res) => {
  try {
    const { id, groupId } = req.params;
    const deleted = await query(
      'DELETE FROM strategy_bot_groups WHERE strategy_bot_id = $1 AND id = $2 RETURNING id',
      [id, groupId]
    );

    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete strategy bot group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
