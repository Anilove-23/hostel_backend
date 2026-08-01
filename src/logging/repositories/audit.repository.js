import pool from '../../db/pool.js';

/**
 * Insert an admin/staff audit log entry.
 */
export async function insertAudit({
  staffId,
  actorRole,
  action,
  tableName,
  recordId,
  oldValues = null,
  newValues = null,
  reason = null,
  ipAddress = null,
}) {
  const query = `
    INSERT INTO admin_audit_log (
      staff_id, actor_role, action, table_name, record_id, old_values, new_values, reason, ip_address
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;
  const values = [
    staffId,
    actorRole,
    action,
    tableName,
    String(recordId),
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    reason,
    ipAddress,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Find admin audit logs with optional filters and pagination.
 */
export async function findAudits({ staffId, actorRole, tableName, action, recordId, limit = 10, offset = 0 }) {
  const conditions = [];
  const values = [];

  if (staffId !== undefined && staffId !== null) {
    values.push(staffId);
    conditions.push(`staff_id = $${values.length}`);
  }
  if (actorRole) {
    values.push(actorRole);
    conditions.push(`actor_role = $${values.length}`);
  }
  if (tableName) {
    values.push(tableName);
    conditions.push(`table_name = $${values.length}`);
  }
  if (action) {
    values.push(action);
    conditions.push(`action = $${values.length}`);
  }
  if (recordId !== undefined && recordId !== null) {
    values.push(String(recordId));
    conditions.push(`record_id = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT * FROM admin_audit_log
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2};
  `;

  const countQuery = `
    SELECT COUNT(*) AS total FROM admin_audit_log
    ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    audits: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
  };
}
