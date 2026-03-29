import express from 'express';
import multer from 'multer';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import { drawWinner } from '../services/auction.service';

// Memory storage for auction image uploads (base64 persisted in DB)
const auctionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const router = express.Router();

// Apply admin rate limiter to all routes in this router
router.use(adminLimiter);

/**
 * POST /api/admin/auctions/upload-image
 * Upload an auction image and return a persistent URL
 */
router.post('/upload-image', authenticateAdmin, auctionUpload.single('file'), (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const base64 = req.file.buffer.toString('base64');
  const url = `data:${req.file.mimetype};base64,${base64}`;
  res.json({ success: true, url });
});

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
      preset_winner_unique_id,
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
          expires_at, notify_channels, preset_winner_unique_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        preset_winner_unique_id || null,
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
      preset_winner_unique_id, show_in_mini_app,
    } = req.body;

    const auctionResult = await query(
      `SELECT status FROM lucky_auctions WHERE id = $1`,
      [id]
    );
    if (auctionResult.rows.length === 0) return res.status(404).json({ error: 'Auction not found' });
    const status = auctionResult.rows[0].status;
    if (!['active', 'completed', 'expired'].includes(status)) {
      return res.status(400).json({ error: 'Only active, completed, or expired auctions can be edited' });
    }

    let result;
    if (status === 'completed' || status === 'expired') {
      // Completed/expired auctions: only allow editing display fields
      result = await query(
        `UPDATE lucky_auctions
         SET title = COALESCE($1, title),
             description = COALESCE($2, description),
             image_url = COALESCE($3, image_url),
             show_in_mini_app = COALESCE($4, show_in_mini_app),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [title, description, image_url, show_in_mini_app, id]
      );
    } else {
      result = await query(
        `UPDATE lucky_auctions
         SET title = COALESCE($1, title),
             description = COALESCE($2, description),
             image_url = COALESCE($3, image_url),
             max_purchases_per_user = COALESCE($4, max_purchases_per_user),
             expires_at = COALESCE($5, expires_at),
             notify_channels = COALESCE($6, notify_channels),
             preset_winner_unique_id = CASE WHEN $7 THEN $8 ELSE preset_winner_unique_id END,
             updated_at = NOW()
         WHERE id = $9
         RETURNING *`,
        [title, description, image_url, max_purchases_per_user, expires_at, notify_channels,
          'preset_winner_unique_id' in req.body, preset_winner_unique_id || null, id]
      );
    }

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

    if (auction.status === 'active') {
      if (auction.current_participants > 0) {
        return res.status(400).json({ error: 'Cannot delete active auction with participants. Please cancel it first.' });
      }
    } else if (auction.status !== 'expired') {
      return res.status(400).json({ error: 'Only active (no participants) or expired auctions can be deleted' });
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
          `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
          [p.amount, p.user_id]
        );
        await client.query(
          `UPDATE lucky_auction_participants SET refunded = true WHERE id = $1`,
          [p.id]
        );
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
           SELECT $1, 'auction_refund', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
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
    const { preset_winner_unique_id } = req.body;

    // Pre-check: verify auction exists and hasn't been drawn yet
    const auctionResult = await query(
      `SELECT status, winner_id FROM lucky_auctions WHERE id = $1`,
      [id]
    );
    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }
    const auction = auctionResult.rows[0];
    if (auction.winner_id) {
      return res.status(400).json({ error: 'Auction has already been drawn' });
    }
    if (auction.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot draw a cancelled auction' });
    }

    // If a manual winner is specified, validate they are a participant and set preset_winner_unique_id
    if (preset_winner_unique_id) {
      const participantCheck = await query(
        `SELECT lap.id FROM lucky_auction_participants lap
         JOIN users u ON lap.user_id = u.id
         WHERE lap.auction_id = $1 AND u.unique_id = $2`,
        [id, preset_winner_unique_id]
      );
      if (participantCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Specified user is not a participant' });
      }
      await query(
        `UPDATE lucky_auctions SET preset_winner_unique_id = $1, winner_unique_id = NULL, winner_id = NULL WHERE id = $2`,
        [preset_winner_unique_id, id]
      );
    }

    await drawWinner(id);
    // Automatically make results visible in Mini App after manual draw
    await query(`UPDATE lucky_auctions SET show_in_mini_app = true WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Winner drawn successfully' });
  } catch (error: any) {
    console.error('Manual draw error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
