import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function check() {
    const { default: pool } = await import('../../src/db/pool.js');
    const res = await pool.query(`
        SELECT
            s.name, s.roll_no, s.current_year, s.is_allotted, s.individual_rank,
            hg.status AS group_status,
            hg.group_rank,
            r.room_number, r.block, h.name as allocated_hostel
        FROM student s
        JOIN housing_group hg ON s.group_id = hg.id
        LEFT JOIN room_assignment ra ON ra.student_id = s.id
        LEFT JOIN room r ON ra.room_id = r.id
        LEFT JOIN hostel h ON r.hostel_id = h.id
        WHERE s.roll_no LIKE 'TEST2Y%'
        ORDER BY s.individual_rank ASC;
    `);
    console.table(res.rows);
    process.exit(0);
}
check();
