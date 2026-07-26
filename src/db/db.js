import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client (legacy db.js pool):', err);
});

pool
  .connect()
  .then((client) => {
    console.log('Successfully connected to the database.');
    client.release();
  })
  .catch((error) => {
    console.error('Database connection failed:', error.message);
  });

export default pool;