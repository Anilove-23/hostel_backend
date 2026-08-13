import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getActiveSession } from '../logging/services/session.service.js';
import { mapActorType } from '../utils/actorType.js';

dotenv.config();

const auth = async (req, res, next) => {
    // Accept token from:
    //   1. httpOnly cookie (preferred — set by the server on login)
    //   2. Authorization: Bearer <token> header (fallback for non-browser clients)
    //   3. Legacy `token` header
    const cookieToken = req.cookies?.token;
    const authHeader = req.headers.authorization || '';
    const token = cookieToken
        || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null)
        || req.headers.token;

    if (!token) {
        return res.status(401).json({ message: 'Authentication token is required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Always derive role from the JWT payload — never trust client-supplied headers
        const actorId = decoded.id ?? decoded.sub ?? null;
        const userRole = decoded.role;

        if (!userRole) {
            return res.status(401).json({ message: 'Token is missing role claim. Please log in again.' });
        }

        // Force re-login if the JWT does not contain a sessionId
        if (!decoded.sessionId) {
            return res.status(401).json({
                message: 'Your token is outdated. Please log in again.'
            });
        }

        const mappedActorType = mapActorType(userRole);

        // Query active session in DB for this user
        const activeSession = actorId
            ? await getActiveSession({ actorId, actorType: mappedActorType })
            : null;

        // Reject if session was deactivated or IDs do not match
        if (!activeSession || String(activeSession.id) !== String(decoded.sessionId)) {
            return res.status(401).json({
                message: 'Your session has expired. Please log in again.'
            });
        }

        req.user = decoded;
        return next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export default auth;