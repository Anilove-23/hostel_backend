/**
 * assign-warden-hostel.js
 * ============================================================
 * Safely assigns an authority_level + hostel to an existing `admin`
 * table row, for the Room Management RBAC model:
 *   1 = View only (read-only across all hostels)
 *   2 = Warden     (full CRUD, scoped to their own hostel)
 *   3 = Other admin (full CRUD across all hostels)
 *
 * Does NOT alter the schema, does NOT create accounts, and never
 * writes anything unless --confirm is passed. Always prints a
 * dry-run diff first.
 *
 * Usage:
 *   node scripts/assign-warden-hostel.js --email=<admin-email> --level=<1|2|3> [--hostel="<hostel name>"] [--confirm]
 *
 * --hostel is required for level 2, ignored (cleared) for levels 1/3.
 * ============================================================
 */

import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

function parseArgs(argv) {
    const args = {};
    for (const raw of argv.slice(2)) {
        const match = raw.match(/^--([^=]+)=(.*)$/);
        if (match) {
            args[match[1]] = match[2];
        } else if (raw.startsWith('--')) {
            args[raw.slice(2)] = true;
        }
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv);
    const { email, level, hostel, confirm } = args;

    if (!email || !level) {
        console.error('Usage: node scripts/assign-warden-hostel.js --email=<email> --level=<1|2|3> [--hostel="<name>"] [--confirm]');
        process.exit(1);
    }

    const authorityLevel = Number(level);
    if (![1, 2, 3].includes(authorityLevel)) {
        console.error(`Invalid --level "${level}" — must be 1, 2, or 3.`);
        process.exit(1);
    }

    if (authorityLevel === 2 && !hostel) {
        console.error('--hostel is required when --level=2 (Warden must be scoped to a hostel).');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });

    await client.connect();

    try {
        const adminResult = await client.query(
            'SELECT id, name, email, authority_level, hostel FROM admin WHERE email = $1',
            [email]
        );
        const admin = adminResult.rows[0];

        if (!admin) {
            console.error(`No admin row found for email "${email}". This script only assigns roles to existing accounts.`);
            process.exit(1);
        }

        let hostelName = null;
        if (authorityLevel === 2) {
            const hostelResult = await client.query('SELECT id, name FROM hostel WHERE name = $1', [hostel]);
            if (hostelResult.rows.length === 0) {
                console.error(`No hostel found named "${hostel}". Check the exact name in the hostel table.`);
                process.exit(1);
            }
            hostelName = hostelResult.rows[0].name;
        }

        console.log('--- Dry run ---');
        console.log(`Admin:            ${admin.name} <${admin.email}> (id=${admin.id})`);
        console.log(`Current level:    ${admin.authority_level ?? '(none)'}`);
        console.log(`Current hostel:   ${admin.hostel ?? '(none)'}`);
        console.log(`New level:        ${authorityLevel}`);
        console.log(`New hostel:       ${hostelName ?? '(none — level 1/3 is not hostel-scoped)'}`);

        if (!confirm) {
            console.log('\nNo changes written. Re-run with --confirm to apply.');
            return;
        }

        await client.query(
            'UPDATE admin SET authority_level = $1, hostel = $2 WHERE id = $3',
            [authorityLevel, hostelName, admin.id]
        );
        console.log('\nUpdated successfully.');
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
