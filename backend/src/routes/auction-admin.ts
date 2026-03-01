import express from 'express';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import { drawWinner } from '../services/auction.service';

const router = express.Router();

// Apply admin rate limiter to all routes in this router
router.use(adminLimiter);

/**
 * POST /api/admin/auctions
 * Create a new auction
 */
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      product_id,
      title,
      description,
      image_url,
      product_value,
      participant_count,
      max_purchases_per_user = 1,
      platform_fee_percent = 30,
      expires_at,
      notify_channels = true,
    } = req.body;

    if (!title || !product_value || !participant_count || !expires_at) {
      return res.status(400).json({ error: 'Missing required fields: title, product_value, participant_count, expires_at' });
    }

    const value = parseFloat(product_value);
    const count = parseInt(participant_count);
    const feePercent = parseFloat(platform_fee_percent);
    const perPersonCost = parseFloat((value / count).toFixed(2));
    const winnerPayout = parseFloat((value * (1 - feePercent / 100)).toFixed(2));

    const result = await query(
      `INSERT INTO lucky_auctions
         (product_id, title, description, image_url, product_value, participant_count,
          per_person_cost, max_purchases_per_user, platform_fee_percent, winner_payout,
          expires_at, notify_channels)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        product_id || null,
        title,
        description || null,
        image_url || null,
        value,
        count,
        perPersonCost,
        parseInt(max_purchases_per_user),
        feePercent,
        winnerPayout,
        expires_at,
        notify_channels,
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('Create auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/auctions
 * List all auctions with participant counts
 */
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (status) {
      params.push(status);
      where += ` AND a.status = $${params.length}`;
    }

    params.push(Number(limit), offset);

    const result = await query(
      `SELECT a.*, p.name as product_name,
              COUNT(lap.id) as participant_records
       FROM lucky_auctions a
       LEFT JOIN nft_products p ON a.product_id = p.id
       LEFT JOIN lucky_auction_participants lap ON lap.auction_id = a.id
       ${where}
       GROUP BY a.id, p.name
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = status ? [status] : [];
    const countResult = await query(
      `SELECT COUNT(*) FROM lucky_auctions ${status ? 'WHERE status = $1' : ''}`,
      countParams
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
 * GET /api/admin/auctions/:id
 * Auction detail with participant list
 */
router.get('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const auctionResult = await query(
      `SELECT a.*, p.name as product_name
       FROM lucky_auctions a
       LEFT JOIN nft_products p ON a.product_id = p.id
       WHERE a.id = $1`,
      [id]
    );

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    const participantsResult = await query(
      `SELECT lap.*, u.unique_id, u.username, u.first_name
       FROM lucky_auction_participants lap
       JOIN users u ON lap.user_id = u.id
       WHERE lap.auction_id = $1
       ORDER BY lap.created_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...auctionResult.rows[0],
        participants: participantsResult.rows,
      },
    });
  } catch (error: any) {
    console.error('Get auction detail error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/auctions/:id
 * Edit auction (only when active)
 */
router.put('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, image_url, max_purchases_per_user, expires_at, notify_channels,
    } = req.body;

    const auctionResult = await query(
      `SELECT status FROM lucky_auctions WHERE id = $1`,
      [id]
    );
    if (auctionResult.rows.length === 0) return res.status(404).json({ error: 'Auction not found' });
    if (auctionResult.rows[0].status !== 'active') {
      return res.status(400).json({ error: 'Only active auctions can be edited' });
    }

    const result = await query(
      `UPDATE lucky_auctions
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           image_url = COALESCE($3, image_url),
           max_purchases_per_user = COALESCE($4, max_purchases_per_user),
           expires_at = COALESCE($5, expires_at),
           notify_channels = COALESCE($6, notify_channels),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [title, description, image_url, max_purchases_per_user, expires_at, notify_channels, id]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('Update auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/auctions/:id
 * Delete auction (only active with no participants)
 */
router.delete('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const auctionResult = await query(
      `SELECT status, current_participants FROM lucky_auctions WHERE id = $1`,
      [id]
    );
    if (auctionResult.rows.length === 0) return res.status(404).json({ error: 'Auction not found' });
    const auction = auctionResult.rows[0];
    if (auction.status !== 'active') return res.status(400).json({ error: 'Only active auctions can be deleted' });
    if (auction.current_participants > 0) {
      return res.status(400).json({ error: 'Cannot delete auction with participants' });
    }

    await query(`DELETE FROM lucky_auctions WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Auction deleted' });
  } catch (error: any) {
    console.error('Delete auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/auctions/:id/cancel
 * Cancel auction and refund all participants
 */
router.post('/:id/cancel', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await transaction(async (client) => {
      const auctionResult = await client.query(
        `SELECT * FROM lucky_auctions WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (auctionResult.rows.length === 0) throw new Error('Auction not found');
      const auction = auctionResult.rows[0];
      if (!['active'].includes(auction.status)) throw new Error('Only active auctions can be cancelled');

      await client.query(
        `UPDATE lucky_auctions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // Refund participants
      const participantsResult = await client.query(
        `SELECT * FROM lucky_auction_participants WHERE auction_id = $1 AND refunded = false`,
        [id]
      );

      for (const p of participantsResult.rows) {
        await client.query(
          `UPDATE users SET balance = balance + $1 WHERE id = $2`,
          [p.amount, p.user_id]
        );
        await client.query(
          `UPDATE lucky_auction_participants SET refunded = true WHERE id = $1`,
          [p.id]
        );
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
           SELECT $1, 'auction_refund', $2, balance, $3, $4 FROM users WHERE id = $1`,
          [p.user_id, p.amount, `竞拍取消退款: ${auction.title}`, id]
        );
      }
    });

    res.json({ success: true, message: 'Auction cancelled and participants refunded' });
  } catch (error: any) {
    console.error('Cancel auction error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/admin/auctions/:id/draw
 * Manually trigger draw for a completed auction
 */
router.post('/:id/draw', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await drawWinner(id);
    res.json({ success: true, message: 'Winner drawn successfully' });
  } catch (error: any) {
    console.error('Manual draw error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/admin/auction-results
 * View all winning records
 */
router.get('/results/all', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT lar.*, u.username, u.first_name
       FROM lucky_auction_results lar
       JOIN users u ON lar.winner_id = u.id
       ORDER BY lar.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    );

    const countResult = await query(`SELECT COUNT(*) FROM lucky_auction_results`, []);

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

export default router;
