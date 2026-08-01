import pool from "../../db/pool.js";

export async function getOutpassWithStudentById(outpassId) {
    const result = await pool.query(
        `SELECT o.*, s.name, s.roll_no, s.hostel, s.parent_email
         FROM outpass o
         JOIN student s ON s.id = o.student_id
         WHERE o.id = $1
         LIMIT 1`,
        [outpassId]
    );
    return result.rows[0] || null;
}

// Outstation outpasses still marked 'Out' whose declared return time has
// already passed, and that haven't already been flagged by the scheduled scan.
export async function getOverdueOutstationOutpasses() {
    const result = await pool.query(
        `SELECT o.*, s.name, s.roll_no, s.hostel, s.parent_email
         FROM outpass o
         JOIN student s ON s.id = o.student_id
         WHERE o.outpass_type = 'Outstation'
           AND o.std_status = 'Out'
           AND o.arrival_datetime IS NOT NULL
           AND o.arrival_datetime < NOW()
           AND NOT EXISTS (
               SELECT 1 FROM late_return_notification lrn
               WHERE lrn.outpass_id = o.id
                 AND lrn.trigger_source = 'SCHEDULED_SCAN'
           )`
    );
    return result.rows;
}

export async function getChiefWardenEmails() {
    const result = await pool.query(
        `SELECT email FROM admin WHERE authority_level = 3`
    );
    return result.rows.map((row) => row.email).filter(Boolean);
}

export async function recordNotification({
    outpassId,
    triggerSource,
    parentEmailTo,
    parentEmailSent,
    chiefWardenEmailsTo,
    chiefWardenEmailSent,
    errorMessage,
}) {
    await pool.query(
        `INSERT INTO late_return_notification
            (outpass_id, trigger_source, parent_email_to, parent_email_sent,
             chief_warden_emails_to, chief_warden_email_sent, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            outpassId,
            triggerSource,
            parentEmailTo || null,
            Boolean(parentEmailSent),
            chiefWardenEmailsTo || null,
            Boolean(chiefWardenEmailSent),
            errorMessage || null,
        ]
    );
}
