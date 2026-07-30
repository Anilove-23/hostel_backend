import pool from '../../db/pool.js';

/**
 * Create a new user session entry.
 */
export async function createSession({ actorId, actorType, ipAddress, userAgent, refreshTokenId = null }) {
  const query = `
    INSERT INTO user_session (actor_id, actor_type, ip_address, user_agent, refresh_token_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const values = [actorId, actorType, ipAddress, userAgent, refreshTokenId];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Close an active session by updating logout_time.
 */
export async function closeSession(sessionId, logoutTime = new Date()) {
  const query = `
    UPDATE user_session
    SET logout_time = $1
    WHERE id = $2
    RETURNING *;
  `;
  const values = [logoutTime, sessionId];
  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

/**
 * Find user sessions with optional filters and pagination.
 */
export async function findSessions({ actorId, actorType, activeOnly = false, limit = 10, offset = 0 }) {
  const conditions = [];
  const values = [];

  if (actorId !== undefined && actorId !== null) {
    values.push(actorId);
    conditions.push(`actor_id = $${values.length}`);
  }
  if (actorType) {
    values.push(actorType);
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
