import express from 'express';
import { query, transaction } from '../db';
import { authenticateAdmin, authenticateBot, AuthRequest } from '../middleware/auth';
import TelegramAPI from '../utils/telegram';
import { buildRedPacketMessage, getRedPacketMessages } from '../i18n/redpacket';

const router = express.Router();

// Create red packet
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { bot_id, chat_id, title, total_amount, total_count, is_random, expires_in_hours, balance_expiry_hours, language, claim_condition, wagering_multiplier } = req.body;

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

    const wageringMultiplier = wagering_multiplier ? Number(wagering_multiplier) : 2;

    const result = await query(
      `INSERT INTO red_packets (bot_id, chat_id, title, total_amount, total_count, expires_at, created_by, status, language, is_random, balance_expiry_hours, claim_condition, wagering_multiplier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, $11, $12)
       RETURNING *`,
      [bot_id, chat_id, title, amount, count, expiresAt, req.user?.id, language || 'en', isRandom, balanceExpiryHours, claim_condition || 'all_users', wageringMultiplier]
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

    // Run everything inside a serializable transaction with row-level lock
    const result = await transaction(async (client) => {
      // Lock the red packet row to prevent concurrent claims from racing
      const rpResult = await client.query(
        'SELECT * FROM red_packets WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (rpResult.rows.length === 0) {
        throw Object.assign(new Error('Red packet not found'), { statusCode: 404 });
      }

      const redPacket = rpResult.rows[0];

      // Check if active
      if (redPacket.status !== 'active') {
        throw Object.assign(new Error('Red packet is not active'), { statusCode: 400 });
      }

      // Check if expired
      if (redPacket.expires_at && new Date(redPacket.expires_at) < new Date()) {
        // Async fire-and-forget: update DB status outside this transaction so it persists
        query(
          `UPDATE red_packets SET status = 'expired' WHERE id = $1 AND status = 'active'`,
          [id]
        ).catch((err) => console.error('[redpackets] Failed to update expired status:', err));
        throw Object.assign(new Error('Red packet has expired'), { statusCode: 400 });
      }

      // Check if finished
      if (redPacket.claimed_count >= redPacket.total_count) {
        throw Object.assign(new Error('Red packet finished'), { statusCode: 400 });
      }

      // Check if already claimed (inside the lock so it's atomic)
      const claimedResult = await client.query(
        'SELECT id FROM red_packet_claims WHERE red_packet_id = $1 AND user_id = $2',
        [id, user_id]
      );
      if (claimedResult.rows.length > 0) {
        throw Object.assign(new Error('Already claimed'), { statusCode: 400 });
      }

      // Check claim condition
      const condition = redPacket.claim_condition || 'all_users';
      if (condition !== 'all_users') {
        const userInfoResult = await client.query('SELECT * FROM users WHERE id = $1', [user_id]);
        if (userInfoResult.rows.length === 0) {
          throw Object.assign(new Error('User not found'), { statusCode: 403 });
        }

        if (condition === 'first_follow') {
          const txCount = await client.query('SELECT COUNT(*) FROM transactions WHERE user_id = $1', [user_id]);
          if (parseInt(txCount.rows[0].count) > 0) {
            throw Object.assign(new Error('仅首次关注 Bot 的新用户可领取'), { statusCode: 403 });
          }
        }

        if (condition === 'deposited') {
          const depositCount = await client.query(
            "SELECT COUNT(*) FROM deposit_records WHERE user_id = $1 AND status = 'confirmed'",
            [user_id]
          );
          if (parseInt(depositCount.rows[0].count) === 0) {
            throw Object.assign(new Error('仅充值用户可领取'), { statusCode: 403 });
          }
        }

        if (condition === 'trade_volume_100' || condition === 'trade_volume_200') {
          const requiredVolume = condition === 'trade_volume_100' ? 100 : 200;
          const volumeResult = await client.query(
            "SELECT COALESCE(SUM(amount), 0) as total_volume FROM trading_orders WHERE user_id = $1 AND status = 'settled'",
            [user_id]
          );
          const totalVolume = parseFloat(volumeResult.rows[0].total_volume);
          if (totalVolume < requiredVolume) {
            throw Object.assign(new Error(`需要即时交易流水达到 ${requiredVolume} USDT 才可领取`), { statusCode: 403 });
          }
        }
      }

      // Calculate claim amount based on locked row data
      const remainingAmount = redPacket.total_amount - redPacket.claimed_amount;
      const remainingCount = redPacket.total_count - redPacket.claimed_count;

      let claimAmount;
      if (remainingCount === 1) {
        claimAmount = remainingAmount;
      } else if (redPacket.is_random === false) {
        claimAmount = Math.floor((remainingAmount / remainingCount) * 100) / 100;
      } else {
        const maxClaim = (remainingAmount / remainingCount) * 2;
        claimAmount = Math.random() * maxClaim;
        claimAmount = Math.max(0.01, Math.min(claimAmount, remainingAmount));
      }
      claimAmount = Math.round(claimAmount * 100) / 100;

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

      // Update red packet counts; auto-transition to 'finished' when all packets are claimed
      const newClaimedCount = redPacket.claimed_count + 1;
      const isLastOne = newClaimedCount >= redPacket.total_count;

      await client.query(
        `UPDATE red_packets
         SET claimed_count = claimed_count + 1,
             claimed_amount = claimed_amount + $1,
             status = CASE WHEN claimed_count + 1 >= total_count THEN 'finished' ELSE status END
         WHERE id = $2`,
        [claimAmount, id]
      );

      // Record transaction
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
          `SELECT inviter_id, follow_reward_paid 
           FROM invitations 
           WHERE invitee_id = $1`,
          [user_id]
        );

        if (invitationResult.rows.length > 0) {
          const invitation = invitationResult.rows[0];

          if (!invitation.follow_reward_paid && invitation.inviter_id) {
            const FOLLOW_REWARD = 5.00;

            await client.query(
              'UPDATE users SET reward_balance = reward_balance + $1 WHERE id = $2',
              [FOLLOW_REWARD, invitation.inviter_id]
            );

            await client.query(
              `UPDATE invitations
               SET follow_reward_paid = true,
                   invitee_first_interaction = CURRENT_TIMESTAMP
               WHERE invitee_id = $1`,
              [user_id]
            );

            const referrerBalanceResult = await client.query(
              'SELECT reward_balance FROM users WHERE id = $1',
              [invitation.inviter_id]
            );

            await client.query(
              `INSERT INTO transactions (user_id, type, amount, balance_after, description, related_user_id)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                invitation.inviter_id,
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

      return {
        amount: claimAmount,
        claimed_count: newClaimedCount,
        total_count: redPacket.total_count,
        status: isLastOne ? 'finished' : 'active',
      };
    });

    // Update platform_config wagering multiplier from this red packet (best-effort, outside transaction)
    const rpCheck = await query('SELECT wagering_multiplier FROM red_packets WHERE id = $1', [id]);
    const wagMult = rpCheck.rows[0]?.wagering_multiplier;
    if (wagMult) {
      query(
        `UPDATE platform_config SET value = $1 WHERE key = 'red_packet_wager_multiplier'`,
        [String(wagMult)]
      ).catch((err: any) => console.error('[redpackets] Failed to update wager multiplier config:', err));
    }

    res.json(result);
  } catch (error: any) {
    // Surface structured errors with proper status codes
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Claim red packet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get red packet claims
router.get('/:id/claims', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT rpc.id, rpc.red_packet_id, rpc.user_id, rpc.amount, rpc.claimed_at,
        u.username, u.first_name, u.robot_user_id,
        rp.bot_id
      FROM red_packet_claims rpc
      JOIN users u ON rpc.user_id = u.id
      JOIN red_packets rp ON rpc.red_packet_id = rp.id
      WHERE rpc.red_packet_id = $1
      ORDER BY rpc.claimed_at DESC`,
      [id]
    );

    const claims = result.rows.map((row: any) => ({
      id: row.id,
      red_packet_id: row.red_packet_id,
      user_id: row.user_id,
      amount: row.amount,
      claimed_at: row.claimed_at,
      bot_id: row.bot_id,
      user: {
        username: row.username,
        first_name: row.first_name,
        robot_user_id: row.robot_user_id,
      },
    }));

    res.json({ claims });
  } catch (error) {
    console.error('Get claims error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
