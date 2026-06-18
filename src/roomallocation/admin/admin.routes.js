/**
 * admin.routes.js — Admin allocation scheduling endpoints
 *
 * Authority levels:
 *   1 = View only
 *   2 = Warden — can set allocation date + trigger phase transitions
 *   3 = Other admin — view + room override, but NOT set allocation date
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../../db/pool.js';
import { setCurrentPhase } from '../services/phase.service.js';
import { previewRankUpdate, executeRankUpdate } from '../services/rankUpdate.service.js';

const router = express.Router();

// ─── Multer setup for rank/CGPA CSV upload ────────────────────────────────────

const tempDir = 'uploads/temp/';
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const rankUploadStorage = multer.diskStorage({
    destination: tempDir,
    filename: (req, file, cb) => {
        const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'rank-' + suffix + path.extname(file.originalname));
    },
});
const rankUpload = multer({
    storage: rankUploadStorage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.csv', '.xls', '.xlsx'].includes(ext)) cb(null, true);
        else cb(new Error('Unsupported file format. Use .csv, .xls or .xlsx'));
    },
});

// ─── Admin Auth Middleware ────────────────────────────────────────────────────

function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded.authority_level) {
            return res.status(403).json({ success: false, message: 'Not an admin account' });
        }
        req.admin = decoded;
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
}

function requireLevel(minLevel) {
    return (req, res, next) => {
        if ((req.admin?.authority_level ?? 0) < minLevel) {
            return res.status(403).json({
                success: false,
                message: `Requires authority level ${minLevel} or higher`
            });
        }
        next();
    };
}

// ─── GET /api/admin/hostels ───────────────────────────────────────────────────

router.get('/hostels', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, type, total_capacity, current_phase, is_paused,
                    allocation_date, lobby_opens_at,
                    target_hostel_id, source_hostel_id
             FROM hostel ORDER BY name ASC`
        );
        return res.json({ success: true, hostels: result.rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/admin/set-allocation-date ─────────────────────────────────────
//
// Body:
//   fromHostelId   — the hostel whose STUDENTS will participate in this cycle
//   toHostelId     — the hostel whose ROOMS will be shown and allocated
//   allocationDate — YYYY-MM-DD string; must be a Saturday

router.post('/set-allocation-date', async (req, res) => {
    const { fromHostelId, toHostelId, allocationDate } = req.body;

    if (!fromHostelId || !toHostelId || !allocationDate) {
        return res.status(400).json({
            success: false,
            message: 'fromHostelId, toHostelId, and allocationDate are required'
        });
    }

    // Validate it's a Saturday (day = 6)
    const date = new Date(allocationDate + 'T00:00:00Z');
    if (date.getUTCDay() !== 6) {
        return res.status(400).json({
            success: false,
            message: 'Allocation date must be a Saturday'
        });
    }

    // lobby_opens_at = allocationDate - 5 days at 09:00 IST (03:30 UTC)
    const lobbyDate = new Date(date);
    lobbyDate.setUTCDate(lobbyDate.getUTCDate() - 5);
    lobbyDate.setUTCHours(3, 30, 0, 0); // 9:00 AM IST = 3:30 AM UTC

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify both hostels exist
        const fromRes = await client.query('SELECT id, name FROM hostel WHERE id = $1', [fromHostelId]);
        if (fromRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'From-hostel not found' });
        }

        const toRes = await client.query('SELECT id, name FROM hostel WHERE id = $1', [toHostelId]);
        if (toRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'To-hostel not found' });
        }

        // Update the FROM hostel: set allocation schedule + target link
        const fromUpdate = await client.query(
            `UPDATE hostel
             SET allocation_date    = $1,
                 lobby_opens_at     = $2,
                 target_hostel_id   = $3
             WHERE id = $4
             RETURNING id, name, allocation_date, lobby_opens_at, current_phase,
                       target_hostel_id`,
            [allocationDate, lobbyDate.toISOString(), toHostelId, fromHostelId]
        );

        // Update the TO hostel: set reverse source link
        await client.query(
            `UPDATE hostel SET source_hostel_id = $1 WHERE id = $2`,
            [fromHostelId, toHostelId]
        );

        await client.query('COMMIT');

        return res.json({
            success: true,
            fromHostel: fromUpdate.rows[0],
            toHostel: { id: toRes.rows[0].id, name: toRes.rows[0].name },
        });
    } catch (err) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
});

// ─── GET /api/admin/allocation-status/:hostelId ───────────────────────────────

router.get('/allocation-status/:hostelId', async (req, res) => {
    try {
        const hostelRes = await pool.query(
            `SELECT h.id, h.name, h.current_phase, h.is_paused,
                    h.allocation_date, h.lobby_opens_at,
                    h.target_hostel_id, h.source_hostel_id,
                    th.name AS target_hostel_name,
                    sh.name AS source_hostel_name
             FROM hostel h
             LEFT JOIN hostel th ON th.id = h.target_hostel_id
             LEFT JOIN hostel sh ON sh.id = h.source_hostel_id
             WHERE h.id = $1`,
            [req.params.hostelId]
        );
        if (hostelRes.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Hostel not found' });
        }

        const hostel = hostelRes.rows[0];

        // Get batch summary
        const batchRes = await pool.query(
            `SELECT batch_number, status, start_time, end_time
             FROM batch WHERE hostel_id = $1 ORDER BY batch_number ASC`,
            [req.params.hostelId]
        );

        // Get unallocated student count
        const unallocRes = await pool.query(
            `SELECT COUNT(*) as cnt FROM student WHERE is_allotted = false`
        );

        return res.json({
            success: true,
            hostel,
            batches: batchRes.rows,
            unallocatedCount: parseInt(unallocRes.rows[0].cnt),
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/admin/trigger-phase ───────────────────────────────────────────

router.post('/trigger-phase', async (req, res) => {
    const { hostelId, phase } = req.body;
    if (!hostelId || !phase) {
        return res.status(400).json({ success: false, message: 'hostelId and phase are required' });
    }
    try {
        const updated = await setCurrentPhase(hostelId, phase);
        return res.json({ success: true, hostel: updated });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/admin/rank-update/upload ──────────────────────────────────────
// Step 1: Upload CSV/XLSX and preview auto-detected column mappings

router.post('/rank-update/upload', rankUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const result = await previewRankUpdate(req.file.path, req.file.filename);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
});

// ─── POST /api/admin/rank-update/confirm ─────────────────────────────────────
// Step 2: Confirm and execute the rank + CGPA update

router.post('/rank-update/confirm', async (req, res) => {
    try {
        const { fileId, mappings } = req.body;
        if (!fileId || !mappings) {
            return res.status(400).json({ success: false, message: 'fileId and mappings are required' });
        }
        const result = await executeRankUpdate(fileId, mappings);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
});

export default router;
