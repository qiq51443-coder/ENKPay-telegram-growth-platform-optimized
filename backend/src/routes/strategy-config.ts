import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import { sendStrategyMessage } from '../services/strategy-bot.service';

const router = express.Router();

router.use(adminLimiter);
router.use(authenticateAdmin);

function toJson(value: any, fallback: any) {
  if (value === undefined || value === null) return fallback;
  return value;
}

router.get('/', async (_req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT
         sc.*,
         sb.bot_name,
         sb.username,
         sb.is_active AS bot_active
       FROM strategy_configs sc
       JOIN strategy_bots sb ON sc.strategy_bot_id = sb.id
       ORDER BY sc.created_at DESC`,
      []
    );
    res.json({ configs: result.rows });
  } catch (error) {
    console.error('Get strategy configs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      strategy_bot_id,
      name,
      is_active = true,
      auto_send_daily = false,
      coin_rotation = [],
      send_times = [],
      custom_text = null,
      custom_text_translations = null,
      media_url = null,
      target_group_ids = [],
      current_coin_index = 0,
    } = req.body || {};

    if (!strategy_bot_id) {
      return res.status(400).json({ error: 'strategy_bot_id is required' });
    }
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const inserted = await query(
      `INSERT INTO strategy_configs (
         strategy_bot_id, name, is_active, auto_send_daily,
         coin_rotation, send_times, custom_text, custom_text_translations,
         media_url, target_group_ids, current_coin_index
       ) VALUES (
         $1, $2, $3, $4,
         $5::jsonb, $6::jsonb, $7, $8::jsonb,
         $9, $10::jsonb, $11
       )
       RETURNING *`,
      [
        strategy_bot_id,
        String(name).trim(),
        Boolean(is_active),
        Boolean(auto_send_daily),
        JSON.stringify(toJson(coin_rotation, [])),
        JSON.stringify(toJson(send_times, [])),
        custom_text,
        custom_text_translations ? JSON.stringify(custom_text_translations) : null,
        media_url,
        JSON.stringify(toJson(target_group_ids, [])),
        Number(current_coin_index) || 0,
      ]
    );

    res.json({ config: inserted.rows[0] });
  } catch (error) {
    console.error('Create strategy config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      strategy_bot_id,
      name,
      is_active,
      auto_send_daily,
      coin_rotation,
      send_times,
      custom_text,
      custom_text_translations,
      media_url,
      media_telegram_file_id,
      target_group_ids,
      current_coin_index,
    } = req.body || {};

    const values: any[] = [];
    const sets: string[] = [];

    const addField = (sql: string, value: any) => {
      values.push(value);
      sets.push(`${sql} = $${values.length}`);
    };

    if (strategy_bot_id !== undefined) addField('strategy_bot_id', strategy_bot_id);
    if (name !== undefined) addField('name', String(name).trim());
    if (is_active !== undefined) addField('is_active', Boolean(is_active));
    if (auto_send_daily !== undefined) addField('auto_send_daily', Boolean(auto_send_daily));
    if (coin_rotation !== undefined) addField('coin_rotation', JSON.stringify(toJson(coin_rotation, [])));
    if (send_times !== undefined) addField('send_times', JSON.stringify(toJson(send_times, [])));
    if (custom_text !== undefined) addField('custom_text', custom_text);
    if (custom_text_translations !== undefined) addField('custom_text_translations', custom_text_translations ? JSON.stringify(custom_text_translations) : null);
    if (media_url !== undefined) addField('media_url', media_url);
    if (media_telegram_file_id !== undefined) addField('media_telegram_file_id', media_telegram_file_id);
    if (target_group_ids !== undefined) addField('target_group_ids', JSON.stringify(toJson(target_group_ids, [])));
    if (current_coin_index !== undefined) addField('current_coin_index', Number(current_coin_index) || 0);

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    sets.push('updated_at = NOW()');
    values.push(id);

    const updated = await query(
      `UPDATE strategy_configs
       SET ${sets.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Strategy config not found' });
    }

    res.json({ config: updated.rows[0] });
  } catch (error) {
    console.error('Update strategy config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const deleted = await query('DELETE FROM strategy_configs WHERE id = $1 RETURNING id', [id]);
    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: 'Strategy config not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete strategy config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/send-now', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await sendStrategyMessage(id);
    res.json({ success: true, result });
  } catch (error: any) {
    console.error('Send strategy now error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.get('/send-logs/recent', async (_req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT created_at, details
       FROM audit_logs
       WHERE action = 'strategy_send'
       ORDER BY created_at DESC
       LIMIT 100`,
      []
    );

    const logs = result.rows.map((row) => ({
      created_at: row.created_at,
      ...(typeof row.details === 'object' ? row.details : {}),
    }));

    return res.json({ logs });
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (!msg.includes('relation "audit_logs" does not exist')) {
      console.error('Get strategy logs error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  try {
    const fallback = await query(
      `SELECT created_at, details, resource_id
       FROM admin_audit_logs
       WHERE action = 'strategy_send'
       ORDER BY created_at DESC
       LIMIT 100`,
      []
    );

    const logs = fallback.rows.map((row) => ({
      created_at: row.created_at,
      configId: row.resource_id,
      ...(typeof row.details === 'object' ? row.details : {}),
    }));

    res.json({ logs });
  } catch (error) {
    console.error('Get strategy fallback logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
