/**
 * testConfig.js — Central timing constants
 * ============================================================
 * Set TEST_MODE=true in your .env (or shell) to collapse all
 * timing to fast values suitable for test scripts.
 *
 * Production:   round = 10 min, batch = 30 min, 3 rounds
 * TEST_MODE:    round = 10 sec, batch = 30 sec, 3 rounds
 * ============================================================
 */

export const TEST_MODE = process.env.TEST_MODE === 'true';

/** Duration of one round window (submissions open period). */
export const ROUND_DURATION_MS = TEST_MODE
    ? 10_000      // 10 seconds (test)
    : 600_000;    // 10 minutes (production)

/** Total batch duration = MAX_ROUNDS × ROUND_DURATION_MS */
export const BATCH_DURATION_MS = TEST_MODE
    ? 30_000      // 30 seconds (test:  3 × 10s)
    : 1_800_000;  // 30 minutes (prod:  3 × 10min)

/** Number of rounds per batch — 3 rounds per batch. */
export const MAX_ROUNDS = 3;

/** Number of groups (leaders) per batch. */
export const BATCH_SIZE = 50;

if (TEST_MODE) {
    console.log('[testConfig] 🧪 TEST_MODE active — round=10s, batch=30s, 3 rounds');
}
