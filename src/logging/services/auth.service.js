import * as authRepo from '../repositories/auth.repository.js';

/**
 * Log an authentication event (sign in, sign up, sign out).
 * Safe fire-and-forget logic: catches errors internally.
 */
export async function logAuthentication({ actorId, actorType, action, success, ipAddress, userAgent }) {
  try {
    if (!actorId || !actorType || !action) {
      console.warn('[Logging/AuthService] Missing required parameters for logAuthentication', { actorId, actorType, action });
      return null;
    }
    return await authRepo.insertAuthLog({
      actorId,
      actorType,
      action,
      success: Boolean(success),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });
  } catch (error) {
    console.error('[Logging/AuthService] Failed to record auth log:', error.message);
    return null;
  }
}

/**
 * Fetch authentication logs based on filters.
 */
export async function getAuthLogs(filters = {}) {
  return await authRepo.findAuthLogs(filters);
}
