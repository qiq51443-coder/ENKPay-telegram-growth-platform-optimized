import { query } from '../db';

export interface AuditLogParams {
  adminUserId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an admin action to the audit trail
 */
export async function logAuditAction(params: AuditLogParams): Promise<void> {
  try {
    const {
      adminUserId,
      action,
      resourceType,
      resourceId,
      details,
      ipAddress,
      userAgent,
    } = params;

    await query(
      `INSERT INTO admin_audit_logs 
       (admin_user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        adminUserId,
        action,
        resourceType || null,
        resourceId || null,
        details ? JSON.stringify(details) : null,
        ipAddress || null,
        userAgent || null,
      ]
    );
  } catch (error) {
    // Log the error but don't throw - audit logging should not break the main operation
    console.error('Failed to log audit action:', error);
  }
}

/**
 * Get audit logs with optional filtering
 */
export async function getAuditLogs(params: {
  adminUserId?: string;
  action?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const {
    adminUserId,
    action,
    resourceType,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = params;

  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (adminUserId) {
    conditions.push(`al.admin_user_id = $${paramIndex++}`);
    values.push(adminUserId);
  }

  if (action) {
    conditions.push(`al.action = $${paramIndex++}`);
    values.push(action);
  }

  if (resourceType) {
    conditions.push(`al.resource_type = $${paramIndex++}`);
    values.push(resourceType);
  }

  if (startDate) {
    conditions.push(`al.created_at >= $${paramIndex++}`);
    values.push(startDate);
  }

  if (endDate) {
    conditions.push(`al.created_at <= $${paramIndex++}`);
    values.push(endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  values.push(limit, offset);

  const result = await query(
    `SELECT 
      al.*,
      au.username as admin_username,
      au.full_name as admin_full_name
     FROM admin_audit_logs al
     LEFT JOIN admin_users au ON al.admin_user_id = au.id
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    values
  );

  // Get total count for pagination
  const countResult = await query(
    `SELECT COUNT(*) as total
     FROM admin_audit_logs al
     ${whereClause}`,
    values.slice(0, -2) // Remove limit and offset
  );

  return {
    logs: result.rows,
    total: parseInt(countResult.rows[0]?.total || '0', 10),
    limit,
    offset,
  };
}

/**
 * Common audit action types
 */
export const AuditActions = {
  // Admin user management
  CREATE_ADMIN: 'create_admin',
  UPDATE_ADMIN: 'update_admin',
  DELETE_ADMIN: 'delete_admin',
  CHANGE_PASSWORD: 'change_password',
  
  // Bot management
  CREATE_BOT: 'create_bot',
  UPDATE_BOT: 'update_bot',
  DELETE_BOT: 'delete_bot',
  TOGGLE_BOT_STATUS: 'toggle_bot_status',
  
  // User management
  UPDATE_USER: 'update_user',
  BAN_USER: 'ban_user',
  UNBAN_USER: 'unban_user',
  
  // Content management
  REVIEW_BINDING: 'review_binding',
  REVIEW_SCREENSHOT: 'review_screenshot',
  REVIEW_WITHDRAWAL: 'review_withdrawal',
  CREATE_BROADCAST: 'create_broadcast',
  SEND_BROADCAST: 'send_broadcast',
  CREATE_RED_PACKET: 'create_red_packet',
  
  // System settings
  UPDATE_SETTINGS: 'update_settings',
  BULK_UPDATE_SETTINGS: 'bulk_update_settings',
  
  // Auth
  LOGIN: 'login',
  LOGOUT: 'logout',
} as const;
