import express from 'express';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import TelegramAPI from '../utils/telegram';
import { deductRedPacketCredits } from '../utils/rewards';

const router = express.Router();

// Create red packet
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { bot_id, chat_id, title, total_amount, total_count, expires_in_hours } = req.body;

    if (!bot_id || !chat_id || !total_amount || !total_count) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const expiresAt = expires_in_hours 
      ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000)
      : null;

    const result = await query(
      `INSERT INTO red_packets (bot_id, chat_id, title, total_amount, total_count, expires_at, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING *`,
      [bot_id, chat_id, title, total_amount, total_count, expiresAt, req.user?.id]
    );

    const redPacket = result.rows[0];

    // Get bot and send to group
    const botResult = await query('SELECT token FROM bots WHERE id = $1', [bot_id]);
    if (botResult.rows.length > 0) {
      const telegram = new TelegramAPI(botResult.rows[0].token);
      
      const message = `
🧧 <b>Red Packet Alert!</b> 🧧

${title || 'Lucky Red Packet'}

💰 Total: ${total_amount}
👥 Count: ${total_count}
${expires_in_hours ? `⏰ Expires in ${expires_in_hours} hours` : ''}

Click the button below to claim!
⚠️ Requires 1 red packet credit to claim
      `;

      const sentMessage = await telegram.sendMessage(chat_id, message.trim(), {
        reply_markup: {
          inline_keyboard: [[
            { text: '🧧 Claim Red Packet', callback_data: `claim_redpacket:${redPacket.id}` }
          ]]
        }
      });

      // Update message_id
      await query(
        'UPDATE red_packets SET message_id = $1 WHERE id = $2',
        [sentMessage.result.message_id, redPacket.id]
      );
    }

    res.json({ redPacket: result.rows[0] });
  } catch (error) {
    console.error('Create red packet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get red packets
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId, status } = req.query;

    let queryText = `
      SELECT rp.*, 
        b.name as bot_name,
        COUNT(rpc.id) as claim_count
      FROM red_packets rp
      JOIN bots b ON rp.bot_id = b.id
      LEFT JOIN red_packet_claims rpc ON rpc.red_packet_id = rp.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (botId) {
      params.push(botId);
      queryText += ` AND rp.bot_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND rp.status = $${params.length}`;
    }

    queryText += ` GROUP BY rp.id, b.name ORDER BY rp.created_at DESC LIMIT 50`;

    const result = await query(queryText, params);
    res.json({ redPackets: result.rows });
  } catch (error) {
    console.error('Get red packets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get red packet by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM red_packets WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Red packet not found' });
    }

    res.json({ redPacket: result.rows[0] });
  } catch (error) {
    console.error('Get red packet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Claim red packet
router.post('/:id/claim', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Get red packet
    const rpResult = await query(
      'SELECT * FROM red_packets WHERE id = $1',
      [id]
    );

    if (rpResult.rows.length === 0) {
      return res.status(404).json({ error: 'Red packet not found' });
    }

    const redPacket = rpResult.rows[0];

    // Check if finished
    if (redPacket.claimed_count >= redPacket.total_count) {
      return res.status(400).json({ error: 'Red packet finished' });
    }

    // Check if already claimed
    const claimedResult = await query(
      'SELECT * FROM red_packet_claims WHERE red_packet_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (claimedResult.rows.length > 0) {
      return res.status(400).json({ error: 'Already claimed' });
    }

    // Check user credits
    const userResult = await query(
      'SELECT red_packet_credits FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].red_packet_credits <= 0) {
      return res.status(400).json({ error: 'Insufficient credits' });
    }

    // Calculate claim amount (random distribution)
    const remainingAmount = redPacket.total_amount - redPacket.claimed_amount;
    const remainingCount = redPacket.total_count - redPacket.claimed_count;
    
    let claimAmount;
    if (remainingCount === 1) {
      claimAmount = remainingAmount;
    } else {
      const maxClaim = (remainingAmount / remainingCount) * 2;
      claimAmount = Math.random() * maxClaim;
      claimAmount = Math.max(0.01, Math.min(claimAmount, remainingAmount));
    }
    claimAmount = Math.round(claimAmount * 100) / 100;

    // Use transaction
    const { transaction } = await import('../db');
    const result = await transaction(async (client) => {
      // Deduct credit
      await client.query(
        'UPDATE users SET red_packet_credits = red_packet_credits - 1 WHERE id = $1',
        [user_id]
      );

      // Add balance
      await client.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [claimAmount, user_id]
      );

      // Record claim
      await client.query(
        'INSERT INTO red_packet_claims (red_packet_id, user_id, amount) VALUES ($1, $2, $3)',
        [id, user_id, claimAmount]
      );

      // Update red packet
      await client.query(
        `UPDATE red_packets 
         SET claimed_count = claimed_count + 1, claimed_amount = claimed_amount + $1
         WHERE id = $2`,
        [claimAmount, id]
      );

      // Record transaction
      const userBalanceResult = await client.query('SELECT balance FROM users WHERE id = $1', [user_id]);
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [user_id, 'red_packet', claimAmount, userBalanceResult.rows[0].balance, 'Red packet claim']
      );

      return { amount: claimAmount, claimed_count: redPacket.claimed_count + 1 };
    });

    res.json(result);
  } catch (error) {
    console.error('Claim red packet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get red packet claims
router.get('/:id/claims', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT rpc.*, 
        u.username, u.first_name, u.robot_user_id
      FROM red_packet_claims rpc
      JOIN users u ON rpc.user_id = u.id
      WHERE rpc.red_packet_id = $1
      ORDER BY rpc.claimed_at DESC`,
      [id]
    );

    res.json({ claims: result.rows });
  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
