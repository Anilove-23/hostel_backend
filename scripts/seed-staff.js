import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../src/db/pool.js';

const DEFAULT_PASSWORD = '1234';

async function seedStaff() {
    console.log('Seeding staff (admins, wardens, attendants, guards)...');
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Get hostels
        const res = await client.query('SELECT id, name FROM hostel');
        const hostels = res.rows;
        
        if (hostels.length === 0) {
            throw new Error('No hostels found in database. Please run seed-hostels.js first.');
        }

        // 1. Seed Chief Warden (Admin level 3)
        await client.query(`
            INSERT INTO admin (email, password_hash, name, authority_level)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email) DO NOTHING
        `, ['chiefwarden@nith.ac.in', hashedPassword, 'Chief Warden User', 3]);
        console.log('Seeded Chief Warden (chiefwarden@nith.ac.in).');

        // 2. Seed Wardens (Admin level 2) for each hostel
        for (let i = 0; i < hostels.length; i++) {
            const hostel = hostels[i].name;
            const email = `warden.${hostel.toLowerCase().split(' ')[0]}@nith.ac.in`;
            await client.query(`
                INSERT INTO admin (email, password_hash, name, authority_level, hostel)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO NOTHING
            `, [email, hashedPassword, `Warden ${hostel}`, 2, hostel]);
        }
        console.log(`Seeded Wardens for ${hostels.length} hostels.`);

        // 3. Seed Attendants (one per hostel)
        for (let i = 0; i < hostels.length; i++) {
            const hostel = hostels[i];
            const email = `attendant.${hostel.name.toLowerCase().split(' ')[0]}@nith.ac.in`;
            await client.query(`
                INSERT INTO attendent (email, name, phone, password, hostel, hostel_id, approved_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (email) DO NOTHING
            `, [email, `Attendant ${hostel.name}`, `888888888${i}`, hashedPassword, hostel.name, hostel.id, true]);
        }
        console.log(`Seeded Attendants for ${hostels.length} hostels.`);

        // 4. Seed Guards (Only 2 global guards exist: guard1 and guard2)
        const guardEmails = ['guard1@nith.ac.in', 'guard2@nith.ac.in'];
        for (let i = 0; i < guardEmails.length; i++) {
            await client.query(`
                INSERT INTO guard (email, name, phone, password, approved_by)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO NOTHING
            `, [guardEmails[i], `Guard ${i+1}`, `777777777${i}`, hashedPassword, true]);
        }
        console.log(`Seeded ${guardEmails.length} Guards.`);

        await client.query('COMMIT');
        console.log('Successfully seeded all staff.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error seeding staff:', error);
    } finally {
        client.release();
        // Since pool is imported and handles its own connections, 
        // we can just exit instead of ending the global pool which might be used elsewhere
        process.exit(0);
    }
}

seedStaff();
