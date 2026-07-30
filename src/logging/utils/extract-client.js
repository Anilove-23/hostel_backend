/**
 * Utility to extract client IP address and User-Agent header from Express request.
 *
 * @param {import('express').Request} req
 * @returns {{ ip: string | null, userAgent: string | null }}
 */
export function extractClient(req) {
  if (!req) return { ip: null, userAgent: null };

  const rawIp =
    req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    null;

  const userAgent = req.headers?.['user-agent'] || null;

  return {
    ip: rawIp,
    userAgent,
  };
}
