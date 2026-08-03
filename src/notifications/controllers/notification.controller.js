import asyncHandler from "../../utils/asyncHandler.js";
import ApiError from "../../utils/apiError.js";
import ApiResponse from "../../utils/apiResponse.js";
import { getOutpassWithStudentById } from "../repositories/lateReturn.repository.js";
import { notifyLateReturn } from "../services/lateReturn.service.js";

// Demo/testing endpoint for presenting the late-return notification feature.
// Does NOT touch the real outpass/visit_log flow — it only ever *reads* an
// existing outpass (if outpassId is given) or fabricates fully synthetic data.
//
// POST /api/notifications/demo/late-return
// Body (all optional):
//   {
//     "outpassId": 123,              // use a real outpass+student row from the DB
//     "parentEmail": "test@x.com",   // override recipient for the demo
//   }
// If outpassId is omitted, a dummy in-memory "student" is used so this works
// even on a fresh/empty database.
const testLateReturnNotification = asyncHandler(async (req, res) => {
    const { outpassId, parentEmail } = req.body || {};

    let outpass;
    let persist = true;

    if (outpassId) {
        outpass = await getOutpassWithStudentById(outpassId);
        if (!outpass) {
            throw new ApiError(404, `Outpass ${outpassId} not found`);
        }
    } else {
        // Fully synthetic demo data — no DB row, so nothing is persisted.
        persist = false;
        const now = new Date();
        const expected = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h ago
        outpass = {
            id: null,
            name: "Demo Student",
            roll_no: "BCS0000",
            hostel: "Demo Hostel",
            place_of_visit: "Demo City",
            parent_contact: "9999999999",
            outpass_type: "Outstation",
            arrival_datetime: expected,
            actual_arrival: now,
            parent_email: null,
        };
    }

    if (parentEmail) {
        outpass.parent_email = parentEmail;
    }
    if (!outpass.actual_arrival) {
        outpass.actual_arrival = new Date();
    }

    const result = await notifyLateReturn(outpass, {
        triggerSource: "TEST",
        persist,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                outpassUsed: outpass.id ? { id: outpass.id, roll_no: outpass.roll_no } : "dummy (synthetic data)",
                parentEmailSent: result.parentEmailSent,
                parentEmailTo: outpass.parent_email || null,
                chiefWardenEmailSent: result.chiefWardenEmailSent,
                chiefWardenEmailsTo: result.chiefWardenEmails,
                error: result.errorMessage,
            },
            "Late-return demo notification triggered — check server console / mailbox."
        )
    );
});

export { testLateReturnNotification };
