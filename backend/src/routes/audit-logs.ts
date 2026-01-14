import express from 'express';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { getAuditLogs } from '../utils/audit';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Apply rate limiting to all audit log routes
router.use(adminLimiter);

/**
 * GET /admin/audit-logs
 * Get audit logs with optional filtering
 */
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    // Only super_admin and admin can view audit logs
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const {
      admin_user_id,
      action,
      resource_type,
      start_date,
      end_date,
      page = 1,
      per_page = 50,
    } = req.query;

    const limit = Math.min(parseInt(per_page as string, 10) || 50, 100);
    const offset = (parseInt(page as string, 10) - 1) * limit;

    const result = await getAuditLogs({
      adminUserId: admin_user_id as string,
      action: action as string,
      resourceType: resource_type as string,
      startDate: start_date ? new Date(start_date as string) : undefined,
      endDate: end_date ? new Date(end_date as string) : undefined,
      limit,
      offset,
    });

    res.json({
      logs: result.logs,
      pagination: {
        total: result.total,
        page: parseInt(page as string, 10) || 1,
        per_page: limit,
        total_pages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/audit-logs/actions
 * Get list of unique action types
 */
router.get('/actions', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    // Only super_admin and admin can view audit logs
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { query: db } = await import('../db');
    
    const result = await db(
      `SELECT DISTINCT action 
       FROM admin_audit_logs 
       ORDER BY action`
    );

    res.json({ actions: result.rows.map(row => row.action) });
  } catch (error) {
    console.error('Get audit actions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/audit-logs/resource-types
 * Get list of unique resource types
 */
router.get('/resource-types', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    // Only super_admin and admin can view audit logs
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { query: db } = await import('../db');
    
    const result = await db(
      `SELECT DISTINCT resource_type 
       FROM admin_audit_logs 
       WHERE resource_type IS NOT NULL
       ORDER BY resource_type`
    );

    res.json({ resource_types: result.rows.map(row => row.resource_type) });
  } catch (error) {
    console.error('Get resource types error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
