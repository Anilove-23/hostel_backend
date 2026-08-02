import * as visitRepo from '../repositories/visit.repository.js';

/**
 * Fetch gate visit logs with filters.
 */
export async function getVisits(filters = {}) {
  return await visitRepo.findVisits(filters);
}
