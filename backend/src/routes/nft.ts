import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import { translateToAllLangs } from '../utils/translate';
import { query, transaction } from '../db';
import { authenticateBot, authenticateAdmin, AuthRequest } from '../middleware/auth';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';
import { triggerFirstTradeReward } from '../services/invitation-reward.service';
import { runNFTDailySettle } from '../jobs/nft-daily-settle';
import {
  buildNFTPurchaseDescription,
  buildNFTIncomeDescription,
  buildNFTPrincipalReturnDescription,
  buildNFTPurchaseSuccessMessage,
} from '../i18n/nft-notifications';
const router = express.Router();

// UUID format validation regex (compiled once at module level)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Image upload setup ───────────────────────────────────────────────────────

const uploadDir = path.join(__dirname, '../../uploads/nft');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * GET /api/nft/categories
 * List all NFT categories
 */
router.get('/categories', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, icon_url, sort_order, is_active, created_at
       FROM nft_categories
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
    const { page = 1, limit = 20, category_id, status, lang } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Build WHERE clause additions + ORDER BY/LIMIT/OFFSET that are shared by
    // both the full query (with holdings joins) and the fallback query.
    const params: any[] = [];
    let whereClause = '';

    if (category_id) {
      params.push(category_id);
      whereClause += ` AND p.category_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      whereClause += ` AND p.status = $${params.length}`;
    }
    // No default status filter — callers (e.g. admin panel) can see all products;
    // front-end mini-app passes status=active explicitly when needed.

    params.push(Number(limit), offset);
    const paginationClause = ` ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    // Primary query: LEFT JOIN aggregation instead of correlated subqueries so
    // the query remains valid even when the holdings tables have zero rows.
    const fullQuery = `
      SELECT 
        p.*,
        c.name as category_name,
        COALESCE(p.display_holders_count, 0)
        + COALESCE(nh.nft_holders_count, 0)
        + COALESCE(ph.product_holders_count, 0)
        AS total_holders_count
      FROM nft_products p
      LEFT JOIN nft_categories c ON p.category_id = c.id
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS nft_holders_count
        FROM nft_holdings
        WHERE status = 'active'
        GROUP BY product_id
      ) nh ON nh.product_id = p.id
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS product_holders_count
        FROM product_holdings
        WHERE status = 'active'
        GROUP BY product_id
      ) ph ON ph.product_id = p.id
      WHERE 1=1${whereClause}${paginationClause}
    `;

    // Fallback query used when either holdings table does not yet exist (42P01).
    // Returns display_holders_count only so the endpoint always succeeds.
    const fallbackQuery = `
      SELECT 
        p.*,
        c.name as category_name,
        COALESCE(p.display_holders_count, 0) AS total_holders_count
      FROM nft_products p
      LEFT JOIN nft_categories c ON p.category_id = c.id
      WHERE 1=1${whereClause}${paginationClause}
    `;

    let result: any;
    try {
      result = await query(fullQuery, params);
    } catch (queryErr: any) {
      // 42P01 = undefined_table
      // 42703 = undefined_column
      // 42804 = datatype mismatch (e.g. product_holdings.product_id is UUID but nft_products.id is INT)
      // 42883 = operator does not exist (type mismatch in JOIN condition)
      // 22P02 = invalid input syntax for type (cast failure)
      const isSchemaError = (code: string) =>
        ['42P01', '42703', '42804', '42883', '22P02'].includes(code);

      if (isSchemaError(queryErr.code)) {
        console.warn(`GET /nft/products: primary query failed (${queryErr.code}: ${queryErr.message}), trying fallback`);
        try {
          result = await query(fallbackQuery, params);
        } catch (fallbackErr: any) {
          // fallbackQuery still references display_holders_count which may also be missing
          if (isSchemaError(fallbackErr.code)) {
            console.warn(`GET /nft/products: fallback query failed (${fallbackErr.code}: ${fallbackErr.message}), trying bare minimum`);
            // Ultimate fallback: bare minimum query with no optional columns
            result = await query(
              `SELECT p.*, 0 AS total_holders_count
               FROM nft_products p
               WHERE 1=1${whereClause}${paginationClause}`,
              params
            );
          } else {
            throw fallbackErr;
          }
        }
      } else {
        throw queryErr;
      }
    }

    // Map description based on requested language
    const langCode = typeof lang === 'string' ? lang.split('-')[0] : null;
    const rows = result.rows.map((row: any) => {
      if (langCode && row.description_i18n) {
        const i18n = typeof row.description_i18n === 'string'
          ? JSON.parse(row.description_i18n)
          : row.description_i18n;
        // Only apply i18n if the object has actual language keys
        if (i18n && typeof i18n === 'object' && Object.keys(i18n).length > 0) {
          const localDesc = i18n[langCode] || i18n['en'] || row.description;
          if (localDesc) row.description = localDesc;
        }
      }
      return row;
    });

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
      data: rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count),
      },
    });
  } catch (error: any) {
    console.error('Get products error:', error.message, error.stack);
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

    const fullQuery = `
      SELECT
        p.*,
        c.name as category_name,
        c.description as category_description,
        COALESCE(p.display_holders_count, 0)
        + COALESCE(nh.nft_holders_count, 0)
        + COALESCE(ph.product_holders_count, 0)
        AS total_holders_count
      FROM nft_products p
      LEFT JOIN nft_categories c ON p.category_id = c.id
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS nft_holders_count
        FROM nft_holdings
        WHERE status = 'active'
        GROUP BY product_id
      ) nh ON nh.product_id = p.id
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS product_holders_count
        FROM product_holdings
        WHERE status = 'active'
        GROUP BY product_id
      ) ph ON ph.product_id = p.id
      WHERE p.id = $1
    `;

    let result: any;
    try {
      result = await query(fullQuery, [id]);
    } catch (queryErr: any) {
      const isSchemaError = (code: string) =>
        ['42P01', '42703', '42804', '42883', '22P02'].includes(code);
      if (isSchemaError(queryErr.code)) {
        result = await query(
          `SELECT p.*, c.name as category_name, c.description as category_description,
                  COALESCE(p.display_holders_count, 0) AS total_holders_count
           FROM nft_products p
           LEFT JOIN nft_categories c ON p.category_id = c.id
           WHERE p.id = $1`,
          [id]
        );
      } else {
        throw queryErr;
      }
    }

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
      title,
      description,
      description_i18n,
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
      term_days,
      daily_yield_rate,
      max_holders,
      is_purchase_limited,
      max_purchases_per_user,
      rarity,
      listing_time,
      settlement_type,
      settlement_description,
      display_holders_count,
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Missing required fields: name and price' });
    }

    // effectiveSupply is used for both the stock and total_supply columns
    // Use nullish coalescing so that an explicit stock=0 is honoured
    const effectiveSupply = stock != null ? parseInt(stock) : (total_supply != null ? parseInt(total_supply) : 0);

    const result = await query(
      `INSERT INTO nft_products 
       (category_id, name, title, description, description_i18n, image_url, price, stock, total_supply,
        daily_trade_reward_rate, max_trade_reward_days, metadata,
        product_type, status, original_price, duration_days,
        term_days, daily_yield_rate, max_holders, is_purchase_limited,
        max_purchases_per_user, rarity, listing_time,
        settlement_type, settlement_description, display_holders_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
               $21, $22, $23, $24, $25, $26)
       RETURNING *`,
      [
        category_id,
        name,
        title || name,
        description,
        description_i18n ? JSON.stringify(description_i18n) : '{}',
        image_url,
        parseFloat(price),
        effectiveSupply,
        effectiveSupply,
        daily_trade_reward_rate != null ? parseFloat(daily_trade_reward_rate) : 0,
        max_trade_reward_days || 30,
        metadata ? JSON.stringify(metadata) : null,
        product_type || 'instant',
        status || 'active',
        original_price ? parseFloat(original_price) : null,
        duration_days ? parseInt(duration_days) : null,
        term_days ? parseInt(term_days) : null,
        daily_yield_rate ? parseFloat(daily_yield_rate) : null,
        max_holders ? parseInt(max_holders) : null,
        is_purchase_limited || false,
        max_purchases_per_user ? parseInt(max_purchases_per_user) : null,
        rarity || null,
        listing_time || null,
        settlement_type || null,
        settlement_description || null,
        display_holders_count ? parseInt(display_holders_count) : 0,
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
      'title',
      'description',
      'description_i18n',
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
      'term_days',
      'daily_yield_rate',
      'max_holders',
      'is_purchase_limited',
      'max_purchases_per_user',
      'rarity',
      'listing_time',
      'settlement_type',
      'settlement_description',
      'display_holders_count',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateFields[field] = `$${paramCount}`;
        if ((field === 'metadata' || field === 'description_i18n') && req.body[field]) {
          params.push(typeof req.body[field] === 'object' ? JSON.stringify(req.body[field]) : req.body[field]);
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
 * Purchase NFT product (locks funds in nft_balance for fixed_term products)
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
        'SELECT wallet_balance, language_code FROM users WHERE id = $1',
        [user_id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      if (user.wallet_balance < product.price) {
        throw new Error('Insufficient balance');
      }

      // Deduct from wallet_balance; for fixed_term products lock in nft_balance
      const isFixedTerm = product.product_type === 'fixed_term';
      if (isFixedTerm) {
        await client.query(
          `UPDATE users 
           SET wallet_balance = wallet_balance - $1,
               nft_balance = COALESCE(nft_balance, 0) + $1
           WHERE id = $2`,
          [product.price, user_id]
        );
      } else {
        await client.query(
          `UPDATE users 
           SET wallet_balance = wallet_balance - $1
           WHERE id = $2`,
          [product.price, user_id]
        );
      }

      // Update product sold count
      await client.query(
        `UPDATE nft_products 
         SET sold_count = sold_count + 1
         WHERE id = $1`,
        [product_id]
      );

      // Create holding (with expires_at for fixed_term products)
      const termDays = product.term_days ?? product.duration_days ?? null;
      const expiresAt = (isFixedTerm && termDays)
        ? new Date(Date.now() + termDays * 86400000).toISOString()
        : null;

      const holdingResult = await client.query(
        `INSERT INTO nft_holdings 
         (user_id, product_id, purchase_price, status, expires_at)
         VALUES ($1, $2, $3, 'active', $4)
         RETURNING *`,
        [user_id, product_id, product.price, expiresAt]
      );

      // Write transactions record
      const lang = ((user.language_code as string) || 'en').split('-')[0];
      const purchaseDesc = buildNFTPurchaseDescription({ lang, product_name: product.name });
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
         SELECT $1, 'product_purchase', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
        [user_id, -parseFloat(product.price), purchaseDesc, String(holdingResult.rows[0].id)]
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

    // nft_products.id is SERIAL (integer) — validate as positive integer
    const productId = parseInt(id, 10);
    if (isNaN(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product ID — expected a positive integer' });
    }

    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    await transaction(async (client) => {
      // ✅ Fix: use wallet_balance instead of balance
      const userResult = await client.query(
        `SELECT id, wallet_balance, language_code FROM users WHERE telegram_id = $1 FOR UPDATE`,
        [telegramId]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      const user = userResult.rows[0];

      const productResult = await client.query(
        `SELECT * FROM nft_products WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [productId]
      );
      if (productResult.rows.length === 0) throw new Error('Product not found or inactive');
      const product = productResult.rows[0];

      const maxHolders = product.max_holders ?? 100;
      const currentHolders = product.current_holders ?? 0;
      if (currentHolders >= maxHolders) throw new Error('Product is sold out');

      if (product.is_purchase_limited) {
        const purchaseCount = await client.query(
          `SELECT COUNT(*) AS total_count FROM product_holdings
           WHERE user_id = $1 AND product_id = $2 AND status = 'active'`,
          [user.id, productId]
        );
        if (parseInt(purchaseCount.rows[0].total_count) >= (product.max_purchases_per_user ?? 1)) {
          throw new Error('Purchase limit reached');
        }
      }

      const amount = parseFloat(product.price);
      // ✅ Fix: check wallet_balance (treat NULL as 0)
      if (parseFloat(user.wallet_balance ?? 0) < amount) throw new Error('Insufficient balance');

      // ✅ Fix: deduct from wallet_balance and lock principal in nft_balance
      await client.query(
        `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) - $1, nft_balance = COALESCE(nft_balance, 0) + $1 WHERE id = $2`,
        [amount, user.id]
      );

      const startDate = new Date();
      const termDays = product.term_days ?? 30;
      const endDate = new Date(startDate.getTime() + termDays * 86400000);

      // Write to product_holdings (for nft-yield.service.ts compatibility)
      const holdingInsert = await client.query(
        `INSERT INTO product_holdings (user_id, product_id, amount, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
        [user.id, productId, amount, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
      );

      await client.query(
        `UPDATE nft_products SET current_holders = COALESCE(current_holders, 0) + 1 WHERE id = $1`,
        [productId]
      );

      // Write transactions record with i18n description
      const lang = ((user.language_code as string) || 'en').split('-')[0];
      const purchaseDesc = buildNFTPurchaseDescription({ lang, product_name: product.name });
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
         SELECT $1, 'product_purchase', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
        [user.id, -amount, purchaseDesc, String(holdingInsert.rows[0].id)]
      );

      return { lang };
    }).then(({ lang }) => {
      const successMsg = buildNFTPurchaseSuccessMessage({ lang });
      res.json({ success: true, message: successMsg });
    });
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
      `SELECT id, language_code FROM users WHERE telegram_id = $1 LIMIT 1`,
      [telegramId]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    // Determine language: prefer ?lang query param, fallback to user's stored language_code
    const lang = ((req.query.lang as string) || (userResult.rows[0].language_code as string) || 'en').split('-')[0];

    const result = await query(
      `SELECT ph.*, p.name as product_name, p.image_url, p.daily_yield_rate, p.term_days
       FROM product_holdings ph
       JOIN nft_products p ON ph.product_id = p.id
       WHERE ph.user_id = $1
       ORDER BY ph.created_at DESC`,
      [userId]
    );

    // Fetch income records for this user, ordered by date
    const incomeResult = await query(
      `SELECT id, holding_id, amount, income_date, created_at
       FROM nft_income_records
       WHERE user_id = $1
       ORDER BY income_date ASC`,
      [userId]
    );

    // Group income records by holding_id
    const incomeByHolding: Record<string, any[]> = {};
    for (const row of incomeResult.rows) {
      if (!incomeByHolding[row.holding_id]) incomeByHolding[row.holding_id] = [];
      incomeByHolding[row.holding_id].push(row);
    }

    // Build holdings with order_records and total_income
    const holdings = result.rows.map((h: any) => {
      const incomeRows = incomeByHolding[h.id] || [];
      const total_income = incomeRows.reduce((sum: number, r: any) => sum + parseFloat(r.amount || 0), 0);

      const order_records: any[] = [];
      // First entry: purchase (negative amount = outflow of funds)
      order_records.push({
        type: 'purchase',
        amount: -parseFloat(h.amount || 0),
        description: buildNFTPurchaseDescription({ lang, product_name: h.product_name }),
        created_at: h.created_at,
      });
      // Daily income entries
      incomeRows.forEach((r: any, idx: number) => {
        order_records.push({
          type: 'income',
          amount: parseFloat(r.amount || 0),
          description: buildNFTIncomeDescription({ lang, product_name: h.product_name, day: idx + 1 }),
          income_date: r.income_date,
          created_at: r.created_at,
        });
      });
      // Principal return if expired
      if (h.status === 'expired') {
        order_records.push({
          type: 'principal',
          amount: parseFloat(h.amount || 0),
          description: buildNFTPrincipalReturnDescription({ lang, product_name: h.product_name }),
          created_at: h.updated_at || h.end_date,
        });
      }

      return { ...h, total_income, order_records };
    });

    res.json({ success: true, data: holdings });
  } catch (error: any) {
    console.error('Get holdings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/nft/upload-image
 * Upload an NFT product image (admin) — returns a persistent URL (field: image)
 */
router.post('/upload-image', authenticateAdmin, upload.single('image'), (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const url = `/uploads/nft/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (error: any) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/nft/upload
 * Upload an NFT product image (admin) — returns a persistent URL (field: file)
 * Used by the Ant Design Upload component with action prop
 */
router.post('/upload', authenticateAdmin, upload.single('file'), (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    const url = `/uploads/nft/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (error: any) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/nft/translate-description
 * Translate a product description into 7 languages
 */
router.post('/translate-description', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const translations = await translateToAllLangs(text);

    res.json({ success: true, data: translations });
  } catch (error: any) {
    console.error('Translate description error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/nft/products/:id/holders
 * Get users holding a specific product (admin).
 * Queries both product_holdings (Mini-App purchases) and nft_holdings (Bot
 * purchases) and returns a merged, time-sorted list.
 */
router.get('/products/:id/holders', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // ── Mini-App purchases (product_holdings) ────────────────────────────────
    const phResult = await query(
      `SELECT
         ph.id AS holding_id,
         ph.user_id,
         u.username,
         u.first_name,
         u.telegram_id,
         ph.amount AS purchase_price,
         ph.created_at AS purchase_date,
         ph.end_date::TIMESTAMPTZ AS expires_at,
         ph.status,
         COALESCE(inc.total_income, 0) AS total_income,
         p.term_days,
         EXTRACT(EPOCH FROM (NOW() - ph.created_at)) / 86400 /* seconds per day */ AS days_elapsed
       FROM product_holdings ph
       JOIN users u ON ph.user_id = u.id
       JOIN nft_products p ON ph.product_id = p.id
       LEFT JOIN (
         SELECT holding_id, SUM(amount) AS total_income
         FROM nft_income_records
         GROUP BY holding_id
       ) inc ON inc.holding_id = ph.id
       WHERE ph.product_id = $1
       ORDER BY ph.created_at DESC`,
      [id]
    );

    // ── Bot purchases (nft_holdings) ──────────────────────────────────────────
    const nhResult = await query(
      `SELECT
         h.id AS holding_id,
         h.user_id,
         u.username,
         u.first_name,
         u.telegram_id,
         h.purchase_price,
         h.created_at AS purchase_date,
         h.expires_at,
         h.status,
         h.total_income,
         p.term_days,
         EXTRACT(EPOCH FROM (NOW() - h.created_at)) / 86400 /* seconds per day */ AS days_elapsed
       FROM nft_holdings h
       JOIN users u ON h.user_id = u.id
       JOIN nft_products p ON h.product_id = p.id
       WHERE h.product_id = $1
       ORDER BY h.created_at DESC`,
      [id]
    );

    const mapRow = (row: any) => ({
      holding_id: row.holding_id,
      user_id: row.user_id,
      username: row.username || row.first_name || `User ${row.telegram_id}`,
      purchase_price: parseFloat(row.purchase_price),
      purchase_date: row.purchase_date,
      purchase_date_ms: new Date(row.purchase_date).getTime(),
      term_days: row.term_days,
      days_elapsed: Math.floor(parseFloat(row.days_elapsed || 0)),
      status: row.status,
      expires_at: row.expires_at,
      total_income: parseFloat(row.total_income || 0),
    });

    const holders = [
      ...phResult.rows.map(mapRow),
      ...nhResult.rows.map(mapRow),
    ].sort((a, b) => b.purchase_date_ms - a.purchase_date_ms)
     .map(({ purchase_date_ms: _unused, ...rest }) => rest);

    res.json({
      success: true,
      total: holders.filter(h => h.status === 'active').length,
      holders,
    });
  } catch (error: any) {
    console.error('Get product holders error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/nft/admin/settle/trigger
 * Manually trigger NFT daily settlement (admin only)
 * Used for testing or manual compensation.
 */
router.post('/admin/settle/trigger', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    console.log(`[NFT Admin] Manual settle triggered by admin ${req.user?.username} (id=${req.user?.id})`);
    // Run asynchronously so the HTTP response returns immediately
    runNFTDailySettle().catch((err: any) => {
      console.error('[NFT Admin] Manual settle error:', err.message);
    });
    res.json({
      success: true,
      message: 'NFT daily settlement triggered. Check server logs for progress.',
    });
  } catch (error: any) {
    console.error('Manual settle trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/nft/admin/settle/status
 * Query the last settlement records (admin only)
 * Returns the most recent 50 income records across all holdings.
 */
router.get('/admin/settle/status', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT
         ir.id,
         ir.holding_id,
         ir.user_id,
         ir.product_id,
         ir.amount,
         ir.income_date,
         ir.created_at,
         p.name AS product_name,
         u.username,
         u.telegram_id
       FROM nft_income_records ir
       JOIN nft_products p ON ir.product_id = p.id
       JOIN users u ON ir.user_id = u.id
       ORDER BY ir.created_at DESC
       LIMIT 50`
    );

    const todayUTC = new Date().toISOString().slice(0, 10);
    const todayCount = result.rows.filter((r: any) => r.income_date === todayUTC).length;

    res.json({
      success: true,
      today_utc: todayUTC,
      today_settled_count: todayCount,
      recent_records: result.rows,
    });
  } catch (error: any) {
    console.error('Settle status error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
