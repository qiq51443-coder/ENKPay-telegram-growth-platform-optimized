import express from 'express';
import { query } from '../db';
import { authenticateAdmin, authenticateBot, AuthRequest } from '../middleware/auth';
import { addRedPacketCredits } from '../utils/rewards';
import TelegramAPI from '../utils/telegram';

const router = express.Router();

// Create screenshot (for bot)
router.post('/', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, group_id, message_id, file_id } = req.body;

    if (!user_id || !file_id) {
      return res.status(400).json({ error: 'User ID and file ID required' });
    }

    const result = await query(
      `INSERT INTO earnings_screenshots (user_id, bot_id, group_id, message_id, file_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, req.botId, group_id, message_id, file_id]
    );

    res.json({ screenshot: result.rows[0] });
  } catch (error) {
    console.error('Create screenshot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all screenshots
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, status, botId } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT es.*, 
        u.telegram_id, u.username, u.first_name, u.robot_user_id,
        b.name as bot_name
      FROM earnings_screenshots es
      JOIN users u ON es.user_id = u.id
      JOIN bots b ON es.bot_id = b.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND es.status = $${params.length}`;
    }

    if (botId) {
      params.push(botId);
      queryText += ` AND es.bot_id = $${params.length}`;
    }

    queryText += ` ORDER BY es.created_at DESC`;
    
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    res.json({ screenshots: result.rows });
  } catch (error) {
    console.error('Get screenshots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Review screenshot
router.put('/:id/review', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, admin_note } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      `UPDATE earnings_screenshots 
       SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, admin_note, req.user?.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }

    const screenshot = result.rows[0];

    // If approved, add red packet credits
    if (status === 'approved') {
      try {
        // Get settings for credit amount
        const settingsResult = await query(
          'SELECT screenshot_reward_credits FROM bot_settings WHERE bot_id = $1',
          [screenshot.bot_id]
        );
        const creditAmount = settingsResult.rows[0]?.screenshot_reward_credits || 1;

        const newCredits = await addRedPacketCredits(screenshot.user_id, creditAmount);
        
        // Get bot and send notification
        const botResult = await query('SELECT token FROM bots WHERE id = $1', [screenshot.bot_id]);
        if (botResult.rows.length > 0) {
          const telegram = new TelegramAPI(botResult.rows[0].token);
          const userResult = await query('SELECT telegram_id FROM users WHERE id = $1', [screenshot.user_id]);
          
          if (userResult.rows.length > 0) {
            await telegram.sendMessage(
              userResult.rows[0].telegram_id,
              `✅ Your earnings screenshot has been approved!\n\n🎁 You received ${creditAmount} red packet credit(s)!\n🧧 Total credits: ${newCredits}`
            );
          }
        }
      } catch (error) {
        console.error('Error adding credits:', error);
      }
    } else {
      // Send rejection notification
      try {
        const botResult = await query('SELECT token FROM bots WHERE id = $1', [screenshot.bot_id]);
        if (botResult.rows.length > 0) {
          const telegram = new TelegramAPI(botResult.rows[0].token);
          const userResult = await query('SELECT telegram_id FROM users WHERE id = $1', [screenshot.user_id]);
          
          if (userResult.rows.length > 0) {
            await telegram.sendMessage(
              userResult.rows[0].telegram_id,
              `❌ Your earnings screenshot was rejected.\n\n${admin_note ? `Reason: ${admin_note}` : 'Please try again with a valid screenshot.'}`
            );
          }
        }
      } catch (error) {
        console.error('Error sending rejection notification:', error);
      }
    }

    res.json({ screenshot: result.rows[0] });
  } catch (error) {
    console.error('Review screenshot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
