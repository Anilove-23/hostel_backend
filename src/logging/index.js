/**
 * src/logging/index.js
 *
 * Module Facade for the Logging Subsystem.
 * External domains must import logging features solely from this file.
 */

// Services
export { logAuthentication, getAuthLogs } from './services/auth.service.js';
export { startSession, endSession, getSessions } from './services/session.service.js';
export { logStudentActivity, getStudentActivities } from './services/activity.service.js';
export { logAdminAudit, getAdminAudits } from './services/audit.service.js';
export { getVisits } from './services/visit.service.js';

// Enums / Constants
export {
  ActorType,
  AuthAction,
  StudentAction,
  AdminRole,
  AuditAction,
} from './enums/log.constants.js';

// Middleware
export { authLogger } from './middlewares/auth.logger.js';

// Routes
export { default as logRouter } from './routes/log.routes.js';
