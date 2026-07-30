import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const loggingSchemaSql = `
-- =========================================================
-- 0. CLEANUP (For repeatable script execution)
-- =========================================================
DROP TABLE IF EXISTS admin_audit_log CASCADE;
DROP TABLE IF EXISTS student_activity_log CASCADE;
DROP TABLE IF EXISTS user_session CASCADE;
DROP TABLE IF EXISTS auth_log CASCADE;

DROP TYPE IF EXISTS auth_actor_enum CASCADE;
DROP TYPE IF EXISTS auth_action_enum CASCADE;
DROP TYPE IF EXISTS student_action_enum CASCADE;
DROP TYPE IF EXISTS admin_role_enum CASCADE;
DROP TYPE IF EXISTS audit_action_enum CASCADE;

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================
-- 1. ENUM TYPES FOR LOGGING
-- =========================================================
CREATE TYPE auth_actor_enum AS ENUM (
    'STUDENT',
    'ADMIN',
    'ATTENDENT',
    'GUARD'
);

CREATE TYPE auth_action_enum AS ENUM (
    'SIGN_IN',
    'SIGN_UP',
    'SIGN_OUT'
);

CREATE TYPE student_action_enum AS ENUM (
    'COMPLAINT_CREATED',
    'OUTPASS_CREATED',
    'OUTPASS_CANCELLED',
    'OUTPASS_APPROVED',
    'OUTPASS_REJECTED',
    'CAMPUS_EXIT',
    'CAMPUS_ENTRY'
);

CREATE TYPE admin_role_enum AS ENUM (
    'ATTENDENT',
    'WARDEN',
    'CHIEF_WARDEN',
    'SYSTEM_ADMIN'
);

CREATE TYPE audit_action_enum AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE'
);

-- =========================================================
-- 2. AUTHENTICATION LOGS
-- =========================================================
CREATE TABLE auth_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id INTEGER NOT NULL,
    actor_type auth_actor_enum NOT NULL,
    action auth_action_enum NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_actor ON auth_log(actor_type, actor_id);
CREATE INDEX idx_auth_action ON auth_log(action);
CREATE INDEX idx_auth_success ON auth_log(success);
CREATE INDEX idx_auth_created ON auth_log(created_at);

-- =========================================================
-- 3. USER SESSION LOG
-- =========================================================
CREATE TABLE user_session (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id INTEGER NOT NULL,
    actor_type auth_actor_enum NOT NULL,
    login_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logout_time TIMESTAMP WITH TIME ZONE,
    ip_address INET,
    user_agent TEXT,
    refresh_token_id UUID
);

CREATE INDEX idx_session_actor ON user_session(actor_type, actor_id);
CREATE INDEX idx_session_login ON user_session(login_time);
CREATE INDEX idx_session_logout ON user_session(logout_time);

-- =========================================================
-- 4. STUDENT ACTIVITY LOG
-- =========================================================
CREATE TABLE student_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    action student_action_enum NOT NULL,
    entity_id INTEGER,
    entity_type VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_student_activity_student ON student_activity_log(student_id);
CREATE INDEX idx_student_activity_action ON student_activity_log(action);
CREATE INDEX idx_student_activity_entity ON student_activity_log(entity_type, entity_id);
CREATE INDEX idx_student_activity_created ON student_activity_log(created_at);
CREATE INDEX idx_student_activity_metadata ON student_activity_log USING GIN(metadata);

-- =========================================================
-- 5. ADMIN / STAFF AUDIT LOG
-- =========================================================
CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    staff_id INTEGER NOT NULL,
    actor_role admin_role_enum NOT NULL,
    action audit_action_enum NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_staff ON admin_audit_log(staff_id, actor_role);
CREATE INDEX idx_admin_table_record ON admin_audit_log(table_name, record_id);
CREATE INDEX idx_admin_created ON admin_audit_log(created_at);
CREATE INDEX idx_admin_new_values ON admin_audit_log USING GIN(new_values);
CREATE INDEX idx_admin_old_values ON admin_audit_log USING GIN(old_values);
`;

async function main() {
  try {
    await client.connect();
    console.log('Connected to the database. Applying logging schema...');

    // Wrap the entire execution in a transaction
    await client.query('BEGIN');
    
    await client.query(loggingSchemaSql);
    
    await client.query('COMMIT');
    console.log('Logging schema successfully applied!');

  } catch (error) {
    // If anything fails, rollback all changes so the database isn't left in a corrupted state
    await client.query('ROLLBACK');
    console.error('Migration failed. Transaction rolled back.', error);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

main();