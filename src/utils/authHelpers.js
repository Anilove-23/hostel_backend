import bcrypt from 'bcryptjs';
import axios from 'axios';

const DEFAULT_REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GUARD_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function getRefreshTokenExpiry(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'guard') {
    return GUARD_REFRESH_TOKEN_TTL_MS;
  }
  return DEFAULT_REFRESH_TOKEN_TTL_MS;
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0];
  }
  return req.ip || req.connection?.remoteAddress || null;
}

export async function hashRefreshToken(token) {
  return bcrypt.hash(token, 10);
}

export async function compareRefreshTokens(token, hash) {
  return bcrypt.compare(token, hash);
}

export async function lookupLocationFromIp(ip) {
  if (!ip) return null;

  const endpoints = [
    `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    `https://ipinfo.io/${encodeURIComponent(ip)}/json`,
  ];

  for (const endpoint of endpoints) {
    try {
      const { data } = await axios.get(endpoint, { timeout: 2000 });
      return {
        city: data.city || null,
        state: data.region || data.region_name || null,
        country: data.country_name || data.country || null,
        ip,
      };
    } catch (error) {
      // Ignore lookup failures so login still succeeds.
    }
  }

  return null;
}
