import express from 'express';
import { query } from '../db';
import { authenticateAdmin, requireRoles, AuthRequest } from '../middleware/auth';
import { logAuditAction, AuditActions } from '../utils/audit';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Apply rate limiting to all system settings routes
router.use(adminLimiter);

/**
 * GET /admin/system-settings
 * Get all system settings or filter by category
 */
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { category, is_public } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(category);
    }

    if (is_public !== undefined) {
      conditions.push(`is_public = $${paramIndex++}`);
      params.push(is_public === 'true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT 
        key, 
        value, 
        description, 
        category, 
        is_public, 
        updated_at,
        updated_by,
        au.username as updated_by_username
       FROM system_settings ss
       LEFT JOIN admin_users au ON ss.updated_by = au.id
       ${whereClause}
       ORDER BY category, key`,
      params
    );

    res.json({ settings: result.rows });
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/system-settings/:key
 * Get a specific system setting by key
 */
router.get('/:key', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { key } = req.params;

    const result = await query(
      `SELECT 
        key, 
        value, 
        description, 
        category, 
        is_public, 
        updated_at,
        updated_by,
        au.username as updated_by_username
       FROM system_settings ss
       LEFT JOIN admin_users au ON ss.updated_by = au.id
       WHERE key = $1`,
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ setting: result.rows[0] });
  } catch (error) {
    console.error('Get system setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /admin/system-settings/:key
 * Update a specific system setting
 */
router.put('/:key', authenticateAdmin, requireRoles(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {

    const { key } = req.params;
    const { value, description, category, is_public } = req.body;

    // Check if setting exists
    const existing = await query(
      'SELECT key, value FROM system_settings WHERE key = $1',
      [key]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (value !== undefined) {
      params.push(typeof value === 'string' ? value : JSON.stringify(value));
      updates.push(`value = $${paramIndex++}`);
    }

    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${paramIndex++}`);
    }

    if (category !== undefined) {
      params.push(category);
      updates.push(`category = $${paramIndex++}`);
    }

    if (is_public !== undefined) {
      params.push(is_public);
      updates.push(`is_public = $${paramIndex++}`);
    }

    // Always update updated_by and updated_at
    params.push(req.user?.id);
    updates.push(`updated_by = $${paramIndex++}`);
    updates.push(`updated_at = NOW()`);

    params.push(key);

    const result = await query(
      `UPDATE system_settings 
       SET ${updates.join(', ')}
       WHERE key = $${paramIndex}
       RETURNING *`,
      params
    );

    // Log audit action
    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.UPDATE_SETTINGS,
      resourceType: 'system_setting',
      resourceId: key,
      details: {
        key,
        old_value: existing.rows[0].value,
        new_value: value,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      setting: result.rows[0],
      message: 'Setting updated successfully',
    });
  } catch (error) {
    console.error('Update system setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/system-settings
 * Create a new system setting
 */
router.post('/', authenticateAdmin, requireRoles(['super_admin']), async (req: AuthRequest, res) => {
  try {

    const { key, value, description, category, is_public = false } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }

    // Check if setting already exists
    const existing = await query(
      'SELECT key FROM system_settings WHERE key = $1',
      [key]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Setting already exists' });
    }

    const result = await query(
      `INSERT INTO system_settings (key, value, description, category, is_public, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
        description,
        category,
        is_public,
        req.user?.id,
      ]
    );

    // Log audit action
    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.UPDATE_SETTINGS,
      resourceType: 'system_setting',
      resourceId: key,
      details: { key, value },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      setting: result.rows[0],
      message: 'Setting created successfully',
    });
  } catch (error) {
    console.error('Create system setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/system-settings/bulk-update
 * Bulk update multiple system settings
 */
router.post('/bulk-update', authenticateAdmin, requireRoles(['super_admin', 'admin']), async (req: AuthRequest, res) => {
  try {

    const { settings } = req.body;

    if (!Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json({ error: 'Settings array is required' });
    }

    const updated: any[] = [];
    const errors: any[] = [];

    for (const setting of settings) {
      try {
        const { key, value } = setting;

        if (!key || value === undefined) {
          errors.push({ key, error: 'Key and value are required' });
          continue;
        }

        const result = await query(
          `UPDATE system_settings 
           SET value = $1, updated_by = $2, updated_at = NOW()
           WHERE key = $3
           RETURNING *`,
          [typeof value === 'string' ? value : JSON.stringify(value), req.user?.id, key]
        );

        if (result.rows.length === 0) {
          errors.push({ key, error: 'Setting not found' });
        } else {
          updated.push(result.rows[0]);
        }
      } catch (error: any) {
        errors.push({ key: setting.key, error: error.message });
      }
    }

    // Log audit action
    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.BULK_UPDATE_SETTINGS,
      resourceType: 'system_setting',
      details: {
        updated_count: updated.length,
        error_count: errors.length,
        settings: settings.map(s => s.key),
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      updated,
      errors,
      message: `Updated ${updated.length} settings, ${errors.length} errors`,
    });
  } catch (error) {
    console.error('Bulk update system settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /admin/system-settings/:key
 * Delete a system setting
 */
router.delete('/:key', authenticateAdmin, requireRoles(['super_admin']), async (req: AuthRequest, res) => {
  try {

    const { key } = req.params;

    const result = await query(
      'DELETE FROM system_settings WHERE key = $1 RETURNING *',
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: req.user!.id,
      action: AuditActions.UPDATE_SETTINGS,
      resourceType: 'system_setting',
      resourceId: key,
      details: { key, deleted: true },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'Setting deleted successfully',
    });
  } catch (error) {
    console.error('Delete system setting error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/system-settings/categories/list
 * Get list of all categories
 */
router.get('/categories/list', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT category 
       FROM system_settings 
       WHERE category IS NOT NULL
       ORDER BY category`
    );

    res.json({ categories: result.rows.map(row => row.category) });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
