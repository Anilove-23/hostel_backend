import dotenv from 'dotenv';
import pool from '../src/db/pool.js';

dotenv.config();

const roll = '24bcs033';
const newHostelName = 'Dhauladhar Boys Hostel';

try {
  // Check current student
  const studentRes = await pool.query('SELECT * FROM student WHERE roll_no ILIKE $1', [roll]);
  if (studentRes.rows.length === 0) {
    console.log('Student not found with roll no:', roll);
    process.exit(0);
  }
  const student = studentRes.rows[0];
  console.log('Current student:', student.name, '| Hostel:', student.hostel);

  // Get new hostel id
  const hostelRes = await pool.query('SELECT * FROM hostel WHERE name ILIKE $1', [newHostelName]);
  if (hostelRes.rows.length === 0) {
    console.log('Hostel not found with name:', newHostelName);
    process.exit(0);
  }
  const newHostel = hostelRes.rows[0];

  // Update student
  await pool.query('UPDATE student SET hostel = $1, hostel_id = $2 WHERE id = $3', [newHostel.name, newHostel.id, student.id]);
  console.log('Successfully updated student hostel to:', newHostel.name);
  process.exit(0);
} catch(e) {
  console.error(e);
  process.exit(1);
}
