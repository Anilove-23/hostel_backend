import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './src/db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSqlFile() {
    try {
        console.log('Dropping public schema to ensure a clean slate...');
        await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;');

        const sqlFilePath = path.join(__dirname, 'src', 'db', 'newdb.sql');
        console.log(`Reading SQL file from: ${sqlFilePath}`);
        const sql = fs.readFileSync(sqlFilePath, 'utf8');

        console.log('Executing SQL...');
        await pool.query(sql);
        console.log('SQL executed successfully! Database is set up.');
    } catch (err) {
        console.error('Error executing SQL:', err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

runSqlFile();
