import asyncHandler from '../../utils/asyncHandler.js';
import ApiResponse from '../../utils/apiResponse.js';
import ApiError from '../../utils/apiError.js';
import * as authService from '../services/auth.service.js';
import * as sessionService from '../services/session.service.js';
import * as activityService from '../services/activity.service.js';
import * as auditService from '../services/audit.service.js';
import * as visitService from '../services/visit.service.js';

/*
=================================================
GET AUTH LOGS
GET /api/logs/auth
=================================================
*/
export const getAuthLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const offset = (page - 1) * limit;

  const { actor_id, actor_type, action, success } = req.query;

  const result = await authService.getAuthLogs({
    actorId: actor_id ? parseInt(actor_id, 10) : undefined,
    actorType: actor_type,
    action,
    success: success !== undefined ? success === 'true' : undefined,
    limit,
    offset,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        logs: result.logs,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      },
      'Auth logs fetched successfully'
    )
  );
});

/*
=================================================
GET USER SESSIONS
GET /api/logs/sessions
=================================================
*/
export const getSessions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const offset = (page - 1) * limit;

  const { actor_id, actor_type, active_only } = req.query;

  const result = await sessionService.getSessions({
    actorId: actor_id ? parseInt(actor_id, 10) : undefined,
    actorType: actor_type,
    activeOnly: active_only === 'true',
    limit,
    offset,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        sessions: result.sessions,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      },
      'User sessions fetched successfully'
    )
  );
});

/*
=================================================
GET STUDENT ACTIVITY LOGS
GET /api/logs/activity
=================================================
*/
export const getStudentActivities = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const offset = (page - 1) * limit;

  const { student_id, studentId, action, entity_type, hostel, search, from, to } = req.query;
  const resolvedStudentId = studentId || student_id;

  const result = await activityService.getStudentActivities({
    studentId: resolvedStudentId ? parseInt(resolvedStudentId, 10) : undefined,
    action,
    entityType: entity_type,
    hostel,
    search,
    from,
    to,
    limit,
    offset,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        activities: result.activities,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      },
      'Student activity logs fetched successfully'
    )
  );
});

/*
=================================================
GET GATE VISIT LOGS
GET /api/logs/visits
=================================================
*/
export const getVisits = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const offset = (page - 1) * limit;

  const { hostel, search, from, to } = req.query;

  const result = await visitService.getVisits({
    hostel,
    search,
    from,
    to,
    limit,
    offset,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        visits: result.visits,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      },
      'Gate visit logs fetched successfully'
    )
  );
});

/*
=================================================
GET ADMIN AUDIT LOGS
GET /api/logs/audit
=================================================
*/
export const getAdminAudits = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const offset = (page - 1) * limit;

  const { staff_id, actor_role, table_name, action, record_id, hostel, search, from, to } = req.query;

  const result = await auditService.getAdminAudits({
    staffId: staff_id ? parseInt(staff_id, 10) : undefined,
    actorRole: actor_role,
    tableName: table_name,
    action,
    recordId: record_id,
    hostel,
    search,
    from,
    to,
    limit,
    offset,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        audits: result.audits,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      },
      'Admin audit logs fetched successfully'
    )
  );
});
