import express from 'express';
import { query, transaction } from '../db';
import { authenticateBot, authenticateAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/auction
 * List auctions
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT 
        a.*,
        p.name as product_name,
        p.image_url,
        p.description as product_description
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
      `SELECT COUNT(*) FROM auctions WHERE ${status ? 'status = $1' : '1=1'}`,
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
 * GET /api/auction/my-entries
 * Get user's auction entries
 */
router.get('/my-entries', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await query(
      `SELECT 
         e.*,
         a.title as auction_title,
         a.status as auction_status,
         a.winner_user_id,
         a.winning_share,
         p.name as product_name,
         p.image_url
       FROM auction_entries e
       JOIN auctions a ON e.auction_id = a.id
       LEFT JOIN nft_products p ON a.product_id = p.id
       WHERE e.user_id = $1
       ORDER BY e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, Number(limit), offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM auction_entries WHERE user_id = $1',
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
    console.error('Get my entries error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auction/:id
 * Get auction details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
         a.*,
         p.name as product_name,
         p.image_url,
         p.description as product_description,
         p.metadata
       FROM auctions a
       LEFT JOIN nft_products p ON a.product_id = p.id
       WHERE a.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Auction not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Get auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auction
 * Create auction (admin)
 */
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      product_id,
      title,
      description,
      entry_price,
      total_shares,
      start_time,
      end_time,
    } = req.body;

    if (!title || !entry_price || !total_shares || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO auctions 
       (product_id, title, description, entry_price, total_shares, 
        start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [
        product_id,
        title,
        description,
        parseFloat(entry_price),
        parseInt(total_shares),
        start_time,
        end_time,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Auction created successfully',
    });
  } catch (error: any) {
    console.error('Create auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auction/:id/enter
 * Enter auction
 */
router.post('/:id/enter', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { user_id, num_shares = 1 } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const shares = parseInt(num_shares);
    if (shares < 1) {
      return res.status(400).json({ error: 'Invalid number of shares' });
    }

    const result = await transaction(async (client) => {
      // Get auction details
      const auctionResult = await client.query(
        'SELECT * FROM auctions WHERE id = $1',
        [id]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      // Verify auction is active
      if (auction.status !== 'active') {
        throw new Error('Auction is not active');
      }

      const now = new Date();
      if (now < new Date(auction.start_time) || now > new Date(auction.end_time)) {
        throw new Error('Auction is not in valid time range');
      }

      // Check if shares available
      if (auction.sold_shares + shares > auction.total_shares) {
        throw new Error('Not enough shares available');
      }

      // Calculate total cost
      const totalCost = auction.entry_price * shares;

      // Get user balance
      const userResult = await client.query(
        'SELECT wallet_balance FROM users WHERE id = $1',
        [user_id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      if (userResult.rows[0].wallet_balance < totalCost) {
        throw new Error('Insufficient balance');
      }

      // Deduct balance
      await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance - $1
         WHERE id = $2`,
        [totalCost, user_id]
      );

      // Assign share numbers
      const startShare = auction.sold_shares + 1;
      const endShare = auction.sold_shares + shares;
      const shareNumbers: number[] = [];
      for (let i = startShare; i <= endShare; i++) {
        shareNumbers.push(i);
      }

      // Create entry
      const entryResult = await client.query(
        `INSERT INTO auction_entries 
         (auction_id, user_id, num_shares, share_numbers, amount_paid)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, user_id, shares, JSON.stringify(shareNumbers), totalCost]
      );

      // Update auction sold shares
      await client.query(
        `UPDATE auctions 
         SET sold_shares = sold_shares + $1
         WHERE id = $2`,
        [shares, id]
      );

      return entryResult.rows[0];
    });

    res.json({
      success: true,
      data: result,
      message: 'Entered auction successfully',
    });
  } catch (error: any) {
    console.error('Enter auction error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auction/:id/entries
 * List auction entries
 */
router.get('/:id/entries', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT 
         e.*,
         u.username,
         u.first_name,
         u.robot_user_id
       FROM auction_entries e
       JOIN users u ON e.user_id = u.id
       WHERE e.auction_id = $1
       ORDER BY e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, Number(limit), offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM auction_entries WHERE auction_id = $1',
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
    console.error('Get entries error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auction/:id/draw
 * Draw auction winner (admin)
 */
router.post('/:id/draw', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await transaction(async (client) => {
      // Get auction details
      const auctionResult = await client.query(
        'SELECT * FROM auctions WHERE id = $1',
        [id]
      );

      if (auctionResult.rows.length === 0) {
        throw new Error('Auction not found');
      }

      const auction = auctionResult.rows[0];

      if (auction.status !== 'active') {
        throw new Error('Auction is not active');
      }

      if (auction.sold_shares === 0) {
        throw new Error('No entries in auction');
      }

      // Draw random winning share number
      const winningShare = Math.floor(Math.random() * auction.sold_shares) + 1;

      // Find winner
      const winnerResult = await client.query(
        `SELECT * FROM auction_entries 
         WHERE auction_id = $1 
         AND share_numbers @> $2::jsonb`,
        [id, JSON.stringify([winningShare])]
      );

      if (winnerResult.rows.length === 0) {
        throw new Error('Winner not found');
      }

      const winner = winnerResult.rows[0];

      // Update auction with winner
      await client.query(
        `UPDATE auctions 
         SET status = 'completed',
             winner_user_id = $1,
             winning_share = $2,
             draw_time = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [winner.user_id, winningShare, id]
      );

      // If auction has product, create NFT holding for winner
      if (auction.product_id) {
        await client.query(
          `INSERT INTO nft_holdings 
           (user_id, product_id, purchase_price, acquisition_type, status)
           VALUES ($1, $2, $3, 'auction', 'active')`,
          [winner.user_id, auction.product_id, 0]
        );
      }

      // TODO: Send notification to winner

      return {
        winner_user_id: winner.user_id,
        winning_share: winningShare,
        winner_entry: winner,
      };
    });

    res.json({
      success: true,
      data: result,
      message: 'Winner drawn successfully',
    });
  } catch (error: any) {
    console.error('Draw winner error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
