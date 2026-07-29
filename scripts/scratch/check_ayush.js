import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function check() {
    const { default: pool } = await import('../../src/db/pool.js');
    const { allocationService } = await import('../../src/roomallocation/services/allocation.service.js');
    // Fix any groups missing allocation_event_id by looking up their primary_applicant's current_year
    const updateRes = await pool.query(`
        UPDATE housing_group hg
        SET allocation_event_id = ae.id
        FROM student s
        JOIN allocation_event ae ON ae.target_year = s.current_year
        WHERE hg.primary_applicant_id = s.id
          AND hg.allocation_event_id IS NULL
    `);
    console.log(`Updated ${updateRes.rowCount} housing groups with allocation_event_id`);
    process.exit(0);
}
check();
