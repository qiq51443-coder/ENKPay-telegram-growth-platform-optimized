import express from 'express';
import { query, transaction } from '../db';
import { authenticateBot, authenticateAdmin, AuthRequest } from '../middleware/auth';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';
import { triggerFirstTradeReward } from '../services/invitation-reward.service';

const router = express.Router();

/**
 * GET /api/nft/categories
 * List all NFT categories
 */
router.get('/categories', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, icon_url, sort_order, is_active, created_at
       FROM nft_categories
       WHERE is_active = true
       ORDER BY sort_order, id`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/nft/categories
 * Create NFT category (admin)
 */
router.post('/categories', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, description, icon_url, sort_order = 0 } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const result = await query(
      `INSERT INTO nft_categories (name, description, icon_url, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, description, icon_url, sort_order]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Category created successfully',
    });
  } catch (error: any) {
    console.error('Create category error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/nft/products
 * List NFT products with filters
 */
router.get('/products', async (req, res) => {
  try {
    const { page = 1, limit = 20, category_id, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT 
        p.*,
        c.name as category_name
      FROM nft_products p
      LEFT JOIN nft_categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category_id) {
      params.push(category_id);
      queryText += ` AND p.category_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND p.status = $${params.length}`;
    } else {
      queryText += ` AND p.status = 'active'`;
    }

    queryText += ` ORDER BY p.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM nft_products WHERE 1=1';
    const countParams: any[] = [];
    if (category_id) {
      countParams.push(category_id);
      countQuery += ` AND category_id = $${countParams.length}`;
    }
    if (status) {
      countParams.push(status);
      countQuery += ` AND status = $${countParams.length}`;
    }

    const countResult = await query(countQuery, countParams);

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
    console.error('Get products error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/nft/products/:id
 * Get product details
 */
router.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
         p.*,
         c.name as category_name,
         c.description as category_description
       FROM nft_products p
       LEFT JOIN nft_categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Get product error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/nft/products
 * Create NFT product (admin)
 */
router.post('/products', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      category_id,
      name,
      description,
      image_url,
      price,
      total_supply,
      stock,
      daily_trade_reward_rate,
      max_trade_reward_days,
      metadata,
      product_type,
      status,
      original_price,
      duration_days,
      annual_yield_rate,
      term_days,
      daily_yield_rate,
      max_holders,
      is_purchase_limited,
      max_purchases_per_user,
      rarity,
      listing_time,
      attributes,
      settlement_type,
      settlement_description,
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Missing required fields: name and price' });
    }

    // effectiveSupply is used for both the stock and total_supply columns
    const effectiveSupply = stock !== undefined ? parseInt(stock) : (total_supply !== undefined ? parseInt(total_supply) : 0);

    const result = await query(
      `INSERT INTO nft_products 
       (category_id, name, description, image_url, price, stock, total_supply,
        daily_trade_reward_rate, max_trade_reward_days, metadata,
        product_type, status, original_price, duration_days, annual_yield_rate,
        term_days, daily_yield_rate, max_holders, is_purchase_limited,
        max_purchases_per_user, rarity, listing_time, attributes,
        settlement_type, settlement_description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
               $21, $22, $23, $24, $25)
       RETURNING *`,
      [
        category_id,
        name,
        description,
        image_url,
        parseFloat(price),
        effectiveSupply,
        effectiveSupply,
        daily_trade_reward_rate || 0.01,
        max_trade_reward_days || 30,
        metadata ? JSON.stringify(metadata) : null,
        product_type || 'instant',
        status || 'active',
        original_price ? parseFloat(original_price) : null,
        duration_days ? parseInt(duration_days) : null,
        annual_yield_rate ? parseFloat(annual_yield_rate) : null,
        term_days ? parseInt(term_days) : null,
        daily_yield_rate ? parseFloat(daily_yield_rate) : null,
        max_holders ? parseInt(max_holders) : null,
        is_purchase_limited || false,
        max_purchases_per_user ? parseInt(max_purchases_per_user) : null,
        rarity || null,
        listing_time || null,
        attributes ? JSON.stringify(attributes) : null,
        settlement_type || null,
        settlement_description || null,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Product created successfully',
    });
  } catch (error: any) {
    console.error('Create product error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/nft/products/:id
 * Update NFT product (admin)
 */
router.put('/products/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const updateFields: any = {};
    const params: any[] = [];
    let paramCount = 1;

    const allowedFields = [
      'category_id',
      'name',
      'description',
      'image_url',
      'price',
      'original_price',
      'stock',
      'total_supply',
      'daily_trade_reward_rate',
      'max_trade_reward_days',
      'status',
      'metadata',
      'product_type',
      'duration_days',
      'annual_yield_rate',
      'term_days',
      'daily_yield_rate',
      'max_holders',
      'is_purchase_limited',
      'max_purchases_per_user',
      'rarity',
      'listing_time',
      'attributes',
      'settlement_type',
      'settlement_description',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateFields[field] = `$${paramCount}`;
        if (field === 'metadata' && req.body[field]) {
          params.push(JSON.stringify(req.body[field]));
        } else {
          params.push(req.body[field]);
        }
        paramCount++;
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const setClause = Object.keys(updateFields)
      .map((key) => `${key} = ${updateFields[key]}`)
      .join(', ');

    const result = await query(
      `UPDATE nft_products 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Product updated successfully',
    });
  } catch (error: any) {
    console.error('Update product error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/nft/products/:id
 * Delete NFT product (admin)
 */
router.delete('/products/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await query(
      `UPDATE nft_products SET status = 'inactive' WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/nft/purchase
 * Purchase NFT product
 */
router.post('/purchase', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, product_id } = req.body;

    if (!user_id || !product_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await transaction(async (client) => {
      // Get product details
      const productResult = await client.query(
        `SELECT * FROM nft_products WHERE id = $1 AND status = 'active'`,
        [product_id]
      );

      if (productResult.rows.length === 0) {
        throw new Error('Product not found or inactive');
      }

      const product = productResult.rows[0];

      // Check if sold out
      if (product.sold_count >= product.total_supply) {
        throw new Error('Product is sold out');
      }

      // Get user balance
      const userResult = await client.query(
        'SELECT wallet_balance FROM users WHERE id = $1',
        [user_id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      if (user.wallet_balance < product.price) {
        throw new Error('Insufficient balance');
      }

      // Deduct balance
      await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance - $1
         WHERE id = $2`,
        [product.price, user_id]
      );

      // Update product sold count
      await client.query(
        `UPDATE nft_products 
         SET sold_count = sold_count + 1
         WHERE id = $1`,
        [product_id]
      );

      // Create holding
      const holdingResult = await client.query(
        `INSERT INTO nft_holdings 
         (user_id, product_id, purchase_price, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING *`,
        [user_id, product_id, product.price]
      );

      // Trigger first trade reward for referrer
      await triggerFirstTradeReward(client, user_id);

      return holdingResult.rows[0];
    });

    res.json({
      success: true,
      data: result,
      message: 'NFT purchased successfully',
    });
  } catch (error: any) {
    console.error('Purchase error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/nft/my-holdings
 * Get user's NFT holdings
 */
router.get('/my-holdings', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await query(
      `SELECT 
         h.*,
         p.name as product_name,
         p.description as product_description,
         p.image_url,
         p.daily_trade_reward_rate,
         p.max_trade_reward_days,
         c.name as category_name
       FROM nft_holdings h
       JOIN nft_products p ON h.product_id = p.id
       LEFT JOIN nft_categories c ON p.category_id = c.id
       WHERE h.user_id = $1
       ORDER BY h.created_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, Number(limit), offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM nft_holdings WHERE user_id = $1',
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
    console.error('Get holdings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/nft/my-holdings/:id
 * Get holding details
 */
router.get('/my-holdings/:id', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await query(
      `SELECT 
         h.*,
         p.name as product_name,
         p.description as product_description,
         p.image_url,
         p.daily_trade_reward_rate,
         p.max_trade_reward_days,
         p.metadata,
         c.name as category_name
       FROM nft_holdings h
       JOIN nft_products p ON h.product_id = p.id
       LEFT JOIN nft_categories c ON p.category_id = c.id
       WHERE h.id = $1 AND h.user_id = $2`,
      [id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Holding not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Get holding error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/nft/products/:id/purchase
 * Purchase a periodic product (mini-app auth)
 */
router.post('/products/:id/purchase', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const { id } = req.params;
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    await transaction(async (client) => {
      const userResult = await client.query(
        `SELECT id, balance FROM users WHERE telegram_id = $1 FOR UPDATE`,
        [telegramId]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      const user = userResult.rows[0];

      const productResult = await client.query(
        `SELECT * FROM nft_products WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [id]
      );
      if (productResult.rows.length === 0) throw new Error('Product not found or inactive');
      const product = productResult.rows[0];

      const maxHolders = product.max_holders ?? 100;
      const currentHolders = product.current_holders ?? 0;
      if (currentHolders >= maxHolders) throw new Error('Product is sold out');

      if (product.is_purchase_limited) {
        const purchaseCount = await client.query(
          `SELECT COUNT(*) FROM product_holdings WHERE user_id = $1 AND product_id = $2`,
          [user.id, id]
        );
        if (parseInt(purchaseCount.rows[0].count) >= (product.max_purchases_per_user ?? 1)) {
          throw new Error('Purchase limit reached');
        }
      }

      const amount = parseFloat(product.price);
      if (parseFloat(user.balance) < amount) throw new Error('Insufficient balance');

      await client.query(`UPDATE users SET balance = balance - $1 WHERE id = $2`, [amount, user.id]);

      const startDate = new Date();
      const termDays = product.term_days ?? 30;
      const endDate = new Date(startDate.getTime() + termDays * 86400000);

      await client.query(
        `INSERT INTO product_holdings (user_id, product_id, amount, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [user.id, id, amount, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
      );

      await client.query(
        `UPDATE nft_products SET current_holders = COALESCE(current_holders, 0) + 1 WHERE id = $1`,
        [id]
      );

      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
         SELECT $1, 'product_purchase', $2, balance, $3, $4 FROM users WHERE id = $1`,
        [user.id, -amount, `购买定期产品: ${product.name}`, id]
      );
    });

    res.json({ success: true, message: '购买成功，次日起收益自动到账' });
  } catch (error: any) {
    console.error('Product purchase error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/nft/holdings/my
 * Get current user's product holdings (mini-app auth)
 */
router.get('/holdings/my', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    const userResult = await query(
      `SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`,
      [telegramId]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    const result = await query(
      `SELECT ph.*, p.name as product_name, p.image_url, p.daily_yield_rate, p.term_days
       FROM product_holdings ph
       JOIN nft_products p ON ph.product_id = p.id
       WHERE ph.user_id = $1
       ORDER BY ph.created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Get holdings error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
