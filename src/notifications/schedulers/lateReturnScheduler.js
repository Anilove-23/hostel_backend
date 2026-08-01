import { getOverdueOutstationOutpasses } from "../repositories/lateReturn.repository.js";
import { notifyLateReturn } from "../services/lateReturn.service.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalHandle = null;

async function scanOnce() {
    let overdue = [];
    try {
        overdue = await getOverdueOutstationOutpasses();
    } catch (err) {
        console.error("[notifications] Overdue-scan query failed:", err.message);
        return;
    }

    if (overdue.length === 0) return;

    console.log(`[notifications] Scheduled scan found ${overdue.length} overdue outstation outpass(es).`);

    for (const outpass of overdue) {
        await notifyLateReturn(outpass, { triggerSource: "SCHEDULED_SCAN" });
    }
}

// Starts the periodic overdue-outstation scan. Purely additive: runs
// independently of the existing room-allocation schedulers and the outpass
// check-in flow, and never throws out of the interval callback.
export function startLateReturnScheduler(intervalMs = DEFAULT_INTERVAL_MS) {
    if (intervalHandle) return; // already running

    intervalHandle = setInterval(() => {
        scanOnce().catch((err) =>
            console.error("[notifications] Unexpected error in late-return scan:", err.message)
        );
    }, intervalMs);

    console.log(`[notifications] Late-return scheduler started (every ${intervalMs / 1000}s).`);
}

export function stopLateReturnScheduler() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}
