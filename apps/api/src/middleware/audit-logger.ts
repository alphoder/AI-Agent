import { logger } from '../config/logger';

interface AuditLogEntry {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

/**
 * Audit logging is now a structured log line (the dedicated audit_logs table
 * was removed in the free-SaaS pivot). Never throws.
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    logger.info({ audit: true, ...entry }, `audit:${entry.action}`);
  } catch {
    /* never break the main flow */
  }
}
