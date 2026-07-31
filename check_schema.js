import pool from './src/db/pool.js';
async function test() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'visit_log'
  `);
  console.log(res.rows);
  const comp = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'complaint'
  `);
  console.log(comp.rows);
  process.exit();
}
test();
