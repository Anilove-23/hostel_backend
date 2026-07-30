import * as sessionRepo from '../repositories/session.repository.js';

/**
 * Start a user session.
 */
export async function startSession({ actorId, actorType, ipAddress, userAgent, refreshTokenId = null }) {
  try {
    if (!actorId || !actorType) {
      console.warn('[Logging/SessionService] Missing actorId or actorType for startSession');
      return null;
    }
    return await sessionRepo.createSession({
      actorId,
      actorType,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      refreshTokenId,
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
 * Fetch user sessions based on filters.
 */
export async function getSessions(filters = {}) {
  return await sessionRepo.findSessions(filters);
}
