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
  console.log('Connected to Database. Running migration for notification system...');

  try {
    // 1. Add parent_email to student (nullable — existing rows/flows are unaffected)
    await client.query(`
      ALTER TABLE student
      ADD COLUMN IF NOT EXISTS parent_email VARCHAR(255);
    `);
    console.log('✓ Column parent_email added/verified on student.');

    // 2. Audit trail for late-return notifications + dedup guard for the
    //    scheduled overdue scan (so the same still-out outpass isn't re-emailed
    //    on every scan interval).
    await client.query(`
      CREATE TABLE IF NOT EXISTS late_return_notification (
          id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          outpass_id              INTEGER NOT NULL REFERENCES outpass(id) ON DELETE CASCADE,
          trigger_source          VARCHAR(20) NOT NULL CHECK (trigger_source IN ('CHECK_IN', 'SCHEDULED_SCAN', 'TEST')),
          parent_email_to         VARCHAR(255),
          parent_email_sent       BOOLEAN DEFAULT FALSE,
          chief_warden_emails_to  TEXT,
          chief_warden_email_sent BOOLEAN DEFAULT FALSE,
          error_message           TEXT,
          created_at              TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Table late_return_notification created/verified.');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lrn_outpass ON late_return_notification(outpass_id);
      CREATE INDEX IF NOT EXISTS idx_lrn_source ON late_return_notification(trigger_source);
    `);
    console.log('✓ Indexes on late_return_notification created/verified.');

    console.log('\nMigration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();
