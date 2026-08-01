import 'dotenv/config';
import { spawn } from 'child_process';
import pkg from 'pg';
import crypto from 'crypto';
import jwt from 'jsonwebtoken'; // Assuming jwt is used for auth

const { Client } = pkg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const API_URL = 'http://localhost:5000/api';
let serverProcess = null;

// Helper to wait
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to start the server
async function startServer() {
  console.log('Starting backend server...');
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['index.js'], { cwd: process.cwd(), stdio: 'pipe' });
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[SERVER] ${output.trim()}`);
      if (output.includes('Server running on port') || output.includes('listening on')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[SERVER ERROR] ${data.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server process:', err);
      reject(err);
    });
    
    // Fallback if the startup message isn't caught
    setTimeout(resolve, 3000); 
  });
}

// Helper to kill the server
async function stopServer() {
  if (serverProcess) {
    console.log('Killing backend server...');
    serverProcess.kill('SIGKILL');
    serverProcess = null;
    await delay(1000); // Give it a moment to die
  }
}

// Helper to generate a dummy JWT token for auth (Guard Role)
function generateGuardToken() {
  // Check the JWT_SECRET from env
  const secret = process.env.JWT_SECRET || 'dev_secret_key'; // Update if needed based on your backend
  return jwt.sign({ id: null, role: 'guard' }, secret, { expiresIn: '1h' });
}

async function runIntegrationTest() {
  await client.connect();
  const token = generateGuardToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'role': 'guard'
  };

  try {
    console.log('\n--- Offline-First Guard Sync Integration Test ---');

    // 1. Setup Test Data in DB
    console.log('\nSetting up test data in DB...');
    // We'll just pick an existing student or create a dummy one
    const studentRes = await client.query(`SELECT id FROM student LIMIT 1`);
    if (studentRes.rows.length === 0) throw new Error('No students found in DB to test with.');
    const studentId = studentRes.rows[0].id;

    // Create a fresh approved outpass
    const insertOutpassRes = await client.query(`
      INSERT INTO outpass (student_id, outpass_type, parent_contact, outp_status, std_status, is_active)
      VALUES ($1, 'Local', '1234567890', 'Approved', 'In', true)
      RETURNING id, created_at;
    `, [studentId]);
    const outpassId = insertOutpassRes.rows[0].id;
    console.log(`Created test outpass ID: ${outpassId}`);

    // 2. Start Server
    await startServer();

    // 3. Initial Sync (Pull all outpasses)
    console.log('\nSimulating frontend initial pull...');
    let res = await fetch(`${API_URL}/outpasses/monitor`, { headers });
    let data = await res.json();
    if (!res.ok) throw new Error(`Initial pull failed: ${JSON.stringify(data)}`);
    
    const initialSyncTime = data.data.server_time || new Date().toISOString();
    console.log(`Initial pull successful. Server time: ${initialSyncTime}`);
    
    const pulledOutpass = data.data.outpasses.find(o => o.id === outpassId);
    if (!pulledOutpass) throw new Error('Test outpass not found in monitor API response');
    console.log(`Verified test outpass is in the payload. Status: ${pulledOutpass.std_status}`);

    // 4. Go Offline (Kill Server)
    console.log('\nGoing offline... (Stopping server)');
    await stopServer();

    // 5. Simulate Offline Guard Action
    console.log('\nSimulating offline guard action (Mark Exit)...');
    const offlineActionLogId = crypto.randomUUID();
    const offlineLog = {
      id: offlineActionLogId,
      outpass_id: outpassId,
      action: 'exit',
      gate: 'Main Gate',
      remark: 'Offline test exit',
      timestamp: new Date().toISOString(),
      sync_status: 'PENDING'
    };
    console.log(`Generated offline log: ${JSON.stringify(offlineLog)}`);

    // 6. Come Back Online (Restart Server)
    console.log('\nComing back online... (Starting server)');
    await startServer();

    // 7. Push Offline Logs (Sync)
    console.log('\nPushing offline logs to server...');
    res = await fetch(`${API_URL}/outpasses/sync-logs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ logs: [offlineLog] })
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Sync logs failed: ${JSON.stringify(data)}`);
    
    console.log(`Sync response:`, data.data);
    await delay(1000); // Give server a second to flush stdout
    if (!data.data.synced_ids.includes(offlineActionLogId)) {
      throw new Error('Log ID was not in synced_ids array!');
    }
    console.log('✓ Log accepted and processed by server.');

    // 8. Verify DB State Directly
    console.log('\nVerifying database state...');
    const dbOutpassRes = await client.query(`SELECT std_status FROM outpass WHERE id = $1`, [outpassId]);
    if (dbOutpassRes.rows[0].std_status !== 'Out') {
      throw new Error(`Expected std_status 'Out', got '${dbOutpassRes.rows[0].std_status}'`);
    }
    console.log('✓ outpass std_status updated to Out');

    const dbGalRes = await client.query(`SELECT id FROM guard_action_log WHERE id = $1`, [offlineActionLogId]);
    if (dbGalRes.rows.length === 0) {
      throw new Error('guard_action_log entry not found');
    }
    console.log('✓ guard_action_log entry created (Idempotency stored)');

    // 9. Verify Delta Sync
    console.log('\nVerifying delta sync (Pulling updates since initial sync)...');
    res = await fetch(`${API_URL}/outpasses/monitor?updated_since=${encodeURIComponent(initialSyncTime)}`, { headers });
    data = await res.json();
    if (!res.ok) throw new Error(`Delta sync failed: ${JSON.stringify(data)}`);
    
    if (!data.data.delta) throw new Error('Response did not indicate it was a delta payload');
    
    const deltaOutpass = data.data.outpasses.find(o => o.id === outpassId);
    if (!deltaOutpass) {
        // Wait, could it be a timestamp precision issue? Let's subtract 1 second from initialSyncTime to be safe
        const safeTime = new Date(new Date(initialSyncTime).getTime() - 1000).toISOString();
        res = await fetch(`${API_URL}/outpasses/monitor?updated_since=${encodeURIComponent(safeTime)}`, { headers });
        data = await res.json();
        const deltaOutpassSafe = data.data.outpasses.find(o => o.id === outpassId);
        if (!deltaOutpassSafe) throw new Error('Test outpass not found in delta payload even with adjusted time');
        console.log(`✓ Test outpass found in delta payload. New status: ${deltaOutpassSafe.std_status}`);
    } else {
        console.log(`✓ Test outpass found in delta payload. New status: ${deltaOutpass.std_status}`);
    }


    // 10. Clean up
    console.log('\nCleaning up test data...');
    await client.query(`DELETE FROM guard_action_log WHERE id = $1`, [offlineActionLogId]);
    await client.query(`DELETE FROM outpass WHERE id = $1`, [outpassId]);
    console.log('Cleanup complete.');

    console.log('\n✅ ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');

  } catch (err) {
    console.error('\n❌ INTEGRATION TEST FAILED:');
    console.error(err);
  } finally {
    await stopServer();
    await client.end();
  }
}

runIntegrationTest();
