import express from 'express';
import { query, transaction } from '../db';
import { authenticateAdmin, authenticateBot, AuthRequest } from '../middleware/auth';
import TelegramAPI from '../utils/telegram';
import { deductRedPacketCredits } from '../utils/rewards';
import { buildRedPacketMessage, getRedPacketMessages } from '../i18n/redpacket';

const router = express.Router();

// Create red packet
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { bot_id, chat_id, title, total_amount, total_count, is_random, expires_in_hours, balance_expiry_hours, language, claim_condition } = req.body;

    if (!bot_id || !chat_id || !total_amount || !total_count) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const amount = Number(total_amount);
    const count = Number(total_count);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'total_amount must be a positive number' });
    }

    if (!Number.isInteger(count) || count <= 0) {
      return res.status(400).json({ error: 'total_count must be a positive integer' });
    }

    const MIN_AMOUNT_PER_PACKET = 0.01;
    if (amount < count * MIN_AMOUNT_PER_PACKET) {
      return res.status(400).json({ error: 'total_amount too small for the given count' });
    }

    const expiresHours = expires_in_hours ? Number(expires_in_hours) : null;
    if (expiresHours !== null && (!Number.isFinite(expiresHours) || expiresHours <= 0)) {
      return res.status(400).json({ error: 'expires_in_hours must be a positive number' });
    }

    const balanceExpiryHours = balance_expiry_hours ? Number(balance_expiry_hours) : null;
    if (balanceExpiryHours !== null && (!Number.isFinite(balanceExpiryHours) || balanceExpiryHours <= 0)) {
      return res.status(400).json({ error: 'balance_expiry_hours must be a positive number' });
    }

    const expiresAt = expiresHours
      ? new Date(Date.now() + expiresHours * 60 * 60 * 1000)
      : null;

    // is_random defaults to true if not specified
    const isRandom = is_random === false ? false : true;

    const result = await query(
      `INSERT INTO red_packets (bot_id, chat_id, title, total_amount, total_count, expires_at, created_by, status, language, is_random, balance_expiry_hours, claim_condition)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, $11)
       RETURNING *`,
      [bot_id, chat_id, title, amount, count, expiresAt, req.user?.id, language || 'en', isRandom, balanceExpiryHours, claim_condition || 'all_users']
    );

    const redPacket = result.rows[0];

    // Get bot and send to group
    const botResult = await query('SELECT token FROM bots WHERE id = $1', [bot_id]);
    if (botResult.rows.length > 0) {
      const telegram = new TelegramAPI(botResult.rows[0].token);
      const redPacketLang = language || 'en';
      const msgs = getRedPacketMessages(redPacketLang);
      
      const message = buildRedPacketMessage({
        language: redPacketLang,
        title,
        totalAmount: amount,
        totalCount: count,
        expiresHours: expiresHours ? Number(expiresHours) : null,
      });

      const sentMessage = await telegram.sendMessage(chat_id, message.trim(), {
        reply_markup: {
          inline_keyboard: [[
            { text: msgs.claimButton, callback_data: `claim_redpacket:${redPacket.id}` }
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
      const validStatuses = ['active', 'finished', 'expired'];
      if (!validStatuses.includes(status as string)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
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

// Claim red packet (requires bot authentication)
router.post('/:id/claim', authenticateBot, async (req: AuthRequest, res) => {
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

    // Check if active
    if (redPacket.status !== 'active') {
      return res.status(400).json({ error: 'Red packet is not active' });
    }

    // Check if expired
    if (redPacket.expires_at && new Date(redPacket.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Red packet has expired' });
    }

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

    // Check claim condition
    const condition = redPacket.claim_condition || 'all_users';
    if (condition !== 'all_users') {
      const userInfoResult = await query('SELECT * FROM users WHERE id = $1', [user_id]);
      if (userInfoResult.rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
      }

      if (condition === 'first_follow') {
        const txCount = await query('SELECT COUNT(*) FROM transactions WHERE user_id = $1', [user_id]);
        if (parseInt(txCount.rows[0].count) > 0) {
          return res.status(403).json({ error: '仅首次关注 Bot 的新用户可领取' });
        }
      }

      if (condition === 'deposited') {
        const depositCount = await query(
          "SELECT COUNT(*) FROM deposit_records WHERE user_id = $1 AND status = 'confirmed'",
          [user_id]
        );
        if (parseInt(depositCount.rows[0].count) === 0) {
          return res.status(403).json({ error: '仅充值用户可领取' });
        }
      }

      if (condition === 'trade_volume_100' || condition === 'trade_volume_200') {
        const requiredVolume = condition === 'trade_volume_100' ? 100 : 200;
        const volumeResult = await query(
          "SELECT COALESCE(SUM(amount), 0) as total_volume FROM trading_orders WHERE user_id = $1 AND status = 'settled'",
          [user_id]
        );
        const totalVolume = parseFloat(volumeResult.rows[0].total_volume);
        if (totalVolume < requiredVolume) {
          return res.status(403).json({ error: `需要即时交易流水达到 ${requiredVolume} USDT 才可领取` });
        }
      }
    }

    // Calculate claim amount based on is_random flag
    const remainingAmount = redPacket.total_amount - redPacket.claimed_amount;
    const remainingCount = redPacket.total_count - redPacket.claimed_count;
    
    let claimAmount;
    if (remainingCount === 1) {
      claimAmount = remainingAmount;
    } else if (redPacket.is_random === false) {
      // Equal distribution - round to 2 decimal places to avoid floating-point issues
      claimAmount = Math.floor((remainingAmount / remainingCount) * 100) / 100;
    } else {
      // Random distribution
      const maxClaim = (remainingAmount / remainingCount) * 2;
      claimAmount = Math.random() * maxClaim;
      claimAmount = Math.max(0.01, Math.min(claimAmount, remainingAmount));
    }
    claimAmount = Math.round(claimAmount * 100) / 100;

    // Use transaction
    const { transaction } = await import('../db');
    const result = await transaction(async (client) => {
      // Check if this is the user's first red packet claim
      const isNewUserResult = await client.query(
        'SELECT COUNT(*) as claim_count FROM red_packet_claims WHERE user_id = $1',
        [user_id]
      );
      const isNewUser = parseInt(isNewUserResult.rows[0].claim_count) === 0;

      // Add to reward_balance instead of balance
      await client.query(
        'UPDATE users SET reward_balance = reward_balance + $1 WHERE id = $2',
        [claimAmount, user_id]
      );

      // Record claim
      await client.query(
        `INSERT INTO red_packet_claims (red_packet_id, user_id, amount, balance_expires_at)
         VALUES ($1, $2, $3, $4)`,
        [id, user_id, claimAmount,
          redPacket.balance_expiry_hours
            ? new Date(Date.now() + redPacket.balance_expiry_hours * 60 * 60 * 1000)
            : null]
      );

      // Update red packet
      await client.query(
        `UPDATE red_packets 
         SET claimed_count = claimed_count + 1, claimed_amount = claimed_amount + $1
         WHERE id = $2`,
        [claimAmount, id]
      );

      // Record transaction as red_packet_claim type
      const userBalanceResult = await client.query(
        'SELECT reward_balance FROM users WHERE id = $1', 
        [user_id]
      );
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [user_id, 'red_packet_claim', claimAmount, userBalanceResult.rows[0].reward_balance, 'Red packet claim']
      );

      // If new user, trigger follow reward for referrer
      if (isNewUser) {
        const invitationResult = await client.query(
          'SELECT inviter_user_id, follow_reward_paid FROM invitations WHERE invitee_user_id = $1',
          [user_id]
        );

        if (invitationResult.rows.length > 0) {
          const invitation = invitationResult.rows[0];
          
          // Give follow reward (5 USDT) to referrer if not already paid
          if (!invitation.follow_reward_paid && invitation.inviter_user_id) {
            const FOLLOW_REWARD = 5.00;
            
            await client.query(
              'UPDATE users SET reward_balance = reward_balance + $1 WHERE id = $2',
              [FOLLOW_REWARD, invitation.inviter_user_id]
            );

            await client.query(
              `UPDATE invitations 
               SET follow_reward_paid = true, 
                   invitee_first_interaction = CURRENT_TIMESTAMP
               WHERE invitee_user_id = $1`,
              [user_id]
            );

            // Record referrer transaction
            const referrerBalanceResult = await client.query(
              'SELECT reward_balance FROM users WHERE id = $1',
              [invitation.inviter_user_id]
            );
            
            await client.query(
              `INSERT INTO transactions (user_id, type, amount, balance_after, description, related_user_id)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                invitation.inviter_user_id,
                'referral_reward',
                FOLLOW_REWARD,
                referrerBalanceResult.rows[0].reward_balance,
                'Follow reward from referral',
                user_id
              ]
            );
          }
        }
      }

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
