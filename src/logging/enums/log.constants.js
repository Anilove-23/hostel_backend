export const ActorType = Object.freeze({
  STUDENT: 'STUDENT',
  ADMIN: 'ADMIN',
  ATTENDENT: 'ATTENDENT',
  GUARD: 'GUARD',
});

export const AuthAction = Object.freeze({
  SIGN_IN: 'SIGN_IN',
  SIGN_UP: 'SIGN_UP',
  SIGN_OUT: 'SIGN_OUT',
});

export const StudentAction = Object.freeze({
  COMPLAINT_CREATED: 'COMPLAINT_CREATED',
  OUTPASS_CREATED: 'OUTPASS_CREATED',
  OUTPASS_CANCELLED: 'OUTPASS_CANCELLED',
  OUTPASS_APPROVED: 'OUTPASS_APPROVED',
  OUTPASS_REJECTED: 'OUTPASS_REJECTED',
  CAMPUS_EXIT: 'CAMPUS_EXIT',
  CAMPUS_ENTRY: 'CAMPUS_ENTRY',
});

export const AdminRole = Object.freeze({
  ATTENDENT: 'ATTENDENT',
  WARDEN: 'WARDEN',
  CHIEF_WARDEN: 'CHIEF_WARDEN',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
});

export const AuditAction = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
});
