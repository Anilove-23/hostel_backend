import * as activityRepo from '../repositories/activity.repository.js';

/**
 * Log a student domain action (e.g. OUTPASS_CREATED, COMPLAINT_CREATED, CAMPUS_EXIT).
 * Safe fire-and-forget logic: catches errors internally.
 */
export async function logStudentActivity({ studentId, action, entityId = null, entityType = null, metadata = null }) {
  try {
    if (!studentId || !action) {
      console.warn('[Logging/ActivityService] Missing studentId or action for logStudentActivity', { studentId, action });
      return null;
    }
    return await activityRepo.insertActivity({
      studentId,
      action,
      entityId,
      entityType,
      metadata,
    });
  } catch (error) {
    console.error('[Logging/ActivityService] Failed to record student activity log:', error.message);
    return null;
  }
}

/**
 * Fetch student activity logs based on filters.
 */
export async function getStudentActivities(filters = {}) {
  return await activityRepo.findActivities(filters);
}
