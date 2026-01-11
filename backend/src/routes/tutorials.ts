import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all tutorial categories
router.get('/categories', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM tutorial_categories ORDER BY order_index ASC'
    );

    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get tutorial categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all tutorials
router.get('/', async (req, res) => {
  try {
    const { exchange_id, category_id } = req.query;

    let whereConditions: string[] = [];
    let params: any[] = [];

    if (exchange_id) {
      params.push(exchange_id);
      whereConditions.push(`t.exchange_id = $${params.length}`);
    }

    if (category_id) {
      params.push(category_id);
      whereConditions.push(`t.category_id = $${params.length}`);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const result = await query(
      `SELECT 
        t.*,
        e.name as exchange_name,
        e.name_zh as exchange_name_zh,
        c.name as category_name,
        c.name_en as category_name_en,
        c.name_zh as category_name_zh,
        c.icon as category_icon
       FROM tutorials t
       LEFT JOIN exchanges e ON t.exchange_id = e.id
       LEFT JOIN tutorial_categories c ON t.category_id = c.id
       ${whereClause}
       ORDER BY t.order_index ASC, t.created_at DESC`,
      params
    );

    res.json({ tutorials: result.rows });
  } catch (error) {
    console.error('Get tutorials error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single tutorial with steps and images
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get tutorial
    const tutorialResult = await query(
      `SELECT 
        t.*,
        e.name as exchange_name,
        e.name_zh as exchange_name_zh,
        c.name as category_name,
        c.name_en as category_name_en,
        c.name_zh as category_name_zh,
        c.icon as category_icon
       FROM tutorials t
       LEFT JOIN exchanges e ON t.exchange_id = e.id
       LEFT JOIN tutorial_categories c ON t.category_id = c.id
       WHERE t.id = $1`,
      [id]
    );

    if (tutorialResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tutorial not found' });
    }

    const tutorial = tutorialResult.rows[0];

    // Get steps with images
    const stepsResult = await query(
      `SELECT 
        s.*,
        (SELECT json_agg(
          json_build_object(
            'id', i.id,
            'image_url', i.image_url,
            'caption', i.caption,
            'caption_zh', i.caption_zh,
            'order_index', i.order_index
          ) ORDER BY i.order_index
        )
        FROM tutorial_step_images i
        WHERE i.step_id = s.id) as images
       FROM tutorial_steps s
       WHERE s.tutorial_id = $1
       ORDER BY s.order_index ASC, s.step_number ASC`,
      [id]
    );

    tutorial.steps = stepsResult.rows;

    res.json({ tutorial });
  } catch (error) {
    console.error('Get tutorial error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create tutorial
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      exchange_id,
      category_id,
      title,
      title_zh,
      description,
      description_zh,
      is_active,
      order_index,
      steps
    } = req.body;

    if (!title || !exchange_id) {
      return res.status(400).json({ error: 'Title and exchange_id are required' });
    }

    // Create tutorial
    const tutorialResult = await query(
      `INSERT INTO tutorials (exchange_id, category_id, title, title_zh, description, description_zh, is_active, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [exchange_id, category_id, title, title_zh, description, description_zh, is_active !== false, order_index || 0]
    );

    const tutorial = tutorialResult.rows[0];

    // Create steps if provided
    if (steps && Array.isArray(steps)) {
      for (const step of steps) {
        const stepResult = await query(
          `INSERT INTO tutorial_steps (tutorial_id, step_number, title, title_zh, description, description_zh, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            tutorial.id,
            step.step_number,
            step.title,
            step.title_zh,
            step.description,
            step.description_zh,
            step.order_index || 0
          ]
        );

        const stepId = stepResult.rows[0].id;

        // Create images if provided
        if (step.images && Array.isArray(step.images)) {
          for (const image of step.images) {
            await query(
              `INSERT INTO tutorial_step_images (step_id, image_url, caption, caption_zh, order_index)
               VALUES ($1, $2, $3, $4, $5)`,
              [stepId, image.image_url, image.caption, image.caption_zh, image.order_index || 0]
            );
          }
        }
      }
    }

    // Fetch complete tutorial with steps
    const completeResult = await query(
      `SELECT 
        t.*,
        (SELECT json_agg(
          json_build_object(
            'id', s.id,
            'step_number', s.step_number,
            'title', s.title,
            'title_zh', s.title_zh,
            'description', s.description,
            'description_zh', s.description_zh,
            'order_index', s.order_index,
            'images', (
              SELECT json_agg(
                json_build_object(
                  'id', i.id,
                  'image_url', i.image_url,
                  'caption', i.caption,
                  'caption_zh', i.caption_zh,
                  'order_index', i.order_index
                ) ORDER BY i.order_index
              )
              FROM tutorial_step_images i
              WHERE i.step_id = s.id
            )
          ) ORDER BY s.order_index, s.step_number
        )
        FROM tutorial_steps s
        WHERE s.tutorial_id = t.id) as steps
       FROM tutorials t
       WHERE t.id = $1`,
      [tutorial.id]
    );

    res.json({ tutorial: completeResult.rows[0] });
  } catch (error) {
    console.error('Create tutorial error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update tutorial
router.put('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      exchange_id,
      category_id,
      title,
      title_zh,
      description,
      description_zh,
      is_active,
      order_index,
      steps
    } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (exchange_id !== undefined) {
      params.push(exchange_id);
      updates.push(`exchange_id = $${params.length}`);
    }
    if (category_id !== undefined) {
      params.push(category_id);
      updates.push(`category_id = $${params.length}`);
    }
    if (title !== undefined) {
      params.push(title);
      updates.push(`title = $${params.length}`);
    }
    if (title_zh !== undefined) {
      params.push(title_zh);
      updates.push(`title_zh = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${params.length}`);
    }
    if (description_zh !== undefined) {
      params.push(description_zh);
      updates.push(`description_zh = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active);
      updates.push(`is_active = $${params.length}`);
    }
    if (order_index !== undefined) {
      params.push(order_index);
      updates.push(`order_index = $${params.length}`);
    }

    if (updates.length > 0) {
      params.push(id);
      await query(
        `UPDATE tutorials SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    // Update steps if provided
    if (steps && Array.isArray(steps)) {
      // Delete existing steps (cascade will delete images)
      await query('DELETE FROM tutorial_steps WHERE tutorial_id = $1', [id]);

      // Create new steps
      for (const step of steps) {
        const stepResult = await query(
          `INSERT INTO tutorial_steps (tutorial_id, step_number, title, title_zh, description, description_zh, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            id,
            step.step_number,
            step.title,
            step.title_zh,
            step.description,
            step.description_zh,
            step.order_index || 0
          ]
        );

        const stepId = stepResult.rows[0].id;

        // Create images
        if (step.images && Array.isArray(step.images)) {
          for (const image of step.images) {
            await query(
              `INSERT INTO tutorial_step_images (step_id, image_url, caption, caption_zh, order_index)
               VALUES ($1, $2, $3, $4, $5)`,
              [stepId, image.image_url, image.caption, image.caption_zh, image.order_index || 0]
            );
          }
        }
      }
    }

    // Fetch complete tutorial
    const result = await query(
      `SELECT 
        t.*,
        (SELECT json_agg(
          json_build_object(
            'id', s.id,
            'step_number', s.step_number,
            'title', s.title,
            'title_zh', s.title_zh,
            'description', s.description,
            'description_zh', s.description_zh,
            'order_index', s.order_index,
            'images', (
              SELECT json_agg(
                json_build_object(
                  'id', i.id,
                  'image_url', i.image_url,
                  'caption', i.caption,
                  'caption_zh', i.caption_zh,
                  'order_index', i.order_index
                ) ORDER BY i.order_index
              )
              FROM tutorial_step_images i
              WHERE i.step_id = s.id
            )
          ) ORDER BY s.order_index, s.step_number
        )
        FROM tutorial_steps s
        WHERE s.tutorial_id = t.id) as steps
       FROM tutorials t
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tutorial not found' });
    }

    res.json({ tutorial: result.rows[0] });
  } catch (error) {
    console.error('Update tutorial error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete tutorial
router.delete('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM tutorials WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tutorial not found' });
    }

    res.json({ success: true, message: 'Tutorial deleted successfully' });
  } catch (error) {
    console.error('Delete tutorial error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
