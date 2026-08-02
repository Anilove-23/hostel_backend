import  pool  from "../db/pool.js"; // adjust path to match your existing pool import
import  asyncHandler  from "../utils/asyncHandler.js";
import  ApiError from "../utils/ApiError.js";
import  ApiResponse from "../utils/ApiResponse.js";

/**
 * @desc    Get complete outpass details (Chief Warden has unrestricted access)
 * @route   GET /api/chief-warden/outpasses/:id
 * @access  Private (Chief Warden only)
 *
 * NOTE: Intentionally does NOT check:
 *   - student ownership
 *   - hostel_id
 *   - attendant assignment
 * Chief Warden is allowed to view every outpass.
 */
const getOutpassDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    throw new ApiError(400, "Invalid outpass id");
  }

  const outpassQuery = `
    SELECT
    o.*,

    s.id AS student_id,
    s.name,
    s.roll_no,
    s.email,
    s.phone,
    s.father_name,
    s.parent_number,
    s.department,
    s.hostel,

    r.room_number,

    a.name AS approved_by_name
FROM outpass o
JOIN student s ON o.student_id = s.id
LEFT JOIN room_assignment ra
    ON ra.student_id = s.id
    AND ra.assignment_status = 'ACTIVE'
LEFT JOIN room r
    ON r.id = ra.room_id
LEFT JOIN attendent a
    ON a.id = o.approved_by
WHERE o.id = $1;
  `;

  const outpassResult = await pool.query(outpassQuery, [id]);

  if (outpassResult.rows.length === 0) {
    throw new ApiError(404, "Outpass not found");
  }

  const remarksQuery = `
    SELECT
      id,
      outpass_id,
      admin_id,
      admin_role,
      remark,
      created_at
    FROM outpass_remarks
    WHERE outpass_id = $1
    ORDER BY created_at ASC
  `;

  const remarksResult = await pool.query(remarksQuery, [id]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        outpass: outpassResult.rows[0],
        remarks: remarksResult.rows,
      },
      "Outpass details fetched successfully"
    )
  );
});

/**
 * @desc    Add a Chief Warden remark to an outpass
 * @route   POST /api/chief-warden/outpasses/:id/remarks
 * @access  Private (Chief Warden only)
 */
const addChiefWardenRemark = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { remark } = req.body;

  if (!id || isNaN(Number(id))) {
    throw new ApiError(400, "Invalid outpass id");
  }

  if (!remark || typeof remark !== "string" || !remark.trim()) {
    throw new ApiError(400, "Remark cannot be empty");
  }

  const trimmedRemark = remark.trim();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const outpassCheck = await client.query(
      `SELECT id FROM outpass WHERE id = $1`,
      [id]
    );

    if (outpassCheck.rows.length === 0) {
      throw new ApiError(404, "Outpass not found");
    }

    const insertRemarkQuery = `
      INSERT INTO outpass_remarks (outpass_id, admin_id, admin_role, remark, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, outpass_id, admin_id, admin_role, remark, created_at
    `;

    const insertResult = await client.query(insertRemarkQuery, [
      id,
      req.user.id,
      "CHIEF_WARDEN",
      trimmedRemark,
    ]);

    await client.query("COMMIT");

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { remark: insertResult.rows[0] },
          "Remark added successfully"
        )
      );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

export { getOutpassDetails, addChiefWardenRemark };