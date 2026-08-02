import { Router } from 'express';
import auth from '../../middleware/middleware.js';
import {
  getAuthLogs,
  getSessions,
  getStudentActivities,
  getVisits,
  getAdminAudits,
} from '../controllers/log.controller.js';

const router = Router();

/*
=================================================
LOGGING READ ROUTES (Accessible to authenticated users)
=================================================
*/

// Auth logs
router.get('/auth', auth, getAuthLogs);

// User sessions
router.get('/sessions', auth, getSessions);

// Student activity timeline (studentId optional query param or path param)
router.get('/activity', auth, getStudentActivities);
router.get('/activity/:studentId', auth, getStudentActivities);

// Gate visit logs
router.get('/visits', auth, getVisits);

// Admin audit logs
router.get('/audit', auth, getAdminAudits);

export default router;
