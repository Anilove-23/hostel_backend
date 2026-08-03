import express from "express";
import pool from "../src/db/pool.js";

const router = express.Router();

/* =================================================
GET ALL DAY SCHOLARS
================================================= */
router.get("/", async (req, res) => {
  try {
    const scholars = await pool.query(
      `SELECT * FROM day_scholar ORDER BY name ASC`
    );
    res.status(200).json(scholars.rows);
  } catch (err) {
    console.error("Error fetching day scholars:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =================================================
GET DAY SCHOLAR LOGS
================================================= */
router.get("/logs", async (req, res) => {
  try {
    const logs = await pool.query(`
      SELECT 
        l.*,
        ds.name as scholar_name,
        ds.roll_no as scholar_roll_no
      FROM day_scholar_log l
      JOIN day_scholar ds ON l.day_scholar_id = ds.id
      ORDER BY l.timestamp DESC
      LIMIT 100
    `);
    res.status(200).json(logs.rows);
  } catch (err) {
    console.error("Error fetching day scholar logs:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =================================================
MARK ENTRY/EXIT
================================================= */
router.post("/log", async (req, res) => {
  const { scholar_id, direction, guard_id } = req.body;
  
  if (!scholar_id || !direction || !['ENTRY', 'EXIT'].includes(direction)) {
    return res.status(400).json({ error: "Invalid request data" });
  }

  try {
    const newLog = await pool.query(`
      INSERT INTO day_scholar_log (day_scholar_id, direction, gate, guard_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [scholar_id, direction, "Main Gate", guard_id || null]);
    
    res.status(201).json(newLog.rows[0]);
  } catch (err) {
    console.error("Error creating log:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =================================================
ADD NEW DAY SCHOLAR
================================================= */
router.post("/", async (req, res) => {
  const { name, roll_no, degree_type, phone } = req.body;

  if (!name || !roll_no) {
    return res.status(400).json({ error: "Name and roll_no are required" });
  }

  try {
    const newScholar = await pool.query(`
      INSERT INTO day_scholar (name, roll_no, degree_type, phone)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, roll_no, degree_type, phone]);

    res.status(201).json(newScholar.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({ error: "Roll number already exists" });
    }
    console.error("Error creating scholar:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
