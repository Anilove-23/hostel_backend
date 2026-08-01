import 'dotenv/config';
import pkg from 'pg';
import jwt from 'jsonwebtoken';

const { Client } = pkg;

// Seeds ONE demo Outstation outpass already in the "still Out, past its
// declared return time" state, plus a valid guard JWT — so you can hit the
// real /api/outpasses/record-entry endpoint (the actual production check-in
// path, not the /demo/late-return test route) and watch the late-return
// email fire automatically, exactly like a real guard scan would trigger it.
//
// Usage: node scripts/seed_demo_late_return.js [parentEmail]
// Reuses your existing 'guard_test@nith.ac.in' guard account (no password
// needed — we sign a token directly with your own JWT_SECRET) and creates
// one throwaway demo student row. Nothing existing is modified.

const parentEmailArg = process.argv[2] || process.env.SMTP_USER;

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function seed() {
    await client.connect();

    try {
        await client.query('BEGIN');

        const guardRes = await client.query(
            `SELECT id, email FROM guard WHERE email = 'guard_test@nith.ac.in' LIMIT 1`
        );
        if (guardRes.rows.length === 0) {
            throw new Error("Guard 'guard_test@nith.ac.in' not found — update this script to use an existing guard email.");
        }
        const guard = guardRes.rows[0];

        const hostelRes = await client.query(`SELECT id, name FROM hostel LIMIT 1`);
        if (hostelRes.rows.length === 0) {
            throw new Error('No hostel rows found — cannot seed a demo student.');
        }
        const hostel = hostelRes.rows[0];

        // Throwaway demo student carrying the parent_email you want the alert
        // to land in.
        const studentRes = await client.query(
            `INSERT INTO student (name, department, hostel, hostel_id, roll_no, parent_email, parent_number)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name, roll_no`,
            [
                'Demo Late Student',
                'CSE',
                hostel.name,
                hostel.id,
                `DEMO${Date.now().toString().slice(-6)}`,
                parentEmailArg,
                '9999999999',
            ]
        );
        const student = studentRes.rows[0];

        const now = new Date();
        const expectedReturn = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h ago -> guaranteed late
        const departedAt = new Date(now.getTime() - 26 * 60 * 60 * 1000); // ~yesterday

        const outpassRes = await client.query(
            `INSERT INTO outpass
                (student_id, outpass_type, place_of_visit, purpose, departure_datetime,
                 arrival_datetime, parent_contact, is_active, outp_status, std_status, approved_at)
             VALUES ($1, 'Outstation', $2, $3, $4, $5, $6, true, 'Approved', 'Out', $7)
             RETURNING id`,
            [
                student.id,
                'Demo City',
                'Demo purpose for notification presentation',
                departedAt,
                expectedReturn,
                '9999999999',
                departedAt,
            ]
        );
        const outpassId = outpassRes.rows[0].id;

        await client.query(
            `INSERT INTO visit_log (outpass_id, student_id, actual_departure, gate, exit_guard_id)
             VALUES ($1, $2, $3, 'Main Gate', $4)`,
            [outpassId, student.id, departedAt, guard.id]
        );

        await client.query('COMMIT');

        const token = jwt.sign(
            { id: guard.id, email: guard.email, role: 'guard' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        console.log('\n✓ Demo outpass ready.\n');
        console.log(`  Student:            ${student.name} (${student.roll_no})`);
        console.log(`  Outpass ID:         ${outpassId}`);
        console.log(`  Expected return was: ${expectedReturn.toLocaleString()}  (already in the past)`);
        console.log(`  Parent email target: ${parentEmailArg || '(none set — pass one as an argument)'}\n`);

        console.log('Now run this in PowerShell to simulate the guard scanning the student back in:\n');
        console.log(
            `Invoke-RestMethod -Uri "http://localhost:${process.env.PORT || 5000}/api/outpasses/record-entry" ` +
                `-Method Post -ContentType "application/json" ` +
                `-Headers @{ Authorization = "Bearer ${token}"; role = "guard" } ` +
                `-Body '{"outpass_id": ${outpassId}, "action": "enter", "gate": "Main Gate"}'`
        );
        console.log('\nThat call updates visit_log/outpass exactly like a real guard scan, detects the late');
        console.log('return automatically, and fires the parent + chief-warden emails in the background.\n');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seed failed:', err.message);
    } finally {
        await client.end();
    }
}

seed();
