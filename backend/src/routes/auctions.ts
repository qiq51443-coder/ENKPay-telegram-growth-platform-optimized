import express from 'express';
import { query, transaction } from '../db';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import { drawWinner } from '../services/auction.service';

const router = express.Router();

/**
 * GET /api/auctions
 * List active (and recent) auctions for users
 */
router.get('/', async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT a.id, a.product_id, a.title, a.description, a.image_url, a.product_value,
              a.participant_count, a.per_person_cost, a.max_purchases_per_user,
              a.platform_fee_percent, a.winner_payout, a.current_participants, a.status,
              a.winner_id, a.winner_unique_id, a.drawn_at, a.expires_at, a.notify_channels,
              a.created_at, a.updated_at,
              p.name as product_name, p.image_url as product_image
       FROM lucky_auctions a
       LEFT JOIN nft_products p ON a.product_id = p.id
       WHERE a.status = $1
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, Number(limit), offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM lucky_auctions WHERE status = $1`,
      [status]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count),
      },
    });
  } catch (error: any) {
    console.error('Get auctions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/results
 * Public list of winning records
 */
router.get('/results', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT lar.*
       FROM lucky_auction_results lar
       JOIN lucky_auctions la ON lar.auction_id = la.id
       WHERE la.show_in_mini_app = true
       ORDER BY lar.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM lucky_auction_results lar
       WHERE EXISTS (SELECT 1 FROM lucky_auctions la WHERE la.id = lar.auction_id AND la.show_in_mini_app = true)`,
      []
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count),
      },
    });
  } catch (error: any) {
    console.error('Get auction results error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/my
 * Get the current user's participation history
 */
router.get('/my', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    const userResult = await query(`SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`, [telegramId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    const result = await query(
      `SELECT lap.*, a.title, a.status as auction_status, a.winner_unique_id,
              a.expires_at, a.drawn_at, a.winner_payout, a.product_value,
              lar.id as result_id, lar.is_redeemed
       FROM lucky_auction_participants lap
       JOIN lucky_auctions a ON lap.auction_id = a.id
       LEFT JOIN lucky_auction_results lar ON lar.auction_id = a.id AND lar.winner_id = $1
       WHERE lap.user_id = $1
       ORDER BY lap.created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Get my auctions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/:id
 * Auction detail
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const auctionResult = await query(
      `SELECT a.id, a.product_id, a.title, a.description, a.image_url, a.product_value,
              a.participant_count, a.per_person_cost, a.max_purchases_per_user,
              a.platform_fee_percent, a.winner_payout, a.current_participants, a.status,
              a.winner_id, a.winner_unique_id, a.drawn_at, a.expires_at, a.notify_channels,
              a.created_at, a.updated_at,
              p.name as product_name, p.image_url as product_image, p.description as product_description
       FROM lucky_auctions a
       LEFT JOIN nft_products p ON a.product_id = p.id
       WHERE a.id = $1`,
      [id]
    );

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    res.json({ success: true, data: auctionResult.rows[0] });
  } catch (error: any) {
    console.error('Get auction detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/:id/participants
 * List participants (shows unique_id only for privacy)
 */
router.get('/:id/participants', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT lap.id, u.unique_id, lap.quantity, lap.created_at
       FROM lucky_auction_participants lap
       JOIN users u ON lap.user_id = u.id
       WHERE lap.auction_id = $1
       ORDER BY lap.created_at ASC
       LIMIT $2 OFFSET $3`,
      [id, Number(limit), offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM lucky_auction_participants WHERE auction_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count),
      },
    });
  } catch (error: any) {
    console.error('Get participants error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auctions/:id/join
 * Join an auction (deduct balance, create participant record)
 */
router.post('/:id/join', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const { id } = req.params;
    const quantity = Math.max(1, parseInt(req.body.quantity || '1'));
    const telegramId = req.telegramUser?.id;

    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await transaction(async (client) => {
      // Get user
      const userResult = await client.query(
        `SELECT id, wallet_balance, unique_id FROM users WHERE telegram_id = $1 FOR UPDATE`,
        [telegramId]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      const user = userResult.rows[0];

      // Get auction
      const auctionResult = await client.query(
        `SELECT * FROM lucky_auctions WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (auctionResult.rows.length === 0) throw new Error('Auction not found');
      const auction = auctionResult.rows[0];

      if (auction.status !== 'active') throw new Error('Auction is not active');
      if (new Date() > new Date(auction.expires_at)) throw new Error('Auction has expired');

      // Check existing participation
      const existingResult = await client.query(
        `SELECT quantity FROM lucky_auction_participants WHERE auction_id = $1 AND user_id = $2`,
        [id, user.id]
      );
      const existingQty = existingResult.rows.length > 0 ? existingResult.rows[0].quantity : 0;

      if (existingQty + quantity > auction.max_purchases_per_user) {
        throw new Error(
          `Exceeds max purchases per user (${auction.max_purchases_per_user}). You already have ${existingQty}.`
        );
      }

      // Check remaining slots
      const remaining = auction.participant_count - auction.current_participants;
      if (quantity > remaining) {
        throw new Error(`Only ${remaining} slot(s) remaining`);
      }

      const totalCost = parseFloat(auction.per_person_cost) * quantity;

      if (parseFloat(user.wallet_balance) < totalCost) {
        throw new Error('Insufficient balance');
      }

      // Deduct balance
      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2`,
        [totalCost, user.id]
      );

      // Insert or update participant record
      if (existingResult.rows.length > 0) {
        await client.query(
          `UPDATE lucky_auction_participants
           SET quantity = quantity + $1, amount = amount + $2
           WHERE auction_id = $3 AND user_id = $4`,
          [quantity, totalCost, id, user.id]
        );
      } else {
        await client.query(
          `INSERT INTO lucky_auction_participants (auction_id, user_id, quantity, amount)
           VALUES ($1, $2, $3, $4)`,
          [id, user.id, quantity, totalCost]
        );
      }

      // Record transaction
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
         SELECT $1, 'auction_join', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
        [user.id, -totalCost, `参与竞拍: ${auction.title}`, id]
      );

      // Update current_participants
      const newCount = auction.current_participants + quantity;
      await client.query(
        `UPDATE lucky_auctions SET current_participants = $1, updated_at = NOW() WHERE id = $2`,
        [newCount, id]
      );

      return { newCount, participantCount: auction.participant_count };
    });

    // Trigger draw if fully subscribed (outside the transaction to avoid lock contention)
    if (result.newCount >= result.participantCount) {
      drawWinner(id).catch(err => console.error(`Auto-draw failed for auction ${id}:`, err));
    }

    res.json({ success: true, message: '参与成功' });
  } catch (error: any) {
    console.error('Join auction error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auctions/results/:id/redeem
 * Winner redeems their prize as USDT
 */
router.post('/results/:id/redeem', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const { id } = req.params;
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    await transaction(async (client) => {
      const userResult = await client.query(
        `SELECT id FROM users WHERE telegram_id = $1`,
        [telegramId]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      const userId = userResult.rows[0].id;

      const resultRow = await client.query(
        `SELECT * FROM lucky_auction_results WHERE id = $1 AND winner_id = $2 FOR UPDATE`,
        [id, userId]
      );
      if (resultRow.rows.length === 0) throw new Error('Result not found or not your win');
      const result = resultRow.rows[0];
      if (result.is_redeemed) throw new Error('Already redeemed');

      // Credit payout to user balance
      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
        [result.payout_amount, userId]
      );

      // Mark as redeemed
      await client.query(
        `UPDATE lucky_auction_results SET is_redeemed = true, redeemed_at = NOW() WHERE id = $1`,
        [id]
      );

      // Record transaction
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
         SELECT $1, 'auction_redeem', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
        [userId, result.payout_amount, `竞拍兑换: ${result.product_title}`, result.auction_id]
      );
    });

    res.json({ success: true, message: '兑换成功' });
  } catch (error: any) {
    console.error('Redeem auction error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auctions/:id/draw
 * Draw a winner (admin only)
 * body: { method: 'random' | 'manual', winner_unique_id?: string }
 */
router.post('/:id/draw', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { method = 'random', winner_unique_id } = req.body;

    if (!['random', 'manual'].includes(method)) {
      return res.status(400).json({ error: 'method must be random or manual' });
    }

    const auctionResult = await query(
      `SELECT * FROM lucky_auctions WHERE id = $1`,
      [id]
    );
    if (auctionResult.rows.length === 0) return res.status(404).json({ error: 'Auction not found' });
    const auction = auctionResult.rows[0];
    if (auction.status === 'completed') return res.status(400).json({ error: 'Auction already completed' });

    if (method === 'manual') {
      if (!winner_unique_id) return res.status(400).json({ error: 'winner_unique_id is required for manual draw' });
      // Verify the user is a participant
      const participantCheck = await query(
        `SELECT lap.id FROM lucky_auction_participants lap
         JOIN users u ON lap.user_id = u.id
         WHERE lap.auction_id = $1 AND u.unique_id = $2`,
        [id, winner_unique_id]
      );
      if (participantCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Specified user is not a participant' });
      }
      // Set preset_winner_unique_id so drawWinner() picks the correct winner,
      // and reset winner_unique_id / winner_id so drawWinner's guard check doesn't abort early
      await query(
        `UPDATE lucky_auctions SET preset_winner_unique_id = $1, winner_unique_id = NULL, winner_id = NULL, status = 'active' WHERE id = $2`,
        [winner_unique_id, id]
      );
    }

    await drawWinner(id);

    res.json({ success: true, message: '开奖完成' });
  } catch (error: any) {
    console.error('Draw winner error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
