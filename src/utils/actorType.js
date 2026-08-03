const ACTOR_TYPE_MAP = Object.freeze({
  student: 'STUDENT',
  admin: 'ADMIN',
  attendant: 'ATTENDENT',
  attendent: 'ATTENDENT',
  guard: 'GUARD',
  warden: 'ADMIN',
  'chief-warden': 'ADMIN',
  chief: 'ADMIN',
  'chief warden': 'ADMIN',
});

export function mapActorType(role) {
  if (role === null || role === undefined) {
    return null;
  }

  const normalizedRole = String(role).trim().toLowerCase();

  if (!normalizedRole) {
    return null;
  }

  if (ACTOR_TYPE_MAP[normalizedRole]) {
    return ACTOR_TYPE_MAP[normalizedRole];
  }

  if (['student', 'admin', 'attendant', 'attendent', 'guard'].includes(normalizedRole)) {
    return normalizedRole === 'student'
      ? 'STUDENT'
      : normalizedRole === 'admin'
        ? 'ADMIN'
        : normalizedRole === 'attendant' || normalizedRole === 'attendent'
          ? 'ATTENDENT'
          : 'GUARD';
  }

  if (normalizedRole === 'studenT') {
    return 'STUDENT';
  }

  return null;
}
