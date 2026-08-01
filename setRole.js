import pool from './src/db/pool.js';

const getHostelId = async () => {
  try {
    const { rows } = await pool.query("SELECT id, name FROM hostel WHERE name = 'Ambika Girls Hostel'");
    console.log("👇 AMBIKA GIRLS HOSTEL KA NAYA ID YE HAI 👇");
    console.log(rows[0].id);
  } catch (error) {
    console.error(error);
  } finally {
    process.exit();
  }
};

getHostelId();