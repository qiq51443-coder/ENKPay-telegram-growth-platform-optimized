import express from 'express';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { refundAuction } from '../services/auction.service';

const router = express.Router();

/**
 * GET /api/admin/auctions
 * List all auctions with participant stats
 */
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT
        a.*,
        p.title as product_name,
        p.cover_image_url as product_image
      FROM auctions a
      LEFT JOIN nft_products p ON a.product_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND a.status = $${params.length}`;
    }

    queryText += ` ORDER BY a.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    const countResult = await query(
      `SELECT COUNT(*) FROM auctions${status ? ' WHERE status = $1' : ''}`,
      status ? [status] : []
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
    console.error('Admin get auctions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/auctions/:id
 * Get auction details with participant list
 */
router.get('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const auctionResult = await query(
      `SELECT a.*, p.title as product_name, p.cover_image_url as product_image
       FROM auctions a
       LEFT JOIN nft_products p ON a.product_id = p.id
       WHERE a.id = $1`,
      [id]
    );

    if (auctionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    const participantsResult = await query(
      `SELECT ap.*, u.unique_id, u.username, u.first_name
       FROM auction_participants ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.auction_id = $1
       ORDER BY ap.created_at ASC`,
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
    console.error('Admin get auction error:', error);
    res.status(500).json({ error: error.message });
  }
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
    } = req.body;

    if (!title || !product_value || !participant_count || !expires_at) {
      return res.status(400).json({
        error: 'title, product_value, participant_count, and expires_at are required',
      });
    }

    const pv = parseFloat(product_value);
    const pc = parseInt(participant_count);
    const feePercent = parseFloat(platform_fee_percent);
    const perPersonCost = pv / pc;
    const winnerPayout = pv * (1 - feePercent / 100);

    const result = await query(
      `INSERT INTO auctions
       (product_id, title, description, image_url, product_value, participant_count,
        per_person_cost, max_purchases_per_user, platform_fee_percent, winner_payout,
        expires_at, notify_channels, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
       RETURNING *`,
      [
        product_id || null,
        title,
        description || null,
        image_url || null,
        pv,
        pc,
        perPersonCost,
        parseInt(max_purchases_per_user),
        feePercent,
        winnerPayout,
        expires_at,
        notify_channels,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Auction created successfully',
    });
  } catch (error: any) {
    console.error('Admin create auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/auctions/:id
 * Edit auction (only active auctions with no participants)
 */
router.put('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await query(
      `SELECT status, current_participants FROM auctions WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    if (existing.rows[0].status !== 'active') {
      return res.status(400).json({ error: 'Only active auctions can be edited' });
    }

    const allowedFields = [
      'title', 'description', 'image_url', 'expires_at',
      'max_purchases_per_user', 'notify_channels',
    ];
    const params: any[] = [];
    const setClauses: string[] = [];
    let paramCount = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        setClauses.push(`${field} = $${paramCount}`);
        params.push(req.body[field]);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE auctions SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    res.json({ success: true, data: result.rows[0], message: 'Auction updated' });
  } catch (error: any) {
    console.error('Admin update auction error:', error);
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

    const existing = await query(
      `SELECT status, current_participants FROM auctions WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    const auction = existing.rows[0];
    if (auction.status !== 'active' || auction.current_participants > 0) {
      return res.status(400).json({
        error: 'Only active auctions with no participants can be deleted',
      });
    }

    await query(`DELETE FROM auctions WHERE id = $1`, [id]);

    res.json({ success: true, message: 'Auction deleted' });
  } catch (error: any) {
    console.error('Admin delete auction error:', error);
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

    const existing = await query(
      `SELECT * FROM auctions WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    const auction = existing.rows[0];
    if (auction.status !== 'active') {
      return res.status(400).json({ error: 'Only active auctions can be cancelled' });
    }

    // Mark as cancelled
    await query(
      `UPDATE auctions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Refund all participants
    await refundAuction({ ...auction, status: 'cancelled' });

    res.json({ success: true, message: 'Auction cancelled and participants refunded' });
  } catch (error: any) {
    console.error('Admin cancel auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/auction-results
 * List all auction results / winner records
 */
router.get('/auction-results', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT ar.*, a.title as auction_title, a.image_url,
              u.username, u.first_name
       FROM auction_results ar
       JOIN auctions a ON ar.auction_id = a.id
       JOIN users u ON ar.winner_id = u.id
       ORDER BY ar.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    );

    const countResult = await query(`SELECT COUNT(*) FROM auction_results`, []);

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
    console.error('Admin get auction results error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
