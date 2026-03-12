import express from 'express';
import { query } from '../db';
import { authenticateAdmin, requireRoles, AuthRequest } from '../middleware/auth';
import TelegramAPI from '../utils/telegram';
import bcrypt from 'bcryptjs';
import { logAuditAction } from '../utils/audit';
import { adminLimiter } from '../middleware/rateLimiter';
import { botManager } from '../services/bot-manager.service';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Multer configuration for image uploads
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Configuration constants
const DEFAULT_NEW_USER_CREDITS = parseInt(process.env.DEFAULT_NEW_USER_CREDITS || '3', 10);

// Get all bots
router.get('/bots', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, name, username, is_active, webhook_url, default_language, welcome_message, created_at, updated_at 
       FROM bots 
       ORDER BY created_at DESC`
    );

    res.json({ bots: result.rows });
  } catch (error) {
    console.error('Get bots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create bot
router.post('/bots', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { token, default_language, welcome_message } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    // 1. Verify token with Telegram API
    const telegram = new TelegramAPI(token);
    let botInfo;
    try {
      botInfo = await telegram.getMe();
      
      if (!botInfo || !botInfo.is_bot) {
        return res.status(400).json({ error: 'Invalid bot token or not a bot' });
      }
    } catch (error: any) {
      console.error('Bot verification error:', error);
      return res.status(400).json({ error: 'Invalid bot token or unable to connect to Telegram' });
    }

    // 2. Check if bot already exists
    const existingBot = await query(
      'SELECT id FROM bots WHERE token = $1',
      [token]
    );

    if (existingBot.rows.length > 0) {
      return res.status(400).json({ error: 'Bot already exists' });
    }

    // 3. Save bot to database first to get the generated UUID (name auto-filled from Telegram)
    const name = botInfo.first_name || botInfo.username;
    const result = await query(
      `INSERT INTO bots (name, token, username, is_active, default_language, welcome_message)
       VALUES ($1, $2, $3, true, $4, $5)
       RETURNING id, name, username, is_active, default_language, created_at`,
      [name, token, botInfo.username, default_language || 'en', welcome_message || null]
    );

    const bot = result.rows[0];

    // 4. Set webhook using bot UUID (not token) if BACKEND_URL is configured
    const backendUrl = process.env.BACKEND_URL || process.env.BOT_WEBHOOK_URL;
    let webhookUrl = '';

    if (backendUrl) {
      try {
        webhookUrl = `${backendUrl}/webhook/${bot.id}`;
        const webhookResult = await telegram.setWebhook(
          webhookUrl,
          process.env.BOT_WEBHOOK_SECRET
        );

        if (!webhookResult.ok) {
          console.warn('Failed to set webhook:', webhookResult);
          // Continue anyway - webhook can be set later
        } else {
          // 5. Update webhook_url in database
          await query('UPDATE bots SET webhook_url = $1 WHERE id = $2', [webhookUrl, bot.id]);
          bot.webhook_url = webhookUrl;
        }
      } catch (webhookError) {
        console.error('Webhook setup error:', webhookError);
        // Continue anyway - webhook can be set later
      }
    }

    // 5. Initialize bot settings
    await query(
      `INSERT INTO bot_settings (bot_id, new_user_credits)
       VALUES ($1, $2)
       ON CONFLICT (bot_id) DO NOTHING`,
      [bot.id, DEFAULT_NEW_USER_CREDITS]
    );

    // 6. Log audit action
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'create_bot',
      resourceType: 'bot',
      resourceId: bot.id,
      details: { name, username: botInfo.username },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // 7. Notify bot-manager to load the new bot instance
    botManager.addBot(bot.id, token, default_language || 'en').catch((err) => {
      console.error('BotManager addBot error:', err);
    });

    res.json({ 
      success: true,
      bot: bot,
      botId: bot.id,
      webhookUrl: webhookUrl,
      message: 'Bot authorized successfully. Configure your bot with this Bot ID.'
    });
  } catch (error) {
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bot
router.put('/bots/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, is_active, webhook_url, default_language, welcome_message } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      params.push(name);
      updates.push(`name = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active);
      updates.push(`is_active = $${params.length}`);
    }
    if (webhook_url !== undefined) {
      params.push(webhook_url);
      updates.push(`webhook_url = $${params.length}`);
    }
    if (default_language !== undefined) {
      params.push(default_language);
      updates.push(`default_language = $${params.length}`);
    }
    if (welcome_message !== undefined) {
      params.push(welcome_message || null);
      updates.push(`welcome_message = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    const result = await query(
      `UPDATE bots SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'update_bot',
      resourceType: 'bot',
      resourceId: id,
      details: { updates: req.body },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Update bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete bot
router.delete('/bots/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // 1. Get bot token
    const botResult = await query('SELECT token, name FROM bots WHERE id = $1', [id]);
    
    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const { token: botToken, name: botName } = botResult.rows[0];

    // 2. Try to delete Telegram webhook
    try {
      const telegram = new TelegramAPI(botToken);
      await telegram.deleteWebhook();
    } catch (webhookError) {
      console.error('Failed to delete webhook:', webhookError);
      // Continue with deletion even if webhook removal fails
    }

    // 3. Delete bot from database (cascade will handle related data)
    await query('DELETE FROM bots WHERE id = $1', [id]);

    // 4. Log audit action
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'delete_bot',
      resourceType: 'bot',
      resourceId: id,
      details: { name: botName },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // 5. Remove from bot-manager
    botManager.removeBot(id).catch((err) => {
      console.error('BotManager removeBot error:', err);
    });

    // 6. Return success
    res.json({ 
      success: true, 
      message: 'Bot deleted successfully' 
    });
  } catch (error) {
    console.error('Delete bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bot status (enable/disable)
router.patch('/bots/:id/status', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined) {
      return res.status(400).json({ error: 'is_active field is required' });
    }

    const result = await query(
      'UPDATE bots SET is_active = $1 WHERE id = $2 RETURNING *',
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'toggle_bot_status',
      resourceType: 'bot',
      resourceId: id,
      details: { is_active },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Notify bot-manager
    if (is_active) {
      botManager.addBot(id).catch((err) => console.error('BotManager addBot error:', err));
    } else {
      botManager.removeBot(id).catch((err) => console.error('BotManager removeBot error:', err));
    }

    res.json({ 
      bot: result.rows[0],
      message: `Bot ${is_active ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Update bot status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset webhook for a bot
router.post('/bots/:id/reset-webhook', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const botResult = await query('SELECT id, token, name FROM bots WHERE id = $1', [id]);

    if (botResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    const { token: botToken, name: botName } = botResult.rows[0];
    const backendUrl = process.env.BACKEND_URL || process.env.BOT_WEBHOOK_URL;

    if (!backendUrl) {
      return res.status(400).json({ error: 'BACKEND_URL is not configured' });
    }

    const webhookUrl = `${backendUrl}/webhook/${id}`;
    const telegram = new TelegramAPI(botToken);

    try {
      const webhookResult = await telegram.setWebhook(
        webhookUrl,
        process.env.BOT_WEBHOOK_SECRET
      );

      if (!webhookResult.ok) {
        return res.status(500).json({ error: 'Failed to set webhook with Telegram', detail: webhookResult });
      }
    } catch (webhookError: any) {
      return res.status(500).json({ error: 'Failed to communicate with Telegram', detail: webhookError?.message });
    }

    await query('UPDATE bots SET webhook_url = $1 WHERE id = $2', [webhookUrl, id]);

    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'reset_bot_webhook',
      resourceType: 'bot',
      resourceId: id,
      details: { name: botName, webhookUrl },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, webhookUrl, message: 'Webhook reset successfully' });
  } catch (error) {
    console.error('Reset webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dashboard stats
router.get('/dashboard/stats', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId } = req.query;

    let whereClause = '';
    const params: any[] = [];
    
    if (botId) {
      params.push(botId);
      whereClause = `WHERE bot_id = $${params.length}`;
    }

    const [userStats, transactionStats, bindingStats, redPacketStats] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE platform_bound = true) as bound_users,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_today,
          COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '24 hours') as active_today
        FROM users ${whereClause}
      `, params),
      query(`
        SELECT 
          COALESCE(SUM(amount), 0) as total_rewards,
          COUNT(*) as total_transactions,
          COALESCE(SUM(amount) FILTER (WHERE t.created_at > NOW() - INTERVAL '24 hours'), 0) as rewards_today
        FROM transactions t
        JOIN users u ON t.user_id = u.id
        ${whereClause.replace('bot_id', 'u.bot_id')}
      `, params),
      query(`
        SELECT 
          COUNT(*) as total_bindings,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_bindings,
          COUNT(*) FILTER (WHERE status = 'approved') as approved_bindings
        FROM platform_bindings
        ${whereClause}
      `, params),
      query(`
        SELECT 
          COUNT(*) as total_red_packets,
          COALESCE(SUM(claimed_amount), 0) as total_claimed_amount,
          COUNT(*) FILTER (WHERE status = 'active') as active_red_packets
        FROM red_packets
        ${whereClause}
      `, params)
    ]);

    res.json({
      users: userStats.rows[0],
      transactions: transactionStats.rows[0],
      bindings: bindingStats.rows[0],
      redPackets: redPacketStats.rows[0]
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// User Statistics API
// ============================================

/**
 * GET /api/admin/stats/users
 * Returns user statistics: total unique users, new today, active 7d, per-bot breakdown
 */
router.get('/stats/users', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const [uniqueUsers, totalRecords, newToday, active7d, byBot] = await Promise.all([
      query(`SELECT COUNT(DISTINCT telegram_id) AS total_unique_users FROM users`),
      query(`SELECT COUNT(*) AS total_user_records FROM users`),
      query(`SELECT COUNT(DISTINCT telegram_id) AS new_users_today FROM users WHERE created_at >= CURRENT_DATE`),
      query(`SELECT COUNT(DISTINCT telegram_id) AS active_users_7d FROM users WHERE last_active_at >= NOW() - INTERVAL '7 days'`),
      query(`SELECT b.username AS bot_username, b.name AS bot_name, COUNT(u.id) AS user_count FROM users u JOIN bots b ON u.bot_id = b.id GROUP BY b.id, b.username, b.name ORDER BY user_count DESC`),
    ]);

    res.json({
      total_unique_users: parseInt(uniqueUsers.rows[0]?.total_unique_users ?? 0),
      total_user_records: parseInt(totalRecords.rows[0]?.total_user_records ?? 0),
      new_users_today: parseInt(newToday.rows[0]?.new_users_today ?? 0),
      active_users_7d: parseInt(active7d.rows[0]?.active_users_7d ?? 0),
      users_by_bot: byBot.rows.map(r => ({
          bot_name: r.bot_username ? `@${r.bot_username}` : r.bot_name,
          user_count: parseInt(r.user_count),
        })),
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users/:telegramId/bots
 * Returns the list of bots a user (by telegram_id) is registered with
 */
router.get('/users/:telegramId/bots', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { telegramId } = req.params;
    const result = await query(
      `SELECT u.id, u.bot_id, b.name AS bot_name, b.username AS bot_username,
              u.created_at, u.last_active_at, u.account_status
       FROM users u
       JOIN bots b ON u.bot_id = b.id
       WHERE u.telegram_id = $1
       ORDER BY u.created_at ASC`,
      [telegramId]
    );
    res.json({ bots: result.rows });
  } catch (error) {
    console.error('Get user bots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Admin User Management
// ============================================

// Get all admin users
router.get('/admins', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    // Check if requester is super_admin
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can manage admin users' });
    }

    const result = await query(
      `SELECT id, username, email, role, full_name, is_active, last_login_at, created_at, created_by
       FROM admin_users
       ORDER BY created_at DESC`
    );

    res.json({ admins: result.rows });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create admin user
router.post('/admins', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    // Check if requester is super_admin
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can create admin users' });
    }

    const { username, password, email, role, full_name } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Validate role
    const validRoles = ['super_admin', 'admin', 'reviewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if username already exists
    const existingUser = await query(
      'SELECT id FROM admin_users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create admin user
    const result = await query(
      `INSERT INTO admin_users (username, password_hash, email, role, full_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, role, full_name, is_active, created_at`,
      [username, password_hash, email, role || 'admin', full_name, req.user?.id]
    );

    // Log audit action
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'create_admin',
      resourceType: 'admin_user',
      resourceId: result.rows[0].id,
      details: { username, role: role || 'admin' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ 
      admin: result.rows[0],
      message: 'Admin user created successfully'
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update admin user
router.put('/admins/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    // Check if requester is super_admin or updating their own profile
    if (req.user?.role !== 'super_admin' && req.user?.id !== req.params.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { id } = req.params;
    const { username, email, role, full_name, is_active } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (username !== undefined) {
      params.push(username);
      updates.push(`username = $${params.length}`);
    }
    if (email !== undefined) {
      params.push(email);
      updates.push(`email = $${params.length}`);
    }
    if (full_name !== undefined) {
      params.push(full_name);
      updates.push(`full_name = $${params.length}`);
    }

    // Only super_admin can change role and is_active
    if (req.user?.role === 'super_admin') {
      if (role !== undefined) {
        const validRoles = ['super_admin', 'admin', 'reviewer'];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ error: 'Invalid role' });
        }
        params.push(role);
        updates.push(`role = $${params.length}`);
      }
      if (is_active !== undefined) {
        params.push(is_active);
        updates.push(`is_active = $${params.length}`);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    const result = await query(
      `UPDATE admin_users SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, username, email, role, full_name, is_active, created_at`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'update_admin',
      resourceType: 'admin_user',
      resourceId: id,
      details: { updates: req.body },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ 
      admin: result.rows[0],
      message: 'Admin user updated successfully'
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password
router.patch('/admins/:id/password', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { current_password, new_password } = req.body;

    // Can only change own password or super_admin can change anyone's
    if (req.user?.role !== 'super_admin' && req.user?.id !== id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    if (!new_password) {
      return res.status(400).json({ error: 'New password is required' });
    }

    // If not super_admin, verify current password
    if (req.user?.role !== 'super_admin' || current_password) {
      const userResult = await query(
        'SELECT password_hash FROM admin_users WHERE id = $1',
        [id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Admin user not found' });
      }

      if (current_password) {
        const isValid = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
        if (!isValid) {
          return res.status(400).json({ error: 'Current password is incorrect' });
        }
      }
    }

    // Hash new password
    const password_hash = await bcrypt.hash(new_password, 10);

    // Update password
    await query(
      'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
      [password_hash, id]
    );

    // Log audit action
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'change_password',
      resourceType: 'admin_user',
      resourceId: id,
      details: {},
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ 
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete admin user
router.delete('/admins/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    // Only super_admin can delete admin users
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admins can delete admin users' });
    }

    const { id } = req.params;

    // Cannot delete self
    if (req.user?.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await query(
      'DELETE FROM admin_users WHERE id = $1 RETURNING id, username',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Log audit action
    await logAuditAction({
      adminUserId: req.user?.id || '',
      action: 'delete_admin',
      resourceType: 'admin_user',
      resourceId: id,
      details: { username: result.rows[0].username },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ 
      success: true,
      message: 'Admin user deleted successfully'
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Groups Management ────────────────────────────────────────────────────────

// GET /groups — list all groups with pagination and search
router.get('/groups', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params: any[] = [];

    if (search) {
      whereClause = 'WHERE group_name ILIKE $1 OR group_id::text ILIKE $1';
      params.push(`%${search}%`);
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM authorized_groups ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit, offset);
    const result = await query(
      `SELECT id, group_id, group_name, group_type, bot_id, joined_at,
              country, language, member_count, is_active
       FROM authorized_groups
       ${whereClause}
       ORDER BY joined_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ groups: result.rows, total, page, limit });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /groups/:id — update group info (country, language)
router.put('/groups/:id', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { country, language } = req.body;

    const result = await query(
      `UPDATE authorized_groups
       SET country = $1, language = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, group_id, group_name, country, language, member_count, is_active`,
      [country || null, language || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ group: result.rows[0] });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /groups/:id/status — toggle group active status
router.patch('/groups/:id/status', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' });
    }

    await query(
      'UPDATE authorized_groups SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [is_active, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Toggle group status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /groups/:id — deactivate or remove a group
router.delete('/groups/:id', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE authorized_groups SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ message: 'Group deactivated successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Sweep (Fund Consolidation) Routes
// ============================================

// POST /sweep/run — trigger an immediate fund sweep
router.post('/sweep/run', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { sweepAllPendingAddresses } = await import('../services/sweep.service');
    const { networkId, minAmount } = req.body;

    const options: { networkId?: number; minAmount?: number } = {};
    if (networkId !== undefined) options.networkId = Number(networkId);
    if (minAmount !== undefined) options.minAmount = Number(minAmount);

    const results = await sweepAllPendingAddresses(options);
    res.json({ success: true, results });
  } catch (error: any) {
    console.error('Sweep run error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /sweep/history — paginated sweep records
router.get('/sweep/history', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (req.query.networkId) {
      params.push(Number(req.query.networkId));
      conditions.push(`network_id = $${params.length}`);
    }
    if (req.query.status) {
      params.push(String(req.query.status));
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM sweep_records ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const dataParams = [...params, limit, offset];
    const dataResult = await query(
      `SELECT * FROM sweep_records ${where}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams
    );

    res.json({
      records: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Sweep history error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// File upload endpoint
router.post('/upload', adminLimiter, authenticateAdmin, upload.single('file'), (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Please use field name "file"' });
      return;
    }
    const backendUrl = process.env.BACKEND_URL || '';
    const url = `${backendUrl}/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

export default router;
