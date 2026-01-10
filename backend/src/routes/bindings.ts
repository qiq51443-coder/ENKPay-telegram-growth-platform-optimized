import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { unlockBindReward } from '../utils/rewards';
import TelegramAPI from '../utils/telegram';

const router = express.Router();

// Get all binding requests
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, status, botId } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT pb.*, 
        u.telegram_id, u.username, u.first_name, u.robot_user_id,
        b.name as bot_name
      FROM platform_bindings pb
      JOIN users u ON pb.user_id = u.id
      JOIN bots b ON pb.bot_id = b.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND pb.status = $${params.length}`;
    }

    if (botId) {
      params.push(botId);
      queryText += ` AND pb.bot_id = $${params.length}`;
    }

    queryText += ` ORDER BY pb.created_at DESC`;
    
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    res.json({ bindings: result.rows });
  } catch (error) {
    console.error('Get bindings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Review binding request
router.put('/:id/review', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, admin_note } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      `UPDATE platform_bindings 
       SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, admin_note, req.user?.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Binding request not found' });
    }

    const binding = result.rows[0];

    // If approved, unlock rewards
    if (status === 'approved') {
      try {
        const rewardResult = await unlockBindReward(binding.user_id, binding.bot_id);
        
        // Get bot and send notification
        const botResult = await query('SELECT token FROM bots WHERE id = $1', [binding.bot_id]);
        if (botResult.rows.length > 0) {
          const telegram = new TelegramAPI(botResult.rows[0].token);
          const userResult = await query('SELECT telegram_id FROM users WHERE id = $1', [binding.user_id]);
          
          if (userResult.rows.length > 0) {
            await telegram.sendMessage(
              userResult.rows[0].telegram_id,
              `✅ Your platform binding has been approved!\n\n🎉 You received ${rewardResult.rewardAmount} reward!\n💰 New balance: ${rewardResult.newBalance}`
            );
          }
        }
      } catch (error) {
        console.error('Error processing rewards:', error);
      }
    }

    res.json({ binding: result.rows[0] });
  } catch (error) {
    console.error('Review binding error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
