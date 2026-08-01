import pool from '../../db/pool.js';

/**
 * Insert a new entry into auth_log table.
 */
export async function insertAuthLog({ actorId, actorType, action, success, ipAddress, userAgent }) {
  const query = `
    INSERT INTO auth_log (actor_id, actor_type, action, success, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const values = [actorId, actorType, action, success, ipAddress, userAgent];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Find auth logs with optional filters and pagination.
 */
export async function findAuthLogs({ actorId, actorType, action, success, limit = 10, offset = 0 }) {
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
    total: parseInt(countResult.rows[0].total, 10),
  };
}
