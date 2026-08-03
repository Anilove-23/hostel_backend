import * as authRepo from '../repositories/auth.repository.js';
import { mapActorType } from '../../utils/actorType.js';

/**
 * Log an authentication event (sign in, sign up, sign out).
 * Safe fire-and-forget logic: catches errors internally.
 */
export async function logAuthentication({
  actorId = null,
  actorType,
  action,
  success,
  ipAddress,
  userAgent,
  eventName = null,
  endpoint = null,
  status = null,
  userEmail = null,
  role = null,
  details = null,
}) {
  try {
    const normalizedActorType = mapActorType(actorType);

    if (!normalizedActorType || !action) {
      console.warn('[Logging/AuthService] Missing required parameters for logAuthentication', { actorId, actorType, action });
      return null;
    }
    return await authRepo.insertAuthLog({
      actorId: actorId || null,
      actorType: normalizedActorType,
      action,
      success: Boolean(success),
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      eventName,
      endpoint,
      status,
      userEmail,
      role,
      details,
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
