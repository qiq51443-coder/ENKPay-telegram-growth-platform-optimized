import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

router.use(adminLimiter);

/**
 * GET /api/announcements
 * List announcements
 */
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;

    let queryText = `SELECT * FROM announcements WHERE 1=1`;
    const params: any[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND status = $${params.length}`;
    }

    queryText += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await query(queryText, params);
    res.json({ announcements: result.rows });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/announcements
 * Create announcement
 */
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      title,
      content,
      images,
      targets,
      scheduled_at,
      expires_at,
      is_pinned,
      show_on_app_launch,
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const result = await query(
      `INSERT INTO announcements
         (title, content, images, targets, scheduled_at, expires_at, is_pinned, show_on_app_launch, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
       RETURNING *`,
      [
        title,
        content,
        images || [],
        targets || [],
        scheduled_at || null,
        expires_at || null,
        is_pinned || false,
        show_on_app_launch || false,
      ]
    );

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/announcements/:id
 * Update announcement
 */
router.put('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      images,
      targets,
      scheduled_at,
      expires_at,
      is_pinned,
      show_on_app_launch,
      status,
    } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) { params.push(title); updates.push(`title = $${params.length}`); }
    if (content !== undefined) { params.push(content); updates.push(`content = $${params.length}`); }
    if (images !== undefined) { params.push(images); updates.push(`images = $${params.length}`); }
    if (targets !== undefined) { params.push(targets); updates.push(`targets = $${params.length}`); }
    if (scheduled_at !== undefined) { params.push(scheduled_at); updates.push(`scheduled_at = $${params.length}`); }
    if (expires_at !== undefined) { params.push(expires_at); updates.push(`expires_at = $${params.length}`); }
    if (is_pinned !== undefined) { params.push(is_pinned); updates.push(`is_pinned = $${params.length}`); }
    if (show_on_app_launch !== undefined) { params.push(show_on_app_launch); updates.push(`show_on_app_launch = $${params.length}`); }
    if (status !== undefined) { params.push(status); updates.push(`status = $${params.length}`); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    const result = await query(
      `UPDATE announcements SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/announcements/:id/send
 * Send announcement (mark as sent)
 */
router.post('/:id/send', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE announcements SET status = 'sent', sent_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Send announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/announcements/:id
 */
router.delete('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM announcements WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
