import express from 'express';
import { query } from '../db';
import { authenticateAdmin, authenticateBot, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Apply rate limiting to all order routes
router.use(adminLimiter);

/**
 * GET /api/orders — Admin: list all orders with pagination and search
 */
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, order_id, status, type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT o.*, u.username, u.unique_id, u.telegram_id
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (order_id) {
      params.push(`%${order_id}%`);
      queryText += ` AND o.order_id ILIKE $${params.length}`;
    }
    if (status) {
      params.push(status);
      queryText += ` AND o.status = $${params.length}`;
    }
    if (type) {
      params.push(type);
      queryText += ` AND o.type = $${params.length}`;
    }

    queryText += ` ORDER BY o.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    // Count query
    let countText = `SELECT COUNT(*) FROM orders o WHERE 1=1`;
    const countParams: any[] = [];
    if (order_id) {
      countParams.push(`%${order_id}%`);
      countText += ` AND o.order_id ILIKE $${countParams.length}`;
    }
    if (status) {
      countParams.push(status);
      countText += ` AND o.status = $${countParams.length}`;
    }
    if (type) {
      countParams.push(type);
      countText += ` AND o.type = $${countParams.length}`;
    }
    const countResult = await query(countText, countParams);

    res.json({
      orders: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/orders/user/:userId — Get user orders (for bot/mini-app)
 */
router.get('/user/:userId', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;

    const result = await query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, Number(limit)]
    );

    res.json({ orders: result.rows });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/orders/:orderId — Get single order by order_id
 */
router.get('/:orderId', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { orderId } = req.params;
    const result = await query(
      `SELECT o.*, u.username, u.unique_id, u.telegram_id
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.order_id = $1`,
      [orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order: result.rows[0] });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/orders/:orderId/status — Update order status
 */
router.put('/:orderId/status', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE order_id = $2 RETURNING *`,
      [status, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order: result.rows[0] });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
