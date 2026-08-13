import dotenv from 'dotenv';
import pool from '../src/db/pool.js';

dotenv.config();

const email = 'tguard@nith.ac.in';

const res = await pool.query(
  `UPDATE guard
   SET authorized_machine_1 = NULL, authorized_machine_2 = NULL
   WHERE LOWER(email) = LOWER($1)
   RETURNING id, email, authorized_machine_1, authorized_machine_2`,
  [email]
);

if (res.rows.length === 0) {
  console.log('No guard found with email:', email);
} else {
  console.log('Cleared machine IDs for guard:', res.rows[0]);
}

process.exit(0);
