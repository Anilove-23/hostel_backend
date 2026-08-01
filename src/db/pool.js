import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// Supports DATABASE_URL (Railway/cloud) or individual DB_* vars
const pool = process.env.DATABASE_URL
    ? new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
      })
    : new Pool({
          user:     process.env.DB_USER,
          host:     process.env.DB_HOST,
          database: process.env.DB_NAME,
          password: process.env.DB_PASSWORD,
          port:     process.env.DB_PORT,
      });

// Attach an error handler to the pool.
// If an idle client in the pool experiences a network error, it will emit an 'error' event here.
// Without this handler, Node.js will treat it as an unhandled error and crash the entire process.
pool.on("error", (err) => {
    console.error("Unexpected error on idle PostgreSQL client:", err);
});

pool.connect()
    .then((client) => {
        console.log("PostgreSQL connected successfully");
        client.release();
    })
    .catch((err) => {
        console.error("Database connection error:", err);
    });

export default pool;