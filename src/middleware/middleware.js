import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getActiveSession } from '../logging/services/session.service.js';
import { mapActorType } from '../utils/actorType.js';

dotenv.config();

const auth = async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : req.headers.token;
    const headerRole = req.headers.role;

    if (!token || !headerRole) {
        return res.status(401).json({ message: 'Token and role are required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const actorId = decoded.id ?? decoded.sub ?? null;
        const userRole = decoded.role || headerRole; // Fallback to header role if missing in payload
        const mappedActorType = mapActorType(userRole);

        // --- DEBUG LOGS (Watch your Node.js server console) ---
        console.log(`[Auth Debug] User ID: ${actorId} | Role: ${userRole} | Mapped: ${mappedActorType}`);
        console.log(`[Auth Debug] Token SessionId:`, decoded.sessionId);

        // --- SINGLE SESSION ENFORCEMENT ---
       // --- SINGLE SESSION ENFORCEMENT ---
        // 1. Force re-login if the JWT does not contain a sessionId
        if (!decoded.sessionId) {
            console.warn(`[Auth Revoked] Token missing sessionId for Actor ID ${actorId}. Forcing re-login.`);
            return res.status(401).json({ 
                message: 'Your token is outdated. Please log in again.' 
            });
        }

        // 2. Query active session in DB for this user
        const activeSession = actorId
            ? await getActiveSession({ actorId, actorType: mappedActorType })
            : null;

        console.log(`[Auth Debug] Token SessionId: ${decoded.sessionId} | DB Active SessionId: ${activeSession?.id}`);

        // 3. Reject if session was deactivated or IDs do not match
        if (!activeSession || String(activeSession.id) !== String(decoded.sessionId)) {
            console.warn(`[Auth Revoked] Session mismatch for Actor ID ${actorId}. Token: ${decoded.sessionId} | DB: ${activeSession?.id}`);
            return res.status(401).json({ 
                message: 'Your session has expired because you logged in on another device.' 
            });
        }

        // --- ROLE VALIDATION ---
        const roleGroups = {
            student: ['student'],
            attendant: ['attendant', 'admin'],
            guard: ['guard'],
            warden: ['warden', 'admin'],
            'chief-warden': ['chief-warden', 'warden', 'admin']
        };

        const acceptedRoles = roleGroups[userRole] || [userRole];

        if (!acceptedRoles.includes(headerRole)) {
            return res.status(401).json({ message: 'Unauthorized role access' });
        }

        req.user = decoded;
        return next();
    } catch (err) {
        console.error(`[Auth] Token verification failed: ${err.message}`);
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export default auth;