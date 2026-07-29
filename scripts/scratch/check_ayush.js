import { default as pool } from '../../src/db/pool.js';

async function check() {
    const res = await pool.query("SELECT group_id FROM student WHERE roll_no = '24bcs033'");
    console.log(res.rows[0]);
    process.exit(0);
}
check();
