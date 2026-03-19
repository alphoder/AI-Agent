import { db } from '../config/database';
import { logger } from '../config/logger';

interface AuditLogEntry {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8)`,
      [
        entry.tenantId,
        entry.userId,
        entry.action,
        entry.resourceType,
        entry.resourceId || null,
        JSON.stringify(entry.details || {}),
        entry.ipAddress || null,
        entry.userAgent || null,
      ],
    );
  } catch (err) {
    // Never let audit logging break the main flow
    logger.error({ err, ...entry }, 'Failed to write audit log');
  }
}
