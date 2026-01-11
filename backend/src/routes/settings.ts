import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { invalidateSettings, publishSettingsUpdate } from '../utils/cache';

const router = express.Router();

// Get bot settings
router.get('/:botId', async (req, res) => {
  try {
    const { botId } = req.params;

    const result = await query(
      'SELECT * FROM bot_settings WHERE bot_id = $1',
      [botId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    res.json({ settings: result.rows[0] });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bot settings
router.put('/:botId', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId } = req.params;
    const {
      platform_name,
      platform_url,
      platform_register_url,
      required_channel_id,
      required_group_id,
      screenshot_group_id,
      follow_reward,
      bind_reward,
      invite_reward,
      new_user_credits,
      screenshot_reward_credits,
      welcome_message
    } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (platform_name !== undefined) {
      params.push(platform_name);
      updates.push(`platform_name = $${params.length}`);
    }
    if (platform_url !== undefined) {
      params.push(platform_url);
      updates.push(`platform_url = $${params.length}`);
    }
    if (platform_register_url !== undefined) {
      params.push(platform_register_url);
      updates.push(`platform_register_url = $${params.length}`);
    }
    if (required_channel_id !== undefined) {
      params.push(required_channel_id);
      updates.push(`required_channel_id = $${params.length}`);
    }
    if (required_group_id !== undefined) {
      params.push(required_group_id);
      updates.push(`required_group_id = $${params.length}`);
    }
    if (screenshot_group_id !== undefined) {
      params.push(screenshot_group_id);
      updates.push(`screenshot_group_id = $${params.length}`);
    }
    if (follow_reward !== undefined) {
      params.push(follow_reward);
      updates.push(`follow_reward = $${params.length}`);
    }
    if (bind_reward !== undefined) {
      params.push(bind_reward);
      updates.push(`bind_reward = $${params.length}`);
    }
    if (invite_reward !== undefined) {
      params.push(invite_reward);
      updates.push(`invite_reward = $${params.length}`);
    }
    if (new_user_credits !== undefined) {
      params.push(new_user_credits);
      updates.push(`new_user_credits = $${params.length}`);
    }
    if (screenshot_reward_credits !== undefined) {
      params.push(screenshot_reward_credits);
      updates.push(`screenshot_reward_credits = $${params.length}`);
    }
    if (welcome_message !== undefined) {
      params.push(JSON.stringify(welcome_message));
      updates.push(`welcome_message = $${params.length}`);
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
        `INSERT INTO bot_settings (bot_id, ${updates.map((u, i) => u.split(' = ')[0]).join(', ')})
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
