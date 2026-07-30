import { Router } from 'express';
import auth from '../../middleware/middleware.js';
import authorizeRoles from '../../middleware/authorizeRoles.js';
import {
  getAuthLogs,
  getSessions,
  getStudentActivities,
  getAdminAudits,
} from '../controllers/log.controller.js';

const router = Router();

/*
=================================================
LOGGING READ ROUTES
=================================================
*/

// Auth logs: Chief Warden / Warden / System Admin
router.get('/auth', auth, authorizeRoles('chief-warden', 'warden', 'admin'), getAuthLogs);

// User sessions: Chief Warden / Warden / System Admin
router.get('/sessions', auth, authorizeRoles('chief-warden', 'warden', 'admin'), getSessions);

// Student activity timeline: Attendant / Warden / Chief Warden / Admin
router.get('/activity/:studentId', auth, authorizeRoles('attendant', 'warden', 'chief-warden', 'admin'), getStudentActivities);

// Admin audit logs: Chief Warden / Admin only
router.get('/audit', auth, authorizeRoles('chief-warden', 'admin'), getAdminAudits);

export default router;
