import express from 'express';
import { query, transaction } from '../db';
import { authenticateBot, AuthRequest } from '../middleware/auth';
import { drawWinner } from '../services/auction.service';

const router = express.Router();

/**
 * GET /api/auctions
 * List active / all auctions
 */
router.get('/', async (req, res) => {
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
    } else {
      queryText += ` AND a.status = 'active'`;
    }

    queryText += ` ORDER BY a.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    const countResult = await query(
      `SELECT COUNT(*) FROM auctions WHERE ${status ? 'status = $1' : "status = 'active'"}`,
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
    console.error('Get auctions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/results
 * Get auction winner records
 */
router.get('/results', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT ar.*, a.title as auction_title, a.image_url
       FROM auction_results ar
       JOIN auctions a ON ar.auction_id = a.id
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
    console.error('Get auction results error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/my
 * Get auctions the authenticated user participates in
 */
router.get('/my', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await query(
      `SELECT
         ap.*,
         a.title,
         a.status as auction_status,
         a.product_value,
         a.per_person_cost,
         a.participant_count,
         a.current_participants,
         a.winner_id,
         a.winner_unique_id,
         a.drawn_at,
         a.expires_at,
         a.image_url,
         ar.id as result_id,
         ar.payout_amount,
         ar.is_redeemed
       FROM auction_participants ap
       JOIN auctions a ON ap.auction_id = a.id
       LEFT JOIN auction_results ar ON ar.auction_id = ap.auction_id AND ar.winner_id = ap.user_id
       WHERE ap.user_id = $1
       ORDER BY ap.created_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, Number(limit), offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM auction_participants WHERE user_id = $1`,
      [user_id]
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
    console.error('Get my auctions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/:id
 * Get auction details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
         a.*,
         p.title as product_name,
         p.cover_image_url as product_image,
         p.description as product_description
       FROM auctions a
       LEFT JOIN nft_products p ON a.product_id = p.id
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('Get auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auctions/:id/participants
 * List participants of an auction (show unique_id for privacy)
 */
router.get('/:id/participants', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT ap.quantity, ap.amount, ap.is_winner, ap.created_at, u.unique_id
       FROM auction_participants ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.auction_id = $1
       ORDER BY ap.created_at ASC
       LIMIT $2 OFFSET $3`,
      [id, Number(limit), offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM auction_participants WHERE auction_id = $1`,
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
 * Join an auction (deduct balance, add participant)
 */
router.post('/:id/join', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { user_id, quantity = 1 } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const qty = parseInt(quantity);
    if (qty < 1) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    const result = await transaction(async (client) => {
      const auctionResult = await client.query(
        `SELECT * FROM auctions WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      if (auction.status !== 'active') {
        throw new Error('Auction is not active');
      }

      if (new Date() > new Date(auction.expires_at)) {
        throw new Error('Auction has expired');
      }

      const existingResult = await client.query(
        `SELECT quantity FROM auction_participants WHERE auction_id = $1 AND user_id = $2`,
        [id, user_id]
      );

      const existingQty = existingResult.rows[0]?.quantity || 0;
      if (existingQty + qty > auction.max_purchases_per_user) {
        throw new Error(
          `You can only purchase up to ${auction.max_purchases_per_user} shares per auction`
        );
      }

      const remaining = auction.participant_count - auction.current_participants;
      if (qty > remaining) {
        throw new Error(`Only ${remaining} slots remaining`);
      }

      const totalCost = Number(auction.per_person_cost) * qty;

      const userResult = await client.query(
        `SELECT balance FROM users WHERE id = $1 FOR UPDATE`,
        [user_id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      if (Number(userResult.rows[0].balance) < totalCost) {
        throw new Error('Insufficient balance');
      }

      await client.query(
        `UPDATE users SET balance = balance - $1 WHERE id = $2`,
        [totalCost, user_id]
      );

      if (existingResult.rows.length > 0) {
        await client.query(
          `UPDATE auction_participants
           SET quantity = quantity + $1, amount = amount + $2
           WHERE auction_id = $3 AND user_id = $4`,
          [qty, totalCost, id, user_id]
        );
      } else {
        await client.query(
          `INSERT INTO auction_participants (auction_id, user_id, quantity, amount)
           VALUES ($1, $2, $3, $4)`,
          [id, user_id, qty, totalCost]
        );
      }

      const updatedAuction = await client.query(
        `UPDATE auctions
         SET current_participants = current_participants + $1, updated_at = NOW()
         WHERE id = $2
         RETURNING current_participants, participant_count`,
        [qty, id]
      );

      return updatedAuction.rows[0];
    });

    if (result.current_participants >= result.participant_count) {
      drawWinner(id).catch((err) => console.error('Draw winner error:', err));
    }

    res.json({
      success: true,
      message: 'Successfully joined auction',
      data: result,
    });
  } catch (error: any) {
    console.error('Join auction error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auctions/results/:id/redeem
 * Winner redeems their prize for USDT
 */
router.post('/results/:id/redeem', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    await transaction(async (client) => {
      const resultRow = await client.query(
        `SELECT * FROM auction_results WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (resultRow.rows.length === 0) {
        throw new Error('Result not found');
      }

      const ar = resultRow.rows[0];

      if (ar.winner_id !== user_id) {
        throw new Error('You are not the winner of this auction');
      }

      if (ar.is_redeemed) {
        throw new Error('Already redeemed');
      }

      await client.query(
        `UPDATE users SET balance = balance + $1 WHERE id = $2`,
        [ar.payout_amount, user_id]
      );

      await client.query(
        `UPDATE auction_results SET is_redeemed = true, redeemed_at = NOW() WHERE id = $1`,
        [id]
      );
    });

    res.json({ success: true, message: 'Prize redeemed successfully' });
  } catch (error: any) {
    console.error('Redeem error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
