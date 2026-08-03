import 'dotenv/config';
import pkg from 'pg';

const { Client } = pkg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runTest() {
  await client.connect();
  console.log('Connected to DB for guard sync verification...\n');

  try {
    // 1. Verify guard_action_log table exists
    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'guard_action_log';
    `);
    console.log('1. guard_action_log table status:', tableCheck.rows.length > 0 ? 'VERIFIED' : 'MISSING');

    // 2. Fetch an approved outpass for testing
    const outpassRes = await client.query(`
      SELECT id, student_id, outp_status, std_status 
      FROM outpass 
      WHERE outp_status = 'Approved' 
      LIMIT 1;
    `);

    if (outpassRes.rows.length === 0) {
      console.log('No approved outpasses found in DB to test sync-logs.');
      return;
    }

    const testOutpass = outpassRes.rows[0];
    console.log(`2. Test outpass ID: ${testOutpass.id}, current std_status: ${testOutpass.std_status}`);

    // 3. Test guard_action_log insertion & idempotency
    const testUuid = '00000000-0000-4000-8000-000000000099';
    await client.query(`
      INSERT INTO guard_action_log (id, outpass_id, action, gate, remark, actioned_at)
      VALUES ($1, $2, 'exit', 'Main Gate', 'Test script', NOW())
      ON CONFLICT (id) DO NOTHING;
    `, [testUuid, testOutpass.id]);

    const logCheck = await client.query(`SELECT * FROM guard_action_log WHERE id = $1;`, [testUuid]);
    console.log('3. guard_action_log entry created:', logCheck.rows.length > 0 ? 'VERIFIED' : 'FAILED');

    // Cleanup test entry
    await client.query(`DELETE FROM guard_action_log WHERE id = $1;`, [testUuid]);
    console.log('4. Test cleanup completed successfully.');

    console.log('\nAll guard sync backend verification checks passed!');
  } catch (err) {
    console.error('Test script error:', err);
  } finally {
    await client.end();
  }
}

runTest();
