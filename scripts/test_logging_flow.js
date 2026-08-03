import 'dotenv/config';
import pkg from 'pg';
import { 
    logStudentActivity, 
    StudentAction, 
    logAdminAudit, 
    AuditAction, 
    AdminRole 
} from '../src/logging/index.js';

const { Client } = pkg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  await client.connect();
  console.log('Connected to DB. Starting simulation...\n');

  try {
    // 1. Fetch random users for simulation
    const studentRes = await client.query('SELECT id, name FROM student LIMIT 1');
    const student = studentRes.rows[0];
    
    const attendantRes = await client.query('SELECT id FROM attendent LIMIT 1');
    const attendantId = attendantRes.rows[0]?.id;

    const adminRes = await client.query('SELECT id FROM admin LIMIT 1');
    const adminId = adminRes.rows[0]?.id;

    if (!student || !attendantId || !adminId) {
        throw new Error("Missing test data in DB (need at least 1 student, 1 attendant, 1 admin).");
    }

    console.log(`Using Student ID: ${student.id} (${student.name})`);
    console.log(`Using Attendant ID: ${attendantId}`);
    console.log(`Using Admin ID: ${adminId}\n`);

    // ==================================================
    // SIMULATE ADMIN DATABASE CHANGES (ALL TYPES)
    // ==================================================
    console.log('--- Simulating Admin Database Changes (CREATE, UPDATE, DELETE) ---');
    const hostelRes = await client.query('SELECT id, name FROM hostel LIMIT 1');
    const hostel = hostelRes.rows[0];

    // 1. CREATE Audit
    logAdminAudit({
        staffId: adminId,
        actorRole: AdminRole.SYSTEM_ADMIN,
        action: AuditAction.CREATE,
        tableName: 'hostel',
        recordId: hostel.id,
        newValues: { name: hostel.name },
        reason: 'Bot Admin testing CREATE log'
    });

    // 2. UPDATE Audit
    logAdminAudit({
        staffId: adminId,
        actorRole: AdminRole.SYSTEM_ADMIN,
        action: AuditAction.UPDATE,
        tableName: 'hostel',
        recordId: hostel.id,
        oldValues: { name: hostel.name },
        newValues: { name: hostel.name + ' (Updated)' },
        reason: 'Bot Admin testing UPDATE log'
    });

    // 3. DELETE Audit
    logAdminAudit({
        staffId: adminId,
        actorRole: AdminRole.SYSTEM_ADMIN,
        action: AuditAction.DELETE,
        tableName: 'hostel',
        recordId: hostel.id,
        oldValues: { name: hostel.name },
        reason: 'Bot Admin testing DELETE log'
    });
    console.log('All Admin changes (CREATE, UPDATE, DELETE) simulated and logged.');

    // ==================================================
    // SIMULATE ALL STUDENT OUTPASS ACTIONS
    // ==================================================
    console.log('\n--- Simulating Student Outpass Lifecycle ---');
    const outpassInsert = await client.query(`
        INSERT INTO outpass (student_id, outpass_type, place_of_visit, purpose, parent_contact)
        VALUES ($1, 'Local', 'Market', 'Shopping', '9876543210')
        RETURNING id, outpass_type, place_of_visit
    `, [student.id]);
    const outpass = outpassInsert.rows[0];

    // CREATED
    logStudentActivity({
        studentId: student.id,
        action: StudentAction.OUTPASS_CREATED,
        entityId: outpass.id,
        entityType: 'outpass',
        metadata: { outpass_type: outpass.outpass_type }
    });
    
    // APPROVED
    await client.query(`UPDATE outpass SET outp_status = 'Approved', approved_by = $1 WHERE id = $2`, [attendantId, outpass.id]);
    logStudentActivity({
        studentId: student.id,
        action: StudentAction.OUTPASS_APPROVED,
        entityId: outpass.id,
        entityType: 'outpass',
        metadata: { approved_by: attendantId }
    });

    // EXIT
    logStudentActivity({
        studentId: student.id,
        action: StudentAction.CAMPUS_EXIT,
        entityId: outpass.id,
        entityType: 'outpass',
        metadata: { gate: 'Main Gate' }
    });

    // ENTRY
    logStudentActivity({
        studentId: student.id,
        action: StudentAction.CAMPUS_ENTRY,
        entityId: outpass.id,
        entityType: 'outpass',
        metadata: { gate: 'Main Gate' }
    });

    // We need a second outpass for rejection and cancellation
    const outpassInsert2 = await client.query(`
        INSERT INTO outpass (student_id, outpass_type, place_of_visit, purpose, parent_contact)
        VALUES ($1, 'Local', 'Hospital', 'Medical', '9876543210')
        RETURNING id, outpass_type, place_of_visit
    `, [student.id]);
    const outpass2 = outpassInsert2.rows[0];

    // REJECTED
    await client.query(`UPDATE outpass SET outp_status = 'Rejected', is_active = false WHERE id = $1`, [outpass2.id]);
    logStudentActivity({
        studentId: student.id,
        action: StudentAction.OUTPASS_REJECTED,
        entityId: outpass2.id,
        entityType: 'outpass',
        metadata: { rejected_by: attendantId, reason: 'Too late' }
    });

    // CANCELLED (Using a 3rd outpass to keep logical sequence)
    const outpassInsert3 = await client.query(`
        INSERT INTO outpass (student_id, outpass_type, place_of_visit, purpose, parent_contact)
        VALUES ($1, 'Local', 'Mall', 'Movie', '9876543210')
        RETURNING id, outpass_type, place_of_visit
    `, [student.id]);
    const outpass3 = outpassInsert3.rows[0];
    
    // DB doesn't have 'Cancelled' in its check constraint by default, so we just log the activity to test the logger
    logStudentActivity({
        studentId: student.id,
        action: StudentAction.OUTPASS_CANCELLED,
        entityId: outpass3.id,
        entityType: 'outpass',
        metadata: { cancelled_by_student: true }
    });

    console.log('Outpass CREATED, APPROVED, REJECTED, CANCELLED, EXIT, and ENTRY logged.');

    // ==================================================
    // SIMULATE STUDENT COMPLAINT CREATION
    // ==================================================
    console.log('\n--- Simulating Student Complaint Creation ---');
    const complaintInsert = await client.query(`
        INSERT INTO complaint (student_id, title, type, description, hostel)
        VALUES ($1, 'Test Complaint', 'Maintenance', 'Testing the logging system', $2)
        RETURNING id, title, type
    `, [student.id, hostel.name]);
    const complaint = complaintInsert.rows[0];

    logStudentActivity({
        studentId: student.id,
        action: StudentAction.COMPLAINT_CREATED,
        entityId: complaint.id,
        entityType: 'complaint',
        metadata: {
            title: complaint.title,
            type: complaint.type
        }
    });
    console.log(`Complaint created with ID: ${complaint.id}`);

    // Give logs a tiny bit of time to insert since they are async/fire-and-forget
    await sleep(1500);

    // ==================================================
    // VERIFY LOGS
    // ==================================================
    console.log('\n==================================================');
    console.log('VERIFYING LOGS IN DATABASE');
    console.log('==================================================');

    const adminLogs = await client.query(`
        SELECT action, table_name, reason 
        FROM admin_audit_log 
        WHERE staff_id = $1 
        ORDER BY created_at DESC LIMIT 3
    `, [adminId]);
    
    console.log('\n[Admin Audit Log Check]');
    console.table(adminLogs.rows);

    const studentLogs = await client.query(`
        SELECT action, entity_type, metadata 
        FROM student_activity_log 
        WHERE student_id = $1 
        ORDER BY created_at DESC LIMIT 8
    `, [student.id]);

    console.log('\n[Student Activity Log Check]');
    console.table(studentLogs.rows);

    // Cleanup generated data so we don't clutter the DB
    await client.query('DELETE FROM outpass WHERE id IN ($1, $2, $3)', [outpass.id, outpass2.id, outpass3.id]);
    await client.query('DELETE FROM complaint WHERE id = $1', [complaint.id]);

    console.log('\nSimulation completed successfully.');

  } catch (error) {
    console.error('Test script failed:', error);
  } finally {
    await client.end();
  }
}

runTests();
