import * as auditRepo from '../repositories/audit.repository.js';

/**
 * Log an admin/staff database change (CREATE, UPDATE, DELETE).
 * Meant to be called explicitly by domain services after transactions complete.
 * Safe fire-and-forget logic: catches errors internally.
 */
export async function logAdminAudit({
  staffId,
  actorRole,
  action,
  tableName,
  recordId,
  oldValues = null,
  newValues = null,
  reason = null,
  ipAddress = null,
}) {
  try {
    if (!staffId || !actorRole || !action || !tableName || recordId === undefined || recordId === null) {
      console.warn('[Logging/AuditService] Missing required parameters for logAdminAudit', {
        staffId,
        actorRole,
        action,
        tableName,
        recordId,
      });
      return null;
    }
    return await auditRepo.insertAudit({
      staffId,
      actorRole,
      action,
      tableName,
      recordId,
      oldValues,
      newValues,
      reason,
      ipAddress,
    });
  } catch (error) {
    console.error('[Logging/AuditService] Failed to record admin audit log:', error.message);
    return null;
  }
}

/**
 * Fetch admin audit logs based on filters.
 */
export async function getAdminAudits(filters = {}) {
  return await auditRepo.findAudits(filters);
}
