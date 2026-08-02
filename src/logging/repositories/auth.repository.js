import pool from '../../db/pool.js';

/**
 * Sanitize details object to prevent logging sensitive credentials or session tokens.
 */
function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') return null;
  const sanitized = { ...details };
  delete sanitized.refreshToken;
  delete sanitized.refresh_token;
  delete sanitized.token;
  delete sanitized.password;
  delete sanitized.password_hash;
  delete sanitized.secret;
  delete sanitized.sessionId;
  delete sanitized.session_id;
  return Object.keys(sanitized).length > 0 ? JSON.stringify(sanitized) : null;
}

/**
 * Insert a new entry into auth_log table (omitting session_id for security).
 */
export async function insertAuthLog({
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
  const query = `
    INSERT INTO auth_log (
      actor_id,
      actor_type,
      action,
      success,
      ip_address,
      user_agent,
      event_name,
      endpoint,
      status,
      user_email,
      role,
      details
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *;
  `;
  const values = [
    actorId || null,
    actorType,
    action,
    Boolean(success),
    ipAddress || null,
    userAgent || null,
    eventName || null,
    endpoint || null,
    status || null,
    userEmail || null,
    role || null,
    sanitizeDetails(details),
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Find auth logs with optional filters and pagination.
 */
export async function findAuthLogs({ actorId, actorType, action, success, search, from, to, limit = 10, offset = 0 } = {}) {
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
  if (action) {
    values.push(action);
    conditions.push(`action = $${values.length}`);
  }
  if (success !== undefined && success !== null) {
    values.push(success);
    conditions.push(`success = $${values.length}`);
  }

  if (search && search.trim()) {
    values.push(`%${search.trim().toLowerCase()}%`);
    const idx = values.length;
    conditions.push(`(
      LOWER(COALESCE(user_email, '')) LIKE $${idx} OR
      LOWER(COALESCE(event_name, '')) LIKE $${idx} OR
      LOWER(COALESCE(role, '')) LIKE $${idx} OR
      LOWER(CAST(action AS TEXT)) LIKE $${idx}
    )`);
  }

  if (from) {
    values.push(from);
    conditions.push(`created_at >= $${values.length}`);
  }

  if (to) {
    values.push(to);
    conditions.push(`created_at <= $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT * FROM auth_log
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2};
  `;

  const countQuery = `
    SELECT COUNT(*) AS total FROM auth_log
    ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    logs: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || 0, 10),
  };
}
