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
export async function findAudits({ staffId, actorRole, tableName, action, recordId, hostel, search, from, to, limit = 10, offset = 0 } = {}) {
  const conditions = [];
  const values = [];

  if (staffId !== undefined && staffId !== null) {
    values.push(staffId);
    conditions.push(`aal.staff_id = $${values.length}`);
  }
  if (actorRole) {
    values.push(actorRole);
    conditions.push(`aal.actor_role = $${values.length}`);
  }
  if (tableName) {
    values.push(tableName);
    conditions.push(`aal.table_name = $${values.length}`);
  }
  if (action) {
    values.push(action);
    conditions.push(`aal.action = $${values.length}`);
  }
  if (recordId !== undefined && recordId !== null) {
    values.push(String(recordId));
    conditions.push(`aal.record_id = $${values.length}`);
  }

  if (hostel && hostel !== 'All') {
    values.push(hostel);
    conditions.push(`a.hostel = $${values.length}`);
  }

  if (search && search.trim()) {
    values.push(`%${search.trim().toLowerCase()}%`);
    const idx = values.length;
    conditions.push(`(
      LOWER(COALESCE(a.name, '')) LIKE $${idx} OR
      LOWER(CAST(aal.table_name AS TEXT)) LIKE $${idx} OR
      LOWER(CAST(aal.action AS TEXT)) LIKE $${idx} OR
      LOWER(COALESCE(aal.reason, '')) LIKE $${idx}
    )`);
  }

  if (from) {
    values.push(from);
    conditions.push(`aal.created_at >= $${values.length}`);
  }

  if (to) {
    values.push(to);
    conditions.push(`aal.created_at <= $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT 
      aal.id,
      aal.staff_id,
      aal.actor_role,
      aal.action,
      aal.table_name,
      aal.record_id,
      aal.old_values,
      aal.new_values,
      aal.reason,
      aal.ip_address,
      aal.created_at,
      a.name AS staff_name,
      a.email AS staff_email,
      a.hostel AS staff_hostel
    FROM admin_audit_log aal
    LEFT JOIN admin a ON aal.staff_id = a.id
    ${whereClause}
    ORDER BY aal.created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2};
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM admin_audit_log aal
    LEFT JOIN admin a ON aal.staff_id = a.id
    ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    audits: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || 0, 10),
  };
}
