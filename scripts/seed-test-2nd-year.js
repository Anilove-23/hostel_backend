/**
 * seed-test-2nd-year.js
 * ============================================================
 * Seeds a COMPLETE end-to-end test scenario for 2nd year allocation:
 *
 *  - Physical hostel:  Himadri   (where 2nd years currently live)
 *  - Target hostels:   Neelkanth + Dhauladhar (where they will be allocated)
 *  - 12 test students  (ranks 1–12, varying CGPA)
 *  - 4 housing groups  (sizes 3, 3, 2, 4)
 *  - 1 allocation event (target_year=2)
 *  - Rooms in Neelkanth & Dhauladhar added to event pool
 *  - Preference lists  for each group
 *  - 2 batches (each 30s in TEST_MODE → 3 rounds × 10s)
 *
 * Usage:
 *   TEST_MODE=true node scripts/seed-test-2nd-year.js
 *
 * WARNING: This script TRUNCATES existing test data tagged with
 *          roll numbers starting with TEST2Y and re-seeds.
 *          It does NOT truncate the entire DB.
 * ============================================================
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

// ── Timing config (matches testConfig.js) ─────────────────
const ROUND_DURATION_MS = process.env.TEST_MODE === 'true' ? 10_000 : 600_000;
const MAX_ROUNDS        = 3;
const BATCH_DURATION_MS = MAX_ROUNDS * ROUND_DURATION_MS;

// ──────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────
async function seed() {
    const { default: pool } = await import('../src/db/pool.js');
    const client = await pool.connect();

    try {
        console.log('\n╔═══════════════════════════════════════════════╗');
        console.log('║  2nd Year Allocation — Test Seed Script       ║');
        console.log(`║  Round duration: ${ROUND_DURATION_MS / 1000}s   Batch: ${BATCH_DURATION_MS / 1000}s        ║`);
        console.log('╚═══════════════════════════════════════════════╝\n');

        await client.query('BEGIN');

        // ─── STEP 1: Clean up previous test run ───────────
        console.log('Step 1 ▸ Cleaning previous test data (roll_no LIKE TEST2Y%)...');

        // Find test student IDs
        const testStudentIds = (await client.query(
            `SELECT id FROM student WHERE roll_no LIKE 'TEST2Y%'`
        )).rows.map(r => r.id);

        if (testStudentIds.length > 0) {
            await client.query('ALTER TABLE student DISABLE TRIGGER USER');
            await client.query('ALTER TABLE housing_group DISABLE TRIGGER USER');
            // Delete in dependency order
            await client.query(`DELETE FROM room_assignment    WHERE student_id  = ANY($1::int[])`, [testStudentIds]);
            await client.query(`DELETE FROM submission_preference
                                WHERE submission_id IN (
                                    SELECT id FROM allocation_submission
                                    WHERE batch_id IN (
                                        SELECT id FROM batch
                                        WHERE allocation_event_id IN (
                                            SELECT id FROM allocation_event WHERE target_year = 2
                                        )
                                    )
                                )`);
            await client.query(`DELETE FROM allocation_submission WHERE batch_id IN (
                                    SELECT id FROM batch
                                    WHERE allocation_event_id IN (
                                        SELECT id FROM allocation_event WHERE target_year = 2
                                    )
                                )`);
            await client.query(`DELETE FROM batch WHERE allocation_event_id IN (
                                    SELECT id FROM allocation_event WHERE target_year = 2
                                )`);
            await client.query(`DELETE FROM event_room_pool WHERE allocation_event_id IN (
                                    SELECT id FROM allocation_event WHERE target_year = 2
                                )`);
            await client.query(`DELETE FROM event_hostel_participation WHERE allocation_event_id IN (
                                    SELECT id FROM allocation_event WHERE target_year = 2
                                )`);
            await client.query(`DELETE FROM allocation_event WHERE target_year = 2`);

            // Detach students from groups first
            await client.query(`UPDATE student SET group_id = NULL WHERE id = ANY($1::int[])`, [testStudentIds]);
            await client.query(`DELETE FROM housing_group WHERE primary_applicant_id = ANY($1::int[])`, [testStudentIds]);
            await client.query(`DELETE FROM student WHERE id = ANY($1::int[])`, [testStudentIds]);
            // Re-enable triggers
            await client.query('ALTER TABLE housing_group ENABLE TRIGGER USER');
            await client.query('ALTER TABLE student ENABLE TRIGGER USER');
        } else {
            // Still clean allocation event if no students exist
            await client.query(`DELETE FROM batch WHERE allocation_event_id IN (
                                    SELECT id FROM allocation_event WHERE target_year = 2
                                )`);
            await client.query(`DELETE FROM event_room_pool WHERE allocation_event_id IN (
                                    SELECT id FROM allocation_event WHERE target_year = 2
                                )`);
            await client.query(`DELETE FROM event_hostel_participation WHERE allocation_event_id IN (
                                    SELECT id FROM allocation_event WHERE target_year = 2
                                )`);
            await client.query(`DELETE FROM allocation_event WHERE target_year = 2`);
        }
        console.log('  ✓ Previous test data cleaned\n');

        // ─── STEP 2: Resolve hostel IDs ───────────────────
        console.log('Step 2 ▸ Resolving hostel IDs...');

        async function getOrCreateHostel(name, type = 'BOYS', capacity = 200) {
            const res = await client.query(`SELECT id FROM hostel WHERE name = $1`, [name]);
            if (res.rowCount > 0) return res.rows[0].id;
            const ins = await client.query(
                `INSERT INTO hostel (name, type, total_capacity) VALUES ($1, $2, $3) RETURNING id`,
                [name, type, capacity]
            );
            console.log(`  ℹ  Created hostel "${name}"`);
            return ins.rows[0].id;
        }

        const himadriId     = await getOrCreateHostel('Himadri');
        const neelkanthId   = await getOrCreateHostel('Neelkanth');
        const dhauladharId  = await getOrCreateHostel('Dhauladhar');

        console.log(`  ✓ Himadri    → ${himadriId}`);
        console.log(`  ✓ Neelkanth  → ${neelkanthId}`);
        console.log(`  ✓ Dhauladhar → ${dhauladharId}\n`);

        // ─── STEP 3: Seed rooms in target hostels ─────────
        console.log('Step 3 ▸ Ensuring rooms exist in Neelkanth & Dhauladhar...');

        async function ensureRoom(hostelId, hostelName, roomNumber, block, capacity) {
            const existing = await client.query(
                `SELECT id FROM room WHERE hostel_id = $1 AND room_number = $2 AND (block = $3 OR $3 IS NULL)`,
                [hostelId, roomNumber, block]
            );
            if (existing.rowCount > 0) return existing.rows[0].id;
            const res = await client.query(
                `INSERT INTO room (hostel_id, room_number, block, max_capacity) VALUES ($1, $2, $3, $4) RETURNING id`,
                [hostelId, roomNumber, block, capacity]
            );
            return res.rows[0].id;
        }

        // Neelkanth rooms
        const NK_R1 = await ensureRoom(neelkanthId, 'Neelkanth', '101', 'A', 2);
        const NK_R2 = await ensureRoom(neelkanthId, 'Neelkanth', '102', 'A', 3);
        const NK_R3 = await ensureRoom(neelkanthId, 'Neelkanth', '103', 'A', 2);
        const NK_R4 = await ensureRoom(neelkanthId, 'Neelkanth', '201', 'B', 4);
        const NK_R5 = await ensureRoom(neelkanthId, 'Neelkanth', '202', 'B', 2);

        // Dhauladhar rooms
        const DH_R1 = await ensureRoom(dhauladharId, 'Dhauladhar', '101', 'A', 3);
        const DH_R2 = await ensureRoom(dhauladharId, 'Dhauladhar', '102', 'A', 2);
        const DH_R3 = await ensureRoom(dhauladharId, 'Dhauladhar', '201', 'B', 4);
        const DH_R4 = await ensureRoom(dhauladharId, 'Dhauladhar', '202', 'B', 2);

        console.log(`  ✓ Neelkanth rooms:  101-A(2), 102-A(3), 103-A(2), 201-B(4), 202-B(2)`);
        console.log(`  ✓ Dhauladhar rooms: 101-A(3), 102-A(2), 201-B(4), 202-B(2)\n`);

        // ─── STEP 4: Create Allocation Event ──────────────
        console.log('Step 4 ▸ Creating allocation event for 2nd year...');
        const eventRes = await client.query(`
            INSERT INTO allocation_event (target_year, status, allocation_date, lobby_opens_at)
            VALUES (2, 'LIVE_BATCHES', NOW() + interval '7 days', NOW())
            RETURNING id
        `);
        const eventId = eventRes.rows[0].id;
        console.log(`  ✓ Event ID: ${eventId}\n`);

        // ─── STEP 5: Add hostels + rooms to event pool ────
        console.log('Step 5 ▸ Adding Neelkanth & Dhauladhar to event pool...');
        await client.query(
            `INSERT INTO event_hostel_participation (allocation_event_id, hostel_id) VALUES ($1, $2), ($1, $3)`,
            [eventId, neelkanthId, dhauladharId]
        );

        const allRooms = [NK_R1, NK_R2, NK_R3, NK_R4, NK_R5, DH_R1, DH_R2, DH_R3, DH_R4];
        const roomHostelMap = {
            [NK_R1]: neelkanthId,  [NK_R2]: neelkanthId,  [NK_R3]: neelkanthId,
            [NK_R4]: neelkanthId,  [NK_R5]: neelkanthId,
            [DH_R1]: dhauladharId, [DH_R2]: dhauladharId, [DH_R3]: dhauladharId,
            [DH_R4]: dhauladharId,
        };

        for (const roomId of allRooms) {
            const hostelId = roomHostelMap[roomId];
            await client.query(
                `INSERT INTO event_room_pool (allocation_event_id, hostel_id, room_id)
                 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [eventId, hostelId, roomId]
            );
        }
        console.log(`  ✓ ${allRooms.length} rooms added to event pool\n`);

        // ─── STEP 6: Seed Students ─────────────────────────
        console.log('Step 6 ▸ Seeding 12 test students from Himadri...');
        console.log('         (current_year=2, joining_year=2024)\n');

        const studentDefs = [
            // name,               roll,         cgpa, rank
            ['Arjun Sharma',       'TEST2Y001',  9.2,  1],
            ['Priya Mehta',        'TEST2Y002',  8.9,  2],
            ['Rohan Verma',        'TEST2Y003',  8.7,  3],
            ['Sneha Patel',        'TEST2Y004',  8.5,  4],
            ['Vikram Singh',       'TEST2Y005',  8.3,  5],
            ['Anika Gupta',        'TEST2Y006',  8.1,  6],
            ['Karan Joshi',        'TEST2Y007',  7.9,  7],
            ['Divya Kapoor',       'TEST2Y008',  7.7,  8],
            ['Rahul Kumar',        'TEST2Y009',  7.5,  9],
            ['Meera Nair',         'TEST2Y010',  7.3, 10],
            ['Suresh Reddy',       'TEST2Y011',  7.1, 11],
            ['Pooja Sharma',       'TEST2Y012',  6.9, 12],
        ];

        const studentIds = [];
        for (const [name, roll, cgpa, rank] of studentDefs) {
            // Check if roll already used globally (shouldn't be after cleanup, but safety check)
            const existing = await client.query(`SELECT id FROM student WHERE roll_no = $1`, [roll]);
            if (existing.rowCount > 0) {
                studentIds.push(existing.rows[0].id);
                console.log(`  ⚠  Reusing student ${roll} (id=${existing.rows[0].id})`);
                continue;
            }
            const res = await client.query(`
                INSERT INTO student
                    (name, roll_no, email, password, hostel, hostel_id,
                     department, cgpa, individual_rank, joining_year, current_year)
                VALUES
                    ($1, $2, $3, 'test1234', 'Himadri', $4, 'CSE', $5, $6, 2024, 2)
                RETURNING id
            `, [name, roll, `${roll.toLowerCase()}@nith.ac.in`, himadriId, cgpa, rank]);
            studentIds.push(res.rows[0].id);
            console.log(`  ✓  ${name.padEnd(20)} | Rank: ${String(rank).padStart(2)} | CGPA: ${cgpa}`);
        }

        const [s1,s2,s3, s4,s5,s6, s7,s8, s9,s10,s11,s12] = studentIds;
        console.log('');

        // ─── STEP 7: Create Housing Groups ────────────────
        console.log('Step 7 ▸ Creating housing groups...\n');

        // Batch 1 groups (SOFT_LOCKED → will be HARD_LOCKED on batch start)
        // Group A: Rank 1 (leader), Rank 2, Rank 3 → size 3 → needs a 3-capacity room
        const g1 = (await client.query(`
            INSERT INTO housing_group (primary_applicant_id, status, group_rank, allocation_event_id)
            VALUES ($1, 'SOFT_LOCKED', 1, $2) RETURNING id
        `, [s1, eventId])).rows[0].id;
        await client.query(`UPDATE student SET group_id = $1 WHERE id IN ($2, $3, $4)`, [g1, s1, s2, s3]);
        console.log(`  ✓ Group A (rank 1) : Arjun, Priya, Rohan  [size 3]`);

        // Group B: Rank 4 (leader), Rank 5, Rank 6 → size 3 → needs a 3-capacity room
        const g2 = (await client.query(`
            INSERT INTO housing_group (primary_applicant_id, status, group_rank, allocation_event_id)
            VALUES ($1, 'SOFT_LOCKED', 4, $2) RETURNING id
        `, [s4, eventId])).rows[0].id;
        await client.query(`UPDATE student SET group_id = $1 WHERE id IN ($2, $3, $4)`, [g2, s4, s5, s6]);
        console.log(`  ✓ Group B (rank 4) : Sneha, Vikram, Anika [size 3]`);

        // Batch 2 groups
        // Group C: Rank 7 (leader), Rank 8 → size 2 → needs a 2-capacity room
        const g3 = (await client.query(`
            INSERT INTO housing_group (primary_applicant_id, status, group_rank, allocation_event_id)
            VALUES ($1, 'SOFT_LOCKED', 7, $2) RETURNING id
        `, [s7, eventId])).rows[0].id;
        await client.query(`UPDATE student SET group_id = $1 WHERE id IN ($2, $3)`, [g3, s7, s8]);
        console.log(`  ✓ Group C (rank 7) : Karan, Divya         [size 2]`);

        // Group D: Rank 9 (leader), Rank 10, Rank 11, Rank 12 → size 4 → needs 4-capacity room
        const g4 = (await client.query(`
            INSERT INTO housing_group (primary_applicant_id, status, group_rank, allocation_event_id)
            VALUES ($1, 'SOFT_LOCKED', 9, $2) RETURNING id
        `, [s9, eventId])).rows[0].id;
        await client.query(`UPDATE student SET group_id = $1 WHERE id IN ($2, $3, $4, $5)`, [g4, s9, s10, s11, s12]);
        console.log(`  ✓ Group D (rank 9) : Rahul, Meera, Suresh, Pooja [size 4]\n`);

        // ─── STEP 8: Create Batches ────────────────────────
        console.log('Step 8 ▸ Creating 2 batches (TEST_MODE timings)...');
        const now = new Date();

        // Batch 1: starts NOW (with a small past buffer so submissions are inside the window)
        // The scheduler will arm its timers based on the DB state on restart.
        const b1Start = new Date(now.getTime() - 5_000); // 5s in the past
        const b1End   = new Date(b1Start.getTime() + BATCH_DURATION_MS);
        const batch1Id = (await client.query(`
            INSERT INTO batch (allocation_event_id, batch_number, start_time, end_time, status)
            VALUES ($1, 1, $2, $3, 'PENDING') RETURNING id
        `, [eventId, b1Start.toISOString(), b1End.toISOString()])).rows[0].id;

        // Batch 2: starts right after batch 1 ends
        const b2Start = new Date(b1End.getTime() + 5_000); // 5s gap
        const b2End   = new Date(b2Start.getTime() + BATCH_DURATION_MS);
        const batch2Id = (await client.query(`
            INSERT INTO batch (allocation_event_id, batch_number, start_time, end_time, status)
            VALUES ($1, 2, $2, $3, 'PENDING') RETURNING id
        `, [eventId, b2Start.toISOString(), b2End.toISOString()])).rows[0].id;

        console.log(`  ✓ Batch 1 (id=${batch1Id.slice(0,8)}…) starts at ${b1Start.toLocaleTimeString('en-IN')}, ends at ${b1End.toLocaleTimeString('en-IN')}`);
        console.log(`  ✓ Batch 2 (id=${batch2Id.slice(0,8)}…) starts at ${b2Start.toLocaleTimeString('en-IN')}, ends at ${b2End.toLocaleTimeString('en-IN')}\n`);

        // ─── STEP 9: Assign Groups to Batches ─────────────
        console.log('Step 9 ▸ Assigning groups to batches...');
        // Groups A & B → Batch 1
        await client.query(`UPDATE housing_group SET batch_id = $1 WHERE id IN ($2, $3)`, [batch1Id, g1, g2]);
        // Groups C & D → Batch 2
        await client.query(`UPDATE housing_group SET batch_id = $1 WHERE id IN ($2, $3)`, [batch2Id, g3, g4]);
        console.log(`  ✓ Groups A & B → Batch 1`);
        console.log(`  ✓ Groups C & D → Batch 2\n`);

        // ─── STEP 10: Submit Preferences ──────────────────
        console.log('Step 10 ▸ Submitting preferences for all groups in Batch 1 (Round 1)...\n');

        // Temporarily disable the submission window trigger so we can
        // pre-seed preferences without needing the server to be live.
        // The trigger is re-enabled immediately after.
        await client.query(`ALTER TABLE allocation_submission DISABLE TRIGGER trigger_validate_submission_window`);

        // Helper: insert submission + preferences
        async function submitGroupPreferences(groupId, leaderId, batchId, prefs) {
            const subRes = await client.query(`
                INSERT INTO allocation_submission
                    (group_id, submitted_by, batch_id, round_number,
                     effective_group_rank, effective_leader_rank, effective_group_size, is_processed)
                VALUES ($1, $2, $3, 1,
                        (SELECT group_rank FROM housing_group WHERE id = $1),
                        (SELECT individual_rank FROM student WHERE id = $2),
                        (SELECT COUNT(*) FROM student WHERE group_id = $1),
                        false)
                RETURNING id
            `, [groupId, leaderId, batchId]);
            const subId = subRes.rows[0].id;

            for (let i = 0; i < prefs.length; i++) {
                await client.query(`
                    INSERT INTO submission_preference (submission_id, room_id, preference_order)
                    VALUES ($1, $2, $3)
                `, [subId, prefs[i], i + 1]);
            }
            return subId;
        }

        //
        // GROUP A (size 3): prefers 3-capacity rooms → NK 102-A(3), DH 101-A(3), NK 201-B(4)
        //
        await submitGroupPreferences(g1, s1, batch1Id, [NK_R2, DH_R1, NK_R4]);
        console.log(`  ✓ Group A prefs: NK-102(3cap) > DH-101(3cap) > NK-201(4cap)`);

        //
        // GROUP B (size 3): prefers   DH 101-A(3), NK 102-A(3), DH 201-B(4)
        //
        await submitGroupPreferences(g2, s4, batch1Id, [DH_R1, NK_R2, DH_R3]);
        console.log(`  ✓ Group B prefs: DH-101(3cap) > NK-102(3cap) > DH-201(4cap)\n`);

        console.log('Step 10b ▸ Submitting preferences for Batch 2 groups (Round 1)...\n');

        //
        // GROUP C (size 2): prefers NK 101-A(2), NK 103-A(2), DH 102-A(2)
        //
        await submitGroupPreferences(g3, s7, batch2Id, [NK_R1, NK_R3, DH_R2]);
        console.log(`  ✓ Group C prefs: NK-101(2cap) > NK-103(2cap) > DH-102(2cap)`);

        //
        // GROUP D (size 4): prefers NK 201-B(4), DH 201-B(4)
        //
        await submitGroupPreferences(g4, s9, batch2Id, [NK_R4, DH_R3]);
        console.log(`  ✓ Group D prefs: NK-201(4cap) > DH-201(4cap)\n`);

        await client.query(`ALTER TABLE allocation_submission ENABLE TRIGGER trigger_validate_submission_window`);
        console.log('  ✓ Submission window trigger re-enabled\n');

        await client.query('COMMIT');

        // ─── SUMMARY ──────────────────────────────────────
        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  ✅  Seed Complete!                                        ║');
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log(`║  Event ID  : ${eventId}  ║`);
        console.log(`║  Batch 1   : ${batch1Id}  ║`);
        console.log(`║  Batch 2   : ${batch2Id}  ║`);
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log('║  Students    : 12  (Himadri, year=2, CGPA 9.2–6.9)       ║');
        console.log('║  Groups      : 4   (A:3, B:3, C:2, D:4 students)         ║');
        console.log('║  Target rooms: 9   (5 Neelkanth + 4 Dhauladhar)          ║');
        console.log('║  Batches     : 2   (each 3 rounds × 10s in TEST_MODE)    ║');
        console.log('╠═══════════════════════════════════════════════════════════╣');
        console.log('║  ⏱  Batch 1 starts in ~3 seconds — start the server now! ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');

        console.log('  Start backend with:');
        console.log('    TEST_MODE=true node src/app.js\n');

        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('\n❌ Seed failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        client.release();
    }
}

seed();
