import authorizeRoles from '../../middleware/authorizeRoles.js';
import pool from '../../db/pool.js';

/**
 * Coarse gate: only warden-table accounts (role='warden') may reach Room
 * Management endpoints at all. Reuses the existing generic role middleware.
 */
export const requireWarden = authorizeRoles('warden');

/**
 * Fine gate: scopes room mutations by authority_level, matching the same
 * convention already enforced in roomallocation/admin/event.routes.js:
 *   1 = View only    -> read-only across ALL hostels
 *   2 = Warden        -> full CRUD, but only within their own hostel
 *   3 = Other admin   -> full CRUD across ALL hostels
 *
 * `readOnly: true` marks a route as a read (GET) — any authority level may
 * call it. Mutating routes (POST/PUT/DELETE) require level 2 (own hostel
 * only, checked against req.params.hostelId) or level 3 (any hostel).
 */
export function requireHostelAccess({ readOnly = false } = {}) {
    return async (req, res, next) => {
        const level = req.user?.authority_level;

        if (!level) {
            return res.status(403).json({ success: false, message: 'Account has no authority level assigned' });
        }

        if (readOnly) {
            return next();
        }

        if (level === 1) {
            return res.status(403).json({ success: false, message: 'View-only accounts cannot modify rooms' });
        }

        if (level === 3) {
            return next();
        }

        if (level === 2) {
            const { hostelId } = req.params;
            if (!hostelId) {
                return res.status(400).json({ success: false, message: 'Missing hostelId' });
            }

            const hostelName = req.user.hostel;
            if (!hostelName) {
                return res.status(403).json({ success: false, message: 'Warden account has no assigned hostel' });
            }

            const result = await pool.query('SELECT id FROM hostel WHERE name = $1', [hostelName]);
            const ownHostelId = result.rows[0]?.id;

            if (!ownHostelId || ownHostelId !== hostelId) {
                return res.status(403).json({ success: false, message: 'Cannot modify a hostel outside your assignment' });
            }

            return next();
        }

        return res.status(403).json({ success: false, message: 'Unrecognized authority level' });
    };
}
