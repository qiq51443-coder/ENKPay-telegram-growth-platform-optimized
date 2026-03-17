import express from 'express';
import { query, transaction } from '../db';
import { authenticateBot, authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

/**
 * GET /api/charity/banners
 * List active charity banners (public)
 */
router.get('/banners', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, image_url, title, sort_order
       FROM charity_banners
       WHERE is_active = true
       ORDER BY sort_order ASC, created_at ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Get banners error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/charity/banners
 * Create banner (admin)
 */
router.post('/banners', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { image_url, title, sort_order = 0 } = req.body;
    if (!image_url) return res.status(400).json({ error: 'image_url is required' });
    const result = await query(
      `INSERT INTO charity_banners (image_url, title, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [image_url, title, sort_order]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('Create banner error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/charity/banners/:id
 * Delete banner (admin)
 */
router.delete('/banners/:id', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await query(`UPDATE charity_banners SET is_active = false WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Banner deleted' });
  } catch (error: any) {
    console.error('Delete banner error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/charity/projects
 * List charity projects
 */
router.get('/projects', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT 
        id, title, description, image_url,
        target_amount AS goal_amount, raised_amount,
        organization, website_url,
        status, start_at AS start_date, end_at AS end_date, created_at, updated_at,
        ambassador_telegram, is_active
      FROM charity_projects
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND status = $${params.length}`;
    } else {
      queryText += ` AND status = 'active'`;
    }

    queryText += ` ORDER BY created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    let countQuery = 'SELECT COUNT(*) FROM charity_projects WHERE 1=1';
    const countParams: any[] = [];
    if (status) {
      countParams.push(status);
      countQuery += ' AND status = $1';
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
    console.error('Get projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/charity/projects/:id
 * Get charity project details
 */
router.get('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT * FROM charity_projects WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Get project error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/charity/projects
 * Create charity project (admin)
 */
router.post('/projects', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      title,
      description,
      image_url,
      goal_amount,
      start_date,
      end_date,
      organization,
      website_url,
      ambassador_telegram,
      is_active,
      status,
    } = req.body;

    if (!title || !goal_amount) {
      return res.status(400).json({ error: 'title and goal_amount are required' });
    }

    const result = await query(
      `INSERT INTO charity_projects 
       (title, description, image_url, target_amount, start_at, end_at,
        organization, website_url, ambassador_telegram, is_active, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, title, description, image_url,
         target_amount AS goal_amount, raised_amount,
         organization, website_url, ambassador_telegram, is_active, status,
         start_at AS start_date, end_at AS end_date,
         created_at, updated_at`,
      [
        title,
        description || null,
        image_url || null,
        parseFloat(goal_amount),
        start_date || null,
        end_date || null,
        organization || null,
        website_url || null,
        ambassador_telegram || null,
        is_active !== undefined ? is_active : true,
        status || 'active',
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Charity project created successfully',
    });
  } catch (error: any) {
    console.error('Create project error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/charity/projects/:id
 * Update charity project (admin)
 */
router.put('/projects/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const updateFields: any = {};
    const params: any[] = [];
    let paramCount = 1;

    // Map frontend field names to DB column names
    const fieldMapping: Record<string, string> = {
      title: 'title',
      description: 'description',
      image_url: 'image_url',
      goal_amount: 'target_amount',
      start_date: 'start_at',
      end_date: 'end_at',
      organization: 'organization',
      website_url: 'website_url',
      status: 'status',
      ambassador_telegram: 'ambassador_telegram',
      is_active: 'is_active',
    };

    for (const [frontendField, dbField] of Object.entries(fieldMapping)) {
      if (req.body[frontendField] !== undefined) {
        updateFields[dbField] = `$${paramCount}`;
        params.push(req.body[frontendField]);
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
      `UPDATE charity_projects 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Project updated successfully',
    });
  } catch (error: any) {
    console.error('Update project error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/charity/donate
 * Make donation to charity project
 */
router.post('/donate', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, project_id, amount, message } = req.body;

    if (!user_id || !project_id || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const donationAmount = parseFloat(amount);
    if (donationAmount <= 0) {
      return res.status(400).json({ error: 'Invalid donation amount' });
    }

    const result = await transaction(async (client) => {
      // Get project details
      const projectResult = await client.query(
        'SELECT * FROM charity_projects WHERE id = $1 AND status = $2',
        [project_id, 'active']
      );

      if (projectResult.rows.length === 0) {
        throw new Error('Project not found or not active');
      }

      const project = projectResult.rows[0];

      // Check if project ended
      if (project.end_at && new Date() > new Date(project.end_at)) {
        throw new Error('Project has ended');
      }

      // Get user balance
      const userResult = await client.query(
        'SELECT balance FROM users WHERE id = $1',
        [user_id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      if (parseFloat(String(userResult.rows[0].balance)) < donationAmount) {
        throw new Error('Insufficient balance');
      }

      // Deduct balance
      await client.query(
        `UPDATE users 
         SET balance = balance - $1
         WHERE id = $2`,
        [donationAmount, user_id]
      );

      // Update project raised amount
      await client.query(
        `UPDATE charity_projects 
         SET raised_amount = raised_amount + $1
         WHERE id = $2`,
        [donationAmount, project_id]
      );

      // Create donation record
      const donationResult = await client.query(
        `INSERT INTO charity_donations 
         (user_id, project_id, amount, message, status)
         VALUES ($1, $2, $3, $4, 'completed')
         RETURNING *`,
        [user_id, project_id, donationAmount, message]
      );

      // TODO: Send confirmation notification to user
      // TODO: Issue tax receipt if applicable

      return donationResult.rows[0];
    });

    res.json({
      success: true,
      data: result,
      message: 'Donation completed successfully',
    });
  } catch (error: any) {
    console.error('Donation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/charity/my-donations
 * Get user's donation history
 */
router.get('/my-donations', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const result = await query(
      `SELECT 
         d.*,
         p.title as project_title,
         p.image_url as project_image,
         p.organization
       FROM charity_donations d
       JOIN charity_projects p ON d.project_id = p.id
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, Number(limit), offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM charity_donations WHERE user_id = $1',
      [user_id]
    );

    // Get total donated amount
    const totalResult = await query(
      'SELECT SUM(amount) as total_donated FROM charity_donations WHERE user_id = $1 AND status = $2',
      [user_id, 'completed']
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count),
      },
      summary: {
        total_donated: parseFloat(totalResult.rows[0].total_donated || 0),
      },
    });
  } catch (error: any) {
    console.error('Get donations error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/charity/top-donors
 * Get top donors for a project
 */
router.get('/top-donors', async (req, res) => {
  try {
    const { project_id, limit = 10 } = req.query;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const result = await query(
      `SELECT 
         u.id,
         u.username,
         u.first_name,
         SUM(d.amount) as total_donated,
         COUNT(d.id) as donation_count
       FROM charity_donations d
       JOIN users u ON d.user_id = u.id
       WHERE d.project_id = $1 AND d.status = 'completed'
       GROUP BY u.id, u.username, u.first_name
       ORDER BY total_donated DESC
       LIMIT $2`,
      [project_id, Number(limit)]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get top donors error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/charity/applications
 * Submit a charity assistance application (mini-app users)
 */
router.post('/applications', async (req, res) => {
  try {
    const { activity_id, reason, amount } = req.body;

    // Try to get user_id from Telegram initData header if present
    let userId: string | null = null;
    const initData = req.headers['x-telegram-init-data'] as string | undefined;
    if (initData) {
      try {
        // Parse user from initData directly
        const params = new URLSearchParams(initData);
        const userParam = params.get('user');
        if (userParam) {
          const tgUser = JSON.parse(userParam);
          const userResult = await query(
            `SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`,
            [tgUser.id]
          );
          if (userResult.rows.length > 0) userId = userResult.rows[0].id;
        }
      } catch {
        // Proceed without user_id
      }
    }

    const result = await query(
      `INSERT INTO charity_applications (activity_id, user_id, reason, amount)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [activity_id || null, userId, reason || null, amount ? parseFloat(amount) : null]
    );

    res.json({ success: true, id: result.rows[0].id, message: '申请已提交，等待审核' });
  } catch (error: any) {
    console.error('Submit charity application error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
