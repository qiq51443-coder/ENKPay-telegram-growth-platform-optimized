import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { invalidateSettings, publishSettingsUpdate } from '../utils/cache';

const router = express.Router();

/**
 * GET /api/settings/public/:key
 * Get a public system setting value (no auth required)
 */
router.get('/public/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const allowed = ['user_agreement', 'announcement'];
    if (!allowed.includes(key)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await query(
      `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
      [key]
    );
    res.json({ value: result.rows[0]?.value || '' });
  } catch (error) {
    console.error('Get public setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bot settings
router.get('/:botId', async (req, res) => {
  try {
    const { botId } = req.params;

    const result = await query(
      'SELECT * FROM bot_settings WHERE bot_id = $1',
      [botId]
    );

    if (result.rows.length === 0) {
      return res.json({ settings: {} });
    }

    res.json({ settings: result.rows[0] });
  } catch (error) {
    console.error('Get settings error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: '获取设置失败', detail: process.env.NODE_ENV !== 'production' ? message : undefined });
  }
});

// Update bot settings
router.put('/:botId', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId } = req.params;
    const {
      follow_reward,
      invite_reward,
      welcome_message,
      welcome_image_url,
      // Legacy single-URL fields (kept for backward compat)
      official_group_url,
      official_channel_url,
      // New multi-URL array fields
      official_group_urls,
      official_channel_urls,
      // Wallet settings
      support_telegram,
      wallet_tip_message,
      transfer_min_amount,
      withdraw_min_amount,
      withdraw_fee_rate,
      deposit_confirm_blocks,
    } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (follow_reward !== undefined) {
      params.push(follow_reward);
      updates.push(`follow_reward = $${params.length}`);
    }
    if (invite_reward !== undefined) {
      params.push(invite_reward);
      updates.push(`invite_reward = $${params.length}`);
    }
    if (welcome_message !== undefined) {
      params.push(typeof welcome_message === 'string' ? welcome_message : JSON.stringify(welcome_message));
      updates.push(`welcome_message = $${params.length}`);
    }
    if (welcome_image_url !== undefined) {
      params.push(welcome_image_url);
      updates.push(`welcome_image_url = $${params.length}`);
    }
    if (official_group_url !== undefined) {
      params.push(official_group_url);
      updates.push(`official_group_url = $${params.length}`);
    }
    if (official_channel_url !== undefined) {
      params.push(official_channel_url);
      updates.push(`official_channel_url = $${params.length}`);
    }
    if (official_group_urls !== undefined) {
      const groupUrls = Array.isArray(official_group_urls) ? official_group_urls.filter(Boolean) : [];
      params.push(groupUrls);
      updates.push(`official_group_urls = $${params.length}`);
    }
    if (official_channel_urls !== undefined) {
      const channelUrls = Array.isArray(official_channel_urls) ? official_channel_urls.filter(Boolean) : [];
      params.push(channelUrls);
      updates.push(`official_channel_urls = $${params.length}`);
    }
    if (support_telegram !== undefined) {
      params.push(support_telegram);
      updates.push(`support_telegram = $${params.length}`);
    }
    if (wallet_tip_message !== undefined) {
      params.push(wallet_tip_message);
      updates.push(`wallet_tip_message = $${params.length}`);
    }
    if (transfer_min_amount !== undefined) {
      params.push(transfer_min_amount);
      updates.push(`transfer_min_amount = $${params.length}`);
    }
    if (withdraw_min_amount !== undefined) {
      params.push(withdraw_min_amount);
      updates.push(`withdraw_min_amount = $${params.length}`);
    }
    if (withdraw_fee_rate !== undefined) {
      params.push(withdraw_fee_rate);
      updates.push(`withdraw_fee_rate = $${params.length}`);
    }
    if (deposit_confirm_blocks !== undefined) {
      params.push(deposit_confirm_blocks);
      updates.push(`deposit_confirm_blocks = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    // Check if settings exist
    const existing = await query('SELECT id FROM bot_settings WHERE bot_id = $1', [botId]);

    let result;
    if (existing.rows.length === 0) {
      // Create new settings
      params.push(botId);
      result = await query(
        `INSERT INTO bot_settings (bot_id, ${updates.map((u) => u.split(' = ')[0]).join(', ')})
         VALUES ($${params.length}, ${updates.map((_, i) => `$${i + 1}`).join(', ')})
         RETURNING *`,
        params
      );
    } else {
      // Update existing settings
      params.push(botId);
      result = await query(
        `UPDATE bot_settings SET ${updates.join(', ')} WHERE bot_id = $${params.length} RETURNING *`,
        params
      );
    }

    // Invalidate cache and publish update
    await invalidateSettings(botId);
    await publishSettingsUpdate(botId);

    res.json({ settings: result.rows[0] });
  } catch (error) {
    console.error('Update settings error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: '保存设置失败', detail: process.env.NODE_ENV !== 'production' ? message : undefined });
  }
});

export default router;
