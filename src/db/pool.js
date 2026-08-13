import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const RETRY_INTERVAL_MS = 30_000; // 30 seconds

// ──────────────────────────────────────────────────────────────────────────────
// Build pool config
// ──────────────────────────────────────────────────────────────────────────────
const isLocalhost =
    process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.includes("localhost") ||
        process.env.DATABASE_URL.includes("127.0.0.1"));

const poolConfig = process.env.DATABASE_URL
    ? {
          connectionString: process.env.DATABASE_URL,
          ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
      }
    : {
          user:     process.env.DB_USER,
          host:     process.env.DB_HOST,
          database: process.env.DB_NAME,
          password: process.env.DB_PASSWORD,
          port:     process.env.DB_PORT,
      };

const pool = new Pool(poolConfig);

// ──────────────────────────────────────────────────────────────────────────────
// Connection health checker with automatic retry
// ──────────────────────────────────────────────────────────────────────────────
let retryTimer = null;
let isConnected = false;

function scheduleRetry() {
    if (retryTimer) return; // already scheduled
    console.warn(
        `[DB] Connection lost. Retrying in ${RETRY_INTERVAL_MS / 1000}s…`
    );
    retryTimer = setTimeout(checkConnection, RETRY_INTERVAL_MS);
}

async function checkConnection() {
    retryTimer = null;
    let client;
    try {
        client = await pool.connect();
        if (!isConnected) {
            console.log("[DB] PostgreSQL reconnected successfully.");
            isConnected = true;
        }
        client.release();
    } catch (err) {
        isConnected = false;
        console.error("[DB] Reconnect attempt failed:", err.message);
        scheduleRetry();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Idle-client errors (e.g., server closed the connection while pool was idle)
// Without this handler Node.js would crash with an unhandled error event.
// ──────────────────────────────────────────────────────────────────────────────
pool.on("error", (err) => {
    console.error("[DB] Unexpected error on idle PostgreSQL client:", err.message);
    isConnected = false;
    scheduleRetry();
});

// ──────────────────────────────────────────────────────────────────────────────
// Initial connection attempt (retries on failure)
// ──────────────────────────────────────────────────────────────────────────────
checkConnection();

export default pool;