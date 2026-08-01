import { sendMail } from "../config/mailer.js";
import { buildParentEmail, buildChiefWardenEmail } from "../templates/lateReturn.templates.js";
import {
    getChiefWardenEmails,
    recordNotification,
} from "../repositories/lateReturn.repository.js";

// Sends the parent + chief-warden late-return emails for a single outpass and
// logs the attempt to `late_return_notification`. Never throws — a failed
// email must never break the caller's request/response cycle (check-in,
// scheduled scan, or the demo route).
//
// `outpass` must have: id, name, roll_no, hostel, place_of_visit,
// parent_contact, arrival_datetime, parent_email (nullable), actual_arrival.
// `options.triggerSource`: 'CHECK_IN' | 'SCHEDULED_SCAN' | 'TEST'
// `options.persist`: set false to skip the DB audit-log insert (used for
// pure dummy/synthetic demo data that has no real outpass row to reference).
export async function notifyLateReturn(outpass, options = {}) {
    const { triggerSource = "TEST", persist = true } = options;

    console.log(
        `[notifications] Late outstation return detected for ${outpass.name} (${outpass.roll_no}), source=${triggerSource}`
    );

    let parentEmailSent = false;
    let chiefWardenEmailSent = false;
    let chiefWardenEmails = [];
    let errorMessage = null;

    try {
        if (outpass.parent_email) {
            const parentContent = buildParentEmail(outpass);
            await sendMail({ to: outpass.parent_email, ...parentContent });
            parentEmailSent = true;
            console.log(`[notifications] Parent email sent to ${outpass.parent_email}`);
        } else {
            console.warn(
                `[notifications] No parent_email on file for ${outpass.name} (Roll No: ${outpass.roll_no}) — parent email skipped.`
            );
        }

        chiefWardenEmails = await getChiefWardenEmails();
        if (chiefWardenEmails.length > 0) {
            const chiefWardenContent = buildChiefWardenEmail(outpass);
            await sendMail({ to: chiefWardenEmails.join(","), ...chiefWardenContent });
            chiefWardenEmailSent = true;
            console.log(`[notifications] Chief warden email sent to ${chiefWardenEmails.join(", ")}`);
        } else {
            console.warn("[notifications] No chief-warden (authority_level=3) admin found — skipped.");
        }
    } catch (err) {
        errorMessage = err.message;
        console.error("[notifications] Failed to send late-return email(s):", err.message);
    }

    if (persist && outpass.id) {
        try {
            await recordNotification({
                outpassId: outpass.id,
                triggerSource,
                parentEmailTo: outpass.parent_email,
                parentEmailSent,
                chiefWardenEmailsTo: chiefWardenEmails.join(","),
                chiefWardenEmailSent,
                errorMessage,
            });
        } catch (err) {
            console.error("[notifications] Failed to record notification log:", err.message);
        }
    }

    return { parentEmailSent, chiefWardenEmailSent, chiefWardenEmails, errorMessage };
}

// Convenience check used at the check-in hook: only notify if this was an
// Outstation outpass and the student actually returned after the declared
// arrival_datetime.
export function isLateOutstationReturn(outpass, actualArrival) {
    return Boolean(
        outpass.outpass_type === "Outstation" &&
            outpass.arrival_datetime &&
            actualArrival &&
            new Date(actualArrival) > new Date(outpass.arrival_datetime)
    );
}
