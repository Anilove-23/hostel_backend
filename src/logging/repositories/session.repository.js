import pool from '../../db/pool.js';
import { mapActorType } from '../../utils/actorType.js';

/**
 * Create a new user session entry.
 */
export async function createSession({ actorId, actorType, ipAddress, userAgent, role = null, refreshTokenHash = null, refreshExpiresAt = null, isActive = true }) {
  const normalizedActorType = mapActorType(actorType);
  const query = `
    INSERT INTO user_session (
      actor_id,
      actor_type,
      ip_address,
      user_agent,
      role,
      refresh_token_hash,
      refresh_expires_at,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;
  const values = [actorId, normalizedActorType, ipAddress, userAgent, role, refreshTokenHash, refreshExpiresAt, Boolean(isActive)];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Close an active session by updating logout_time.
 */
export async function closeSession(sessionId, logoutTime = new Date(), { refreshTokenHash = null, isActive = false } = {}) {
  const query = `
    UPDATE user_session
    SET logout_time = $1,
        refresh_token_hash = $2,
        is_active = $3
    WHERE id = $4
    RETURNING *;
  `;
  const values = [logoutTime, refreshTokenHash, Boolean(isActive), sessionId];
  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

export async function deactivateSessions({ actorId, actorType, logoutTime = new Date() }) {
  const normalizedActorType = mapActorType(actorType);
  const query = `
    UPDATE user_session
    SET logout_time = $1,
        is_active = FALSE
    WHERE actor_id = $2 AND actor_type = $3 AND is_active IS DISTINCT FROM FALSE
    RETURNING *;
  `;
  const values = [logoutTime, actorId, normalizedActorType];
  const result = await pool.query(query, values);
  return result.rows;
}

export async function findActiveSession({ actorId, actorType }) {
  const normalizedActorType = mapActorType(actorType);
  const query = `
    SELECT * FROM user_session
    WHERE actor_id = $1 AND actor_type = $2 AND is_active = TRUE
    ORDER BY login_time DESC
    LIMIT 1;
  `;
  const result = await pool.query(query, [actorId, normalizedActorType]);
  return result.rows[0] || null;
}

export async function findSessionById(sessionId) {
  const query = `
    SELECT * FROM user_session
    WHERE id = $1
    LIMIT 1;
  `;
  const result = await pool.query(query, [sessionId]);
  return result.rows[0] || null;
}

export async function updateSessionRefresh(sessionId, { refreshTokenHash, refreshExpiresAt, isActive = true }) {
  const query = `
    UPDATE user_session
    SET refresh_token_hash = $1,
        refresh_expires_at = $2,
        is_active = $3
    WHERE id = $4
    RETURNING *;
  `;
  const values = [refreshTokenHash, refreshExpiresAt, Boolean(isActive), sessionId];
  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

/**
 * Find user sessions with optional filters and pagination.
 */
export async function findSessions({ actorId, actorType, activeOnly = false, limit = 10, offset = 0 }) {
  const normalizedActorType = mapActorType(actorType);
  const conditions = [];
  const values = [];

  if (actorId !== undefined && actorId !== null) {
    values.push(actorId);
    conditions.push(`actor_id = $${values.length}`);
  }
  if (normalizedActorType) {
    values.push(normalizedActorType);
    conditions.push(`actor_type = $${values.length}`);
  }
  if (activeOnly) {
    conditions.push(`logout_time IS NULL`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT * FROM user_session
    ${whereClause}
    ORDER BY login_time DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2};
  `;

  const countQuery = `
    SELECT COUNT(*) AS total FROM user_session
    ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    sessions: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}
