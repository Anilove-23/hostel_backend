import pool from '../../db/pool.js';

/**
 * Insert a student activity log entry.
 */
export async function insertActivity({ studentId, action, entityId = null, entityType = null, metadata = null }) {
  const query = `
    INSERT INTO student_activity_log (student_id, action, entity_id, entity_type, metadata)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;
  const values = [studentId, action, entityId, entityType, metadata ? JSON.stringify(metadata) : null];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Find student activity logs with optional filters and pagination.
 */
export async function findActivities({ studentId, action, entityType, limit = 10, offset = 0 }) {
  const conditions = [];
  const values = [];

  if (studentId !== undefined && studentId !== null) {
    values.push(studentId);
    conditions.push(`student_id = $${values.length}`);
  }
  if (action) {
    values.push(action);
    conditions.push(`action = $${values.length}`);
  }
  if (entityType) {
    values.push(entityType);
    conditions.push(`entity_type = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT * FROM student_activity_log
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2};
  `;

  const countQuery = `
    SELECT COUNT(*) AS total FROM student_activity_log
    ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    activities: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}
