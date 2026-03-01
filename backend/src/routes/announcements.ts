import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/announcements
 * Get public announcements (mini-app facing)
 */
router.get('/', async (req, res) => {
  try {
    const { show_on_app_launch } = req.query;
    let queryText = `
      SELECT id, title, content, images, is_pinned, show_on_app_launch, created_at
      FROM announcements
      WHERE status = 'sent'
    `;
    const params: any[] = [];

    if (show_on_app_launch === 'true' || show_on_app_launch === '1') {
      queryText += ` AND show_on_app_launch = true`;
    }

    queryText += ` ORDER BY is_pinned DESC, created_at DESC LIMIT 20`;

    const result = await query(queryText, params);

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/announcements/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM announcements WHERE id = $1 AND status = 'sent'`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
