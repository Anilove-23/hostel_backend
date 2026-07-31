import { default as pool } from '../../src/db/pool.js';
async function updateHostel() {
    try {
        const hostelRes = await pool.query("SELECT id, name FROM hostel WHERE name ILIKE '%dhauladhar%'");
        if (hostelRes.rows.length === 0) {
            console.log('Hostel not found');
            process.exit(1);
        }
        const newHostelId = hostelRes.rows[0].id;
        const newHostelName = hostelRes.rows[0].name;
        
        const updateRes = await pool.query(
            "UPDATE student SET hostel_id = $1, hostel = $2 WHERE roll_no = '24bcs033' RETURNING *", 
            [newHostelId, newHostelName]
        );
        console.log('Updated Student:', updateRes.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
updateHostel();
