import 'dotenv/config';
import pkg from 'pg';

const { Client } = pkg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  await client.connect();
  console.log('Connected to Database. Running migration for guard_action_log...');

  try {
    // 1. Create guard_action_log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS guard_action_log (
          id            UUID PRIMARY KEY,
          outpass_id    INTEGER NOT NULL REFERENCES outpass(id) ON DELETE CASCADE,
          action        VARCHAR(10) NOT NULL CHECK (action IN ('exit', 'enter')),
          gate          VARCHAR(100) DEFAULT 'Main Gate',
          remark        TEXT,
          guard_id      INTEGER REFERENCES attendent(id) ON DELETE SET NULL,
          actioned_at   TIMESTAMP WITH TIME ZONE NOT NULL,
          received_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✓ Table guard_action_log created/verified.');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gal_outpass ON guard_action_log(outpass_id);
      CREATE INDEX IF NOT EXISTS idx_gal_received ON guard_action_log(received_at);
    `);
    console.log('✓ Indexes on guard_action_log created/verified.');

    // 2. Add entry_guard_id column to visit_log if missing
    await client.query(`
      ALTER TABLE visit_log 
      ADD COLUMN IF NOT EXISTS entry_guard_id INTEGER REFERENCES attendent(id) ON DELETE SET NULL;
    `);
    console.log('✓ Column entry_guard_id added/verified on visit_log.');

    console.log('\nMigration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
