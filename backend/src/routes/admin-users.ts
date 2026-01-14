import express from 'express';
import { query } from '../db';
import { authenticateAdmin, requireRoles, AuthRequest } from '../middleware/auth';
import bcrypt from 'bcryptjs';
import { logAuditAction } from '../utils/audit';

const router = express.Router();

// GET /admin/admin-users - Get all administrators
router.get('/', authenticateAdmin, requireRoles(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, role, full_name, is_active, last_login_at, created_at, updated_at
       FROM admin_users 
       ORDER BY created_at DESC`
    );
    
    res.json({ admins: result.rows });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/admin-users - Create administrator
router.post('/', authenticateAdmin, requireRoles(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const { username, password, email, role, full_name } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Check if username already exists
    const existing = await query('SELECT id FROM admin_users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await query(
      `INSERT INTO admin_users (username, password_hash, email, role, full_name, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, username, email, role, full_name, is_active, created_at`,
      [username, passwordHash, email, role || 'admin', full_name]
    );
    
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'create_admin',
      resourceType: 'admin_user',
      resourceId: result.rows[0].id,
      details: { username, role: role || 'admin' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    
    res.json({ admin: result.rows[0] });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /admin/admin-users/:id - Update administrator
router.put('/:id', authenticateAdmin, requireRoles(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { email, role, full_name, is_active } = req.body;
    
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (email !== undefined) {
      params.push(email);
      updates.push(`email = $${paramIndex++}`);
    }
    if (role !== undefined) {
      params.push(role);
      updates.push(`role = $${paramIndex++}`);
    }
    if (full_name !== undefined) {
      params.push(full_name);
      updates.push(`full_name = $${paramIndex++}`);
    }
    if (is_active !== undefined) {
      params.push(is_active);
      updates.push(`is_active = $${paramIndex++}`);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(id);
    
    const result = await query(
      `UPDATE admin_users SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, username, email, role, full_name, is_active, updated_at`,
      params
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'update_admin',
      resourceType: 'admin_user',
      resourceId: id,
      details: { updates: req.body },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    
    res.json({ admin: result.rows[0] });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /admin/admin-users/:id - Delete administrator
router.delete('/:id', authenticateAdmin, requireRoles(['super_admin']), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    // Cannot delete self
    if (id === req.user?.id) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    
    const result = await query('DELETE FROM admin_users WHERE id = $1 RETURNING username', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'delete_admin',
      resourceType: 'admin_user',
      resourceId: id,
      details: { username: result.rows[0].username },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    
    res.json({ success: true, message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /admin/admin-users/:id/password - Change password
router.patch('/:id/password', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { current_password, new_password } = req.body;
    
    // Only super_admin or self can change password
    if (req.user?.role !== 'super_admin' && id !== req.user?.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    // If modifying own password, current password is required
    if (id === req.user?.id) {
      if (!current_password) {
        return res.status(400).json({ error: 'Current password is required when changing your own password' });
      }
      
      const userResult = await query('SELECT password_hash FROM admin_users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Admin not found' });
      }
      
      const valid = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    } else if (req.user?.role !== 'super_admin') {
      // If not modifying own password and not super_admin, deny access
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const passwordHash = await bcrypt.hash(new_password, 10);
    await query(
      'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, id]
    );
    
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'change_password',
      resourceType: 'admin_user',
      resourceId: id,
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
