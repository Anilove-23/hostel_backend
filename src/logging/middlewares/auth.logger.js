import { extractClient } from '../utils/extract-client.js';
import * as authService from '../services/auth.service.js';
import * as sessionService from '../services/session.service.js';
import { AuthAction, ActorType } from '../enums/log.constants.js';

/**
 * Express middleware generator for authentication logging & user session creation.
 * Attach this middleware to signin/signup/signout routes.
 *
 * @param {string} action - One of AuthAction (SIGN_IN, SIGN_UP, SIGN_OUT)
 * @param {string} [defaultActorType=ActorType.STUDENT] - Default actor type if not present on req.user
 */
export function authLogger(action, defaultActorType = ActorType.STUDENT) {
  return (req, res, next) => {
    const { ip, userAgent } = extractClient(req);
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      const statusCode = res.statusCode;
      const success = statusCode >= 200 && statusCode < 400;

      // Extract actor details from req.user (set by auth middleware) or body
      const actorId = req.user?.id || body?.data?.id || body?.data?.user?.id || req.body?.actor_id || null;
      const rawRole = req.user?.role || req.headers?.role || req.body?.role || defaultActorType;
      const actorType = (rawRole || defaultActorType).toUpperCase();

      if (actorId) {
        // Asynchronously log auth attempt (non-blocking)
        authService.logAuthentication({
          actorId,
          actorType,
          action,
          success,
          ipAddress: ip,
          userAgent,
        });

        // Start session on successful sign-in / sign-up
        if (success && (action === AuthAction.SIGN_IN || action === AuthAction.SIGN_UP)) {
          sessionService.startSession({
            actorId,
            actorType,
            ipAddress: ip,
            userAgent,
          });
        }
      }

      return originalJson(body);
    };

    next();
  };
}
