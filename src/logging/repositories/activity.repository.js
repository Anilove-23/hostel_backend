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
export async function findActivities({ studentId, action, entityType, hostel, search, from, to, limit = 10, offset = 0 } = {}) {
  const conditions = [];
  const values = [];

  if (studentId !== undefined && studentId !== null) {
    values.push(studentId);
    conditions.push(`sal.student_id = $${values.length}`);
  }
  if (action) {
    values.push(action);
    conditions.push(`sal.action = $${values.length}`);
  }
  if (entityType) {
    values.push(entityType);
    conditions.push(`sal.entity_type = $${values.length}`);
  }

  if (hostel && hostel !== 'All') {
    values.push(hostel);
    conditions.push(`s.hostel = $${values.length}`);
  }

  if (search && search.trim()) {
    values.push(`%${search.trim().toLowerCase()}%`);
    const idx = values.length;
    conditions.push(`(
      LOWER(s.name) LIKE $${idx} OR
      LOWER(s.roll_no) LIKE $${idx} OR
      LOWER(CAST(sal.action AS TEXT)) LIKE $${idx} OR
      LOWER(COALESCE(sal.metadata::text, '')) LIKE $${idx}
    )`);
  }

  if (from) {
    values.push(from);
    conditions.push(`sal.created_at >= $${values.length}`);
  }

  if (to) {
    values.push(to);
    conditions.push(`sal.created_at <= $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT 
      sal.id,
      sal.student_id,
      sal.action,
      sal.entity_id,
      sal.entity_type,
      sal.metadata,
      sal.created_at,
      s.name AS student_name,
      s.roll_no,
      s.hostel,
      s.department
    FROM student_activity_log sal
    JOIN student s ON sal.student_id = s.id
    ${whereClause}
    ORDER BY sal.created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2};
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM student_activity_log sal
    JOIN student s ON sal.student_id = s.id
    ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    activities: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || 0, 10),
  };
}
