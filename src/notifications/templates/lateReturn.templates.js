function formatDateTime(value) {
    if (!value) return "Not recorded";
    return new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

// `outpass` shape expected: { name, roll_no, hostel, place_of_visit,
// departure_datetime, arrival_datetime, actual_arrival (optional) }
export function buildParentEmail(outpass) {
    const expected = formatDateTime(outpass.arrival_datetime);
    const actual = formatDateTime(outpass.actual_arrival);

    const subject = `Late Return Alert: ${outpass.name} (${outpass.roll_no})`;

    const text =
        `Dear Parent/Guardian,\n\n` +
        `This is to inform you that your ward, ${outpass.name} (Roll No: ${outpass.roll_no}), ` +
        `has not returned to ${outpass.hostel} hostel as per the scheduled outstation outpass.\n\n` +
        `Place of visit: ${outpass.place_of_visit || "N/A"}\n` +
        `Expected return: ${expected}\n` +
        `Actual return: ${actual}\n\n` +
        `Please reach out to your ward or the hostel administration if you have any concerns.\n\n` +
        `Regards,\nHostel Administration`;

    const html = `
        <p>Dear Parent/Guardian,</p>
        <p>This is to inform you that your ward, <strong>${outpass.name}</strong> (Roll No: ${outpass.roll_no}),
        has not returned to <strong>${outpass.hostel}</strong> hostel as per the scheduled outstation outpass.</p>
        <table cellpadding="4">
            <tr><td>Place of visit</td><td>${outpass.place_of_visit || "N/A"}</td></tr>
            <tr><td>Expected return</td><td>${expected}</td></tr>
            <tr><td>Actual return</td><td>${actual}</td></tr>
        </table>
        <p>Please reach out to your ward or the hostel administration if you have any concerns.</p>
        <p>Regards,<br/>Hostel Administration</p>
    `;

    return { subject, text, html };
}

export function buildChiefWardenEmail(outpass) {
    const expected = formatDateTime(outpass.arrival_datetime);
    const actual = formatDateTime(outpass.actual_arrival);

    const subject = `[Late Return] ${outpass.name} (${outpass.roll_no}) — ${outpass.hostel}`;

    const text =
        `Late outstation return flagged:\n\n` +
        `Student: ${outpass.name} (Roll No: ${outpass.roll_no})\n` +
        `Hostel: ${outpass.hostel}\n` +
        `Place of visit: ${outpass.place_of_visit || "N/A"}\n` +
        `Parent contact: ${outpass.parent_contact || "N/A"}\n` +
        `Expected return: ${expected}\n` +
        `Actual return: ${actual}\n` +
        `Outpass ID: ${outpass.id}`;

    const html = `
        <p><strong>Late outstation return flagged</strong></p>
        <table cellpadding="4">
            <tr><td>Student</td><td>${outpass.name} (${outpass.roll_no})</td></tr>
            <tr><td>Hostel</td><td>${outpass.hostel}</td></tr>
            <tr><td>Place of visit</td><td>${outpass.place_of_visit || "N/A"}</td></tr>
            <tr><td>Parent contact</td><td>${outpass.parent_contact || "N/A"}</td></tr>
            <tr><td>Expected return</td><td>${expected}</td></tr>
            <tr><td>Actual return</td><td>${actual}</td></tr>
            <tr><td>Outpass ID</td><td>${outpass.id}</td></tr>
        </table>
    `;

    return { subject, text, html };
}
