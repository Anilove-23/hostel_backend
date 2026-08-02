import pool from '../../db/pool.js';

/**
 * Find gate visit logs with filters (hostel, search, date range, pagination).
 */
export async function findVisits({ hostel, search, from, to, limit = 10, offset = 0 } = {}) {
  const conditions = [];
  const values = [];

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
      LOWER(COALESCE(vl.remarks, '')) LIKE $${idx} OR
      LOWER(COALESCE(vl.gate, '')) LIKE $${idx}
    )`);
  }

  if (from) {
    values.push(from);
    conditions.push(`vl.created_at >= $${values.length}`);
  }

  if (to) {
    values.push(to);
    conditions.push(`vl.created_at <= $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataQuery = `
    SELECT 
      vl.id,
      vl.outpass_id,
      vl.student_id,
      vl.actual_departure,
      vl.actual_arrival,
      vl.remarks,
      vl.created_at,
      vl.gate,
      o.outpass_type,
      o.place_of_visit,
      s.name AS student_name,
      s.roll_no,
      s.hostel,
      s.department
    FROM visit_log vl
    JOIN outpass o ON vl.outpass_id = o.id
    JOIN student s ON vl.student_id = s.id
    ${whereClause}
    ORDER BY vl.created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2};
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM visit_log vl
    JOIN outpass o ON vl.outpass_id = o.id
    JOIN student s ON vl.student_id = s.id
    ${whereClause};
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [...values, limit, offset]),
    pool.query(countQuery, values),
  ]);

  return {
    visits: dataResult.rows,
    total: parseInt(countResult.rows[0]?.total || 0, 10),
  };
}
