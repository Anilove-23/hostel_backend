import { Router } from "express";

import auth from "../middleware/middleware.js";
import authorizeRoles from "../middleware/authorizeRoles.js";

import {
    searchByNameOrRollno,
    sortStudentsInRange,
    getAllOutpassesByStatus,
    getHostelOutpassesByStatus,
    assignAttendent
} from "../controllers/student.controller.js";
import pool from "../db/pool.js";

const router = Router();

// GET /api/students/search?q=name_or_roll[&scope=all]
// Returns only id, name, roll_no (NO cgpa, NO rank) for privacy
// By default only returns students without a group (squad-formation use case).
// Pass scope=all to search every student regardless of group membership
// (used by warden room management, which assigns students directly to rooms).
// scope=all is the expanded, un-group-filtered search — restricted to wardens.
router.get('/search', auth, async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
        return res.status(400).json({ success: false, message: 'Query must be at least 2 characters' });
    }
    if (req.query.scope === 'all' && req.user?.role !== 'warden') {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    try {
        const groupFilter = req.query.scope === 'all' ? '' : 'WHERE group_id IS NULL';
        const result = await pool.query(
            `SELECT id, name, roll_no, department
             FROM student
             ${groupFilter}
             ${groupFilter ? 'AND' : 'WHERE'} (name ILIKE $1 OR roll_no ILIKE $1)
             ORDER BY name ASC
             LIMIT 20`,
            [`%${q}%`]
        );
        return res.json({ success: true, students: result.rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/students/directory?q=name_or_roll
// Global student locator for the Admin Panel: shows a student's CURRENT room
// assignment (hostel name, room number, room type) or "not currently
// allocated". Read-only for every warden-table authority level (same
// cross-hostel read semantics as GET /rooms); mutation actions the frontend
// surfaces from these results (remove/evict) are separately enforced by the
// existing hostel-scoped RBAC on the room routes themselves.
router.get('/directory', auth, authorizeRoles('warden'), async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
        return res.status(400).json({ success: false, message: 'Query must be at least 2 characters' });
    }
    try {
        const result = await pool.query(
            `WITH current_alloc AS (
                SELECT DISTINCT ON (ra.student_id)
                    ra.student_id, r.id as room_id, r.room_number, r.room_type as room_status,
                    h.id as hostel_id, h.name as hostel_name
                FROM room_assignment ra
                JOIN room r ON r.id = ra.room_id
                JOIN hostel h ON h.id = r.hostel_id
                WHERE ra.assignment_status IN ('ACTIVE', 'UPCOMING')
                ORDER BY ra.student_id,
                         (CASE ra.assignment_status WHEN 'ACTIVE' THEN 0 WHEN 'UPCOMING' THEN 1 ELSE 2 END),
                         ra.assigned_at DESC
             )
             SELECT s.id, s.name, s.roll_no, s.department,
                    ca.hostel_id, ca.hostel_name, ca.room_id, ca.room_number, ca.room_status
             FROM student s
             LEFT JOIN current_alloc ca ON ca.student_id = s.id
             WHERE (s.name ILIKE $1 OR s.roll_no ILIKE $1)
             ORDER BY s.name ASC
             LIMIT 20`,
            [`%${q}%`]
        );

        const students = result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            rollNo: row.roll_no,
            department: row.department,
            allocation: row.room_id
                ? {
                    hostelId: row.hostel_id,
                    hostelName: row.hostel_name,
                    roomId: row.room_id,
                    roomNumber: row.room_number,
                    roomStatus: row.room_status,
                }
                : null,
        }));

        return res.json({ success: true, students });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/students/group-members/:groupId
// Returns members with cgpa (members can see each other's cgpa)
router.get('/group-members/:groupId', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT s.id, s.name, s.roll_no, s.department, s.cgpa, s.individual_rank,
                    (hg.primary_applicant_id = s.id) as is_leader
             FROM student s
             JOIN housing_group hg ON s.group_id = hg.id
             WHERE s.group_id = $1
             ORDER BY s.individual_rank ASC NULLS LAST`,
            [req.params.groupId]
        );
        return res.json({ success: true, members: result.rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/*
=================================================
SEARCH STUDENT
=================================================
*/
router.post(
    "/search",
    auth,
    searchByNameOrRollno
);

/*
=================================================
OUTPASSES IN RANGE
=================================================
*/
router.post(
    "/range",
    auth,
    sortStudentsInRange
);
router.post(
    "/assign-attendent",
    assignAttendent
);
/*
=================================================
OUTPASSES BY STATUS
=================================================
*/
router.post(
    "/hostel-status",
    auth,
    getHostelOutpassesByStatus
);
router.post(
    "/status",
    auth,
    getAllOutpassesByStatus
);

export default router;
