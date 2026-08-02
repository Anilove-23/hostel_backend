import * as sessionRepo from '../repositories/session.repository.js';
import { mapActorType } from '../../utils/actorType.js';

/**
 * Start a user session.
 */
export async function startSession({ actorId, actorType, ipAddress, userAgent, role = null, refreshTokenHash = null, refreshExpiresAt = null, isActive = true }) {
  try {
    const normalizedActorType = mapActorType(actorType);

    if (!actorId || !normalizedActorType) {
      console.warn('[Logging/SessionService] Missing actorId or actorType for startSession');
      return null;
    }
    return await sessionRepo.createSession({
      actorId,
      actorType: normalizedActorType,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      role,
      refreshTokenHash,
      refreshExpiresAt,
      isActive,
    });
  } catch (error) {
    console.error('[Logging/SessionService] Failed to start session:', error.message);
    return null;
  }
}

/**
 * End a user session by session ID.
 */
export async function endSession(sessionId) {
  try {
    if (!sessionId) {
      console.warn('[Logging/SessionService] Missing sessionId for endSession');
      return null;
    }
    return await sessionRepo.closeSession(sessionId);
  } catch (error) {
    console.error('[Logging/SessionService] Failed to end session:', error.message);
    return null;
  }
}

/**
 * Deactivate active sessions for a user.
 */
export async function deactivateSessions(params = {}) {
  try {
    const normalizedParams = {
      ...params,
      actorType: params.actorType ? mapActorType(params.actorType) : params.actorType
    };
    return await sessionRepo.deactivateSessions(normalizedParams);
  } catch (error) {
    console.error('[Logging/SessionService] Failed to deactivate sessions:', error.message);
    return [];
  }
}

/**
 * Get active session for a user.
 */
export async function getActiveSession(params = {}) {
  try {
    const normalizedParams = {
      ...params,
      actorType: params.actorType ? mapActorType(params.actorType) : params.actorType
    };
    return await sessionRepo.findActiveSession(normalizedParams);
  } catch (error) {
    console.error('[Logging/SessionService] Failed to fetch active session:', error.message);
    return null;
  }
}

export async function getSessionById(sessionId) {
  try {
    return await sessionRepo.findSessionById(sessionId);
  } catch (error) {
    console.error('[Logging/SessionService] Failed to fetch session by id:', error.message);
    return null;
  }
}

export async function rotateSessionRefresh(sessionId, params = {}) {
  try {
    return await sessionRepo.updateSessionRefresh(sessionId, params);
  } catch (error) {
    console.error('[Logging/SessionService] Failed to rotate session refresh token:', error.message);
    return null;
  }
}

/**
 * Fetch user sessions based on filters.
 */
export async function getSessions(filters = {}) {
  return await sessionRepo.findSessions(filters);
}