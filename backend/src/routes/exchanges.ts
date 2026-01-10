import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all exchanges
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM exchanges WHERE is_active = true ORDER BY order_index ASC, created_at DESC`
    );

    res.json({ exchanges: result.rows });
  } catch (error) {
    console.error('Get exchanges error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get exchange by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT * FROM exchanges WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exchange not found' });
    }

    res.json({ exchange: result.rows[0] });
  } catch (error) {
    console.error('Get exchange error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create exchange (admin only)
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, name_zh, logo_url, register_url, tutorial_content, order_index } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }

    const result = await query(
      `INSERT INTO exchanges (name, name_zh, logo_url, register_url, tutorial_content, order_index)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, name_zh, logo_url, register_url, tutorial_content, order_index || 0]
    );

    res.json({ exchange: result.rows[0] });
  } catch (error) {
    console.error('Create exchange error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update exchange
router.put('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, name_zh, logo_url, register_url, tutorial_content, is_active, order_index } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      params.push(name);
      updates.push(`name = $${params.length}`);
    }
    if (name_zh !== undefined) {
      params.push(name_zh);
      updates.push(`name_zh = $${params.length}`);
    }
    if (logo_url !== undefined) {
      params.push(logo_url);
      updates.push(`logo_url = $${params.length}`);
    }
    if (register_url !== undefined) {
      params.push(register_url);
      updates.push(`register_url = $${params.length}`);
    }
    if (tutorial_content !== undefined) {
      params.push(tutorial_content);
      updates.push(`tutorial_content = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active);
      updates.push(`is_active = $${params.length}`);
    }
    if (order_index !== undefined) {
      params.push(order_index);
      updates.push(`order_index = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    const result = await query(
      `UPDATE exchanges SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exchange not found' });
    }

    res.json({ exchange: result.rows[0] });
  } catch (error) {
    console.error('Update exchange error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete exchange
router.delete('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM exchanges WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exchange not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete exchange error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
