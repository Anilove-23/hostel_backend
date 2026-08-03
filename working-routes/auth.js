import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pool from '../src/db/pool.js';
import auth from '../src/middleware/middleware.js';
import dotenv from 'dotenv';
import { generateOtp, storeOtp, verifyOtp } from '../src/utils/otp.js';
import { getClientIp, getRefreshTokenExpiry, hashRefreshToken, compareRefreshTokens, lookupLocationFromIp } from '../src/utils/authHelpers.js';
import { logAuthentication } from '../src/logging/services/auth.service.js';
import { startSession, deactivateSessions, rotateSessionRefresh, endSession, getActiveSession, getActiveSessionByMachine,
    updateGuardSession } from '../src/logging/services/session.service.js';
import { mapActorType } from '../src/utils/actorType.js';

const DEPARTMENT_PREFIXES = {
    CSE: 'BCS',
    ME: 'BME',
    CE: 'BCE',
    CH: 'BCH',
    EE: 'BEE',
    ECE: 'BEC',
    MNC: 'BMA',
    'ENGINEERING PHYSICS': 'BPH',
    'MATERIAL SCIENCE': 'BMS',
    'CHEMICAL ENGINEERING': 'BCH',
    CHEMICAL: 'BCH',
    ARCHITECTURE: 'BAR',
    BAR: 'BAR',
    'DUAL DEGREE CSE': 'DCS',
    'DUAL DEGREE ELECTRONICS': 'DEC',
};

const DEPARTMENT_ALIASES = {
    'COMPUTER SCIENCE ENGINEERING': 'CSE',
    'COMPUTER SCIENCE & ENGINEERING': 'CSE',
    CSE: 'CSE',
    'MECHANICAL ENGINEERING': 'ME',
    ME: 'ME',
    'CIVIL ENGINEERING': 'CE',
    CE: 'CE',
    'ELECTRICAL ENGINEERING': 'EE',
    EE: 'EE',
    'ELECTRONICS & COMMUNICATION ENGINEERING': 'ECE',
    'ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
    ECE: 'ECE',
    'MATHEMATICS & COMPUTING': 'MNC',
    'MATHEMATICS AND COMPUTING': 'MNC',
    MNC: 'MNC',
    'ENGINEERING PHYSICS': 'ENGINEERING PHYSICS',
    BPH: 'ENGINEERING PHYSICS',
    'MATERIAL SCIENCE': 'MATERIAL SCIENCE',
    BMS: 'MATERIAL SCIENCE',
    'CHEMICAL ENGINEERING': 'CHEMICAL ENGINEERING',
    CHEMICAL: 'CHEMICAL ENGINEERING',
    CH: 'CHEMICAL ENGINEERING',
    ARCHITECTURE: 'ARCHITECTURE',
    BAR: 'ARCHITECTURE',
    'DUAL DEGREE CSE': 'DUAL DEGREE CSE',
    DCS: 'DUAL DEGREE CSE',
    'DUAL DEGREE ELECTRONICS': 'DUAL DEGREE ELECTRONICS',
    DEC: 'DUAL DEGREE ELECTRONICS',
};

const normalizeDepartment = (department) => {
    if (!department) return '';

    const trimmed = String(department).trim();
    const upper = trimmed.toUpperCase();
    return DEPARTMENT_ALIASES[upper] || DEPARTMENT_ALIASES[trimmed] || '';
};

const getDepartmentPrefix = (department) => {
    const normalizedDepartment = normalizeDepartment(department);
    return DEPARTMENT_PREFIXES[normalizedDepartment] || null;
};

const validateDepartmentRollNumber = (department, rollno) => {
    if (!department || !rollno) return false;

    const prefix = getDepartmentPrefix(department);
    if (!prefix) return false;

    const normalizedRollNo = String(rollno).trim().toUpperCase();
    const pattern = new RegExp(`^(?:\\d{2,4})?${prefix}`);
    return pattern.test(normalizedRollNo);
};

const validateStudentEmail = (email, rollno) => {
    if (!email || !rollno) return false;

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRollNo = String(rollno).trim().toLowerCase();

    if (!normalizedEmail.endsWith('@nith.ac.in')) return false;

    const localPart = normalizedEmail.split('@')[0];
    return localPart === normalizedRollNo;
};

dotenv.config();

const router = express.Router();

const generateToken = (payload) => jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '1h'
});

const getAdminRole = (admin) => {
    const normalizedEmail = String(admin?.email || '').toLowerCase();

    if (normalizedEmail.includes('attendant')) return 'attendant';
    if (normalizedEmail.includes('chief')) return 'chief-warden';
    if (normalizedEmail.includes('warden')) return 'warden';

    switch (Number(admin?.authority_level)) {
        case 1:
            return 'attendant';
        case 2:
            return 'warden';
        case 3:
            return 'chief-warden';
        default:
            return 'attendant';
    }
};

const isBcryptHash = (value) => typeof value === 'string' && /^\$2[aby]\$/i.test(value);

const verifyStoredPassword = async (inputPassword, storedPassword) => {
    if (!storedPassword) return false;

    if (isBcryptHash(storedPassword)) {
        return bcrypt.compare(inputPassword, storedPassword);
    }

    return inputPassword === storedPassword;
};

const inferRoleFromEmail = (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) return 'student';
    if (normalizedEmail.includes('attendant') || normalizedEmail.includes('att_')) return 'attendant';
    if (normalizedEmail.includes('chief')) return 'chief-warden';
    if (normalizedEmail.includes('guard')) return 'guard';
    if (normalizedEmail.includes('warden')) return 'warden';

    return 'student';
};

const ROLE_TABLES = {
    student: 'student',
    attendant: 'attendent',
    guard: 'guard',
    warden: 'admin',
    'chief-warden': 'admin'
};

const OTP_ENABLED_ROLES = new Set(['student', 'attendant', 'warden', 'chief-warden']);

const createAuthenticatedSessionResponse = async (req, res, { user, role, clientIp, userAgent,  machineId = null,existingSession = null, refreshToken = null,
        refreshTokenHash = null,
        refreshExpiresAt = null }) => {
    if (!refreshToken) {
        refreshToken = jwt.sign(
            { sub: user.id, role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
    }
    refreshTokenHash = await hashRefreshToken(refreshToken);
    refreshExpiresAt = new Date(Date.now() + getRefreshTokenExpiry(role));
    const location = await lookupLocationFromIp(clientIp);

    if (role !== 'guard') {
        await deactivateSessions({
            actorId: user.id,
            actorType: mapActorType(role)
        });
    }

    await logAuthentication({
        actorId: user.id,
        actorType: mapActorType(role),
        action: 'SIGN_IN',
        success: true,
        ipAddress: clientIp,
        userAgent,
        eventName: 'SESSION_REVOKED',
        endpoint: req.originalUrl,
        status: 200,
        userEmail: user.email,
        role,
    });

    let session;

if (existingSession) {
    session = existingSession;
} else {
    session = await startSession({
        actorId: user.id,
        actorType: mapActorType(role),
        ipAddress: clientIp,
        userAgent,
        role,
        refreshTokenHash,
        refreshExpiresAt,
        isActive: true,
        machineId:
            role === 'guard'
                ? req.headers['x-machine-id']
                : null
    });
}

    const token = generateToken({
        id: user.id,
        email: user.email,
        role,
        authority_level: user.authority_level,
        sessionId: session?.id,
    });

    await logAuthentication({
        actorId: user.id,
        actorType: mapActorType(role),
        action: 'SIGN_IN',
        success: true,
        ipAddress: clientIp,
        userAgent,
        eventName: 'LOGIN_SUCCESS',
        endpoint: req.originalUrl,
        status: 200,
        sessionId: session?.id,
        userEmail: user.email,
        role,
        details: location || undefined,
    });

    if (location && session?.id) {
        await pool.query(`UPDATE user_session SET city = $1, state = $2, country = $3 WHERE id = $4`, [location.city, location.state, location.country, session.id]);
    }

    return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        refreshToken,
        user,
        role,
        sessionId: session?.id
    });
};

// ======================================================
// VERIFY LOGIN TOKEN
// ======================================================

router.get('/login', (req, res) => {
    const authHeader = req.headers.authorization || '';

    const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : req.headers.token;

    const { role } = req.headers;

    if (!token || !role) {
        return res.status(400).json({
            message: 'Token and role are required'
        });
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (decoded.role !== role) {
            return res.status(401).json({
                message: 'Unauthorized'
            });
        }

        return res.status(200).json({
            message: 'Token is valid',
            user: decoded
        });

    } catch (err) {
        return res.status(401).json({
            message: 'Invalid token'
        });
    }
});


// ======================================================
// LOGIN (OTP for eligible roles, direct JWT for Guard)
// ======================================================

router.post('/login', async (req, res) => {
    const { email, password, role: requestedRole } = req.body || {};
    const role = requestedRole || inferRoleFromEmail(email) || 'student';
    const clientIp = getClientIp(req);
    const userAgent = req.get('user-agent') || '';

    if (!email || !password) {
        return res.status(400).json({
            message: 'Email and password are required'
        });
    }

    const tableName = ROLE_TABLES[role];

    if (!tableName) {
        return res.status(400).json({
            message: 'Invalid role'
        });
    }

    try {
        const lookupTables = [tableName, 'attendent', 'admin', 'guard', 'student'].filter((value, index, array) => array.indexOf(value) === index);
        let user = null;

        for (const lookupTable of lookupTables) {
            const result = await pool.query(
                `SELECT * FROM ${lookupTable}
                 WHERE LOWER(email) = LOWER($1)
                 LIMIT 1`,
                [email]
            );

            if (result.rows[0]) {
                user = result.rows[0];
                break;
            }
        }

        if (!user) {
            await logAuthentication({
                actorId: null,
                actorType: mapActorType(role),
                action: 'SIGN_IN',
                success: false,
                ipAddress: clientIp,
                userAgent,
                eventName: 'LOGIN_FAILED',
                endpoint: req.originalUrl,
                status: 401,
                userEmail: email,
                role,
            });
            return res.status(401).json({
                message: 'Invalid credentials'
            });
        }

        const storedPassword = user.password_hash ?? user.password;

        const passwordMatch = await verifyStoredPassword(
            password,
            storedPassword
        );

        if (!passwordMatch) {
            await logAuthentication({
                actorId: user.id,
                actorType: mapActorType(role),
                action: 'SIGN_IN',
                success: false,
                ipAddress: clientIp,
                userAgent,
                eventName: 'LOGIN_FAILED',
                endpoint: req.originalUrl,
                status: 401,
                userEmail: user.email,
                role,
            });
            return res.status(401).json({
                message: 'Invalid credentials'
            });
        }

        const machineIdHeader = req.headers['x-machine-id'] || req.headers['X-Machine-ID'];
        const machineId = Array.isArray(machineIdHeader)
            ? machineIdHeader[0]
            : typeof machineIdHeader === 'string'
                ? machineIdHeader
                : '';
        const normalizedMachineId = typeof machineId === 'string' ? machineId.trim() : '';

        if (role === 'guard') {
            

            if (!normalizedMachineId) {
                return res.status(400).json({
                    message: 'Machine ID header (X-Machine-ID) is required for Guard login.'
                });
            }
            const refreshToken = jwt.sign(
    { sub: user.id, role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
);

const refreshTokenHash = await hashRefreshToken(refreshToken);

const refreshExpiresAt = new Date(
    Date.now() + getRefreshTokenExpiry(role)
);
            const existingSession = await getActiveSessionByMachine({
        actorId: user.id,
        actorType: role,
        machineId: normalizedMachineId
    });


    if (existingSession) {

        return updateGuardSession(
            existingSession.id,
            {
                ipAddress: clientIp,
                userAgent,
                refreshTokenHash,
                refreshExpiresAt
            }
        ).then(() =>
            createAuthenticatedSessionResponse(req, res, {
                user,
                role,
                clientIp,
                userAgent,
                existingSession
            })
        );
    }

            const guardRecordResult = await pool.query(
                `SELECT authorized_machine_1, authorized_machine_2 FROM guard WHERE id = $1 LIMIT 1`,
                [user.id]
            );
            const guardRecord = guardRecordResult.rows[0] || {};
            const authorizedMachine1 = guardRecord.authorized_machine_1;
            const authorizedMachine2 = guardRecord.authorized_machine_2;

            if (authorizedMachine1 && authorizedMachine2 && authorizedMachine1 !== normalizedMachineId && authorizedMachine2 !== normalizedMachineId) {
                return res.status(403).json({
                    message: 'Access Denied: This Guard account is already registered on 2 authorized gate machines.'
                });
            }

            if (!authorizedMachine1) {
                await pool.query(
                    `UPDATE guard SET authorized_machine_1 = $1 WHERE id = $2`,
                    [normalizedMachineId, user.id]
                );
            } else if (!authorizedMachine2) {
                await pool.query(
                    `UPDATE guard SET authorized_machine_2 = $1 WHERE id = $2`,
                    [normalizedMachineId, user.id]
                );
            }

            return createAuthenticatedSessionResponse(req, res, {
                user,
                role,
                clientIp,
                userAgent,
            });
        }

        if (OTP_ENABLED_ROLES.has(role)) {
            const otp = generateOtp();
            storeOtp(email, otp, role, user);

            await logAuthentication({
                actorId: user.id,
                actorType: mapActorType(role),
                action: 'SIGN_IN',
                success: true,
                ipAddress: clientIp,
                userAgent,
                eventName: 'OTP_SENT',
                endpoint: req.originalUrl,
                status: 200,
                userEmail: user.email,
                role,
            });

            return res.status(200).json({
                success: true,
                message: 'OTP generated',
                email,
                role,
                otp: process.env.NODE_ENV !== 'production' ? otp : undefined
            });
        await logAuthentication({
            actorId: user.id,
            actorType: mapActorType(role),
            action: 'SIGN_IN',
            success: true,
            ipAddress: clientIp,
            userAgent,
            eventName: 'LOGIN_SUCCESS',
            endpoint: req.originalUrl,
            status: 200,
            userEmail: user.email,
            role,
            details: location || undefined,
        });
        if (location) {
            await pool.query(`UPDATE user_session SET city = $1, state = $2, country = $3 WHERE id = $4`, [location.city, location.state, location.country, session?.id]);
        }

        return createAuthenticatedSessionResponse(req, res, {
            user,
            role,
            clientIp,
            userAgent,
        });

    } catch (err) {
        console.error("Login error:", err);

        return res.status(500).json({
            message: err.message || 'Internal server error',
            error: err.toString(),
            detail: err.detail,
            code: err.code
        });
    }
});

const finalizeSignup = async (req, res, { clientIp, userAgent }) => {
    const { email, otp } = req.body || {};

    if (!email || !otp) {
        return res.status(400).json({
            success: false,
            message: 'Email and OTP are required'
        });
    }

    const result = verifyOtp(email, otp);

    if (!result || !result.valid) {
        await logAuthentication({
            actorId: null,
            actorType: mapActorType('student'),
            action: 'SIGN_UP',
            success: false,
            ipAddress: clientIp,
            userAgent,
            eventName: 'INVALID_OTP',
            endpoint: req.originalUrl,
            status: 400,
            userEmail: email,
        });
        return res.status(400).json({
            success: false,
            message: 'Invalid or expired OTP'
        });
    }

    const payload = result.payload;
    const tempUser = payload.user || payload;
    let createdUser = null;

    try {
        if (tempUser && tempUser.role) {
            const role = tempUser.role;

            if (role === 'student') {
                const insertRes = await pool.query(
                    `INSERT INTO student (name, email, password, hostel, hostel_id, roll_no, phone, department)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     RETURNING *`,
                    [
                        tempUser.name,
                        tempUser.email,
                        tempUser.password,
                        tempUser.hostel,
                        tempUser.hostel_id,
                        tempUser.rollno,
                        tempUser.phone,
                        tempUser.department
                    ]
                );
                createdUser = insertRes.rows[0];
            } else if (role === 'attendant') {
                const insertRes = await pool.query(
                    `INSERT INTO attendent (name, email, password, hostel, hostel_id, phone)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING *`,
                    [
                        tempUser.name,
                        tempUser.email,
                        tempUser.password,
                        tempUser.hostel,
                        tempUser.hostel_id,
                        tempUser.phone
                    ]
                );
                createdUser = insertRes.rows[0];
            } else if (role === 'guard') {
                const insertRes = await pool.query(
                    `INSERT INTO guard (name, email, password, phone)
                     VALUES ($1, $2, $3, $4)
                     RETURNING *`,
                    [
                        tempUser.name,
                        tempUser.email,
                        tempUser.password,
                        tempUser.phone
                    ]
                );
                createdUser = insertRes.rows[0];
            } else if (role === 'warden') {
                const insertRes = await pool.query(
                    `INSERT INTO admin (name, email, password, authority_level)
                     VALUES ($1, $2, $3, $4)
                     RETURNING *`,
                    [
                        tempUser.name,
                        tempUser.email,
                        tempUser.password,
                        tempUser.authority_level
                    ]
                );
                createdUser = insertRes.rows[0];
            }
        }

        const userObj = createdUser || tempUser;
        const role = tempUser.role;
        const refreshToken = jwt.sign({ sub: userObj.id, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const refreshTokenHash = await hashRefreshToken(refreshToken);
        const refreshExpiresAt = new Date(Date.now() + getRefreshTokenExpiry(role));
        const location = await lookupLocationFromIp(clientIp);

        await deactivateSessions({
            actorId: userObj.id,
            actorType: mapActorType(role)
        });

        const session = await startSession({
            actorId: userObj.id,
            actorType: mapActorType(role),
            ipAddress: clientIp,
            userAgent,
            role,
            refreshTokenHash,
            refreshExpiresAt,
            isActive: true,
        
        });

        const token = generateToken({
            id: userObj.id,
            email: userObj.email,
            role,
            authority_level: userObj.authority_level,
            sessionId: session?.id,
        });

        await logAuthentication({
            actorId: userObj.id,
            actorType: mapActorType(role),
            action: 'SIGN_UP',
            success: true,
            ipAddress: clientIp,
            userAgent,
            eventName: 'ACCOUNT_CREATED',
            endpoint: req.originalUrl,
            status: 200,
            userEmail: userObj.email,
            role,
        });

        await logAuthentication({
            actorId: userObj.id,
            actorType: mapActorType(role),
            action: 'SIGN_IN',
            success: true,
            ipAddress: clientIp,
            userAgent,
            eventName: 'OTP_VERIFIED',
            endpoint: req.originalUrl,
            status: 200,
            userEmail: userObj.email,
            role,
            details: location || undefined,
        });

        if (location && session?.id) {
            await pool.query(`UPDATE user_session SET city = $1, state = $2, country = $3 WHERE id = $4`, [location.city, location.state, location.country, session.id]);
        }

        return res.status(200).json({
            success: true,
            message: 'OTP verified and user created',
            token,
            refreshToken,
            user: userObj,
            role,
            sessionId: session?.id
        });
    } catch (err) {
        console.error("Error creating user during OTP verification:", err);
        return res.status(500).json({
            success: false,
            message: err.message || 'Failed to complete registration',
            code: err.code
        });
    }
};

router.post('/verify-login-otp', async (req, res) => {
    const { email, otp, role: requestedRole } = req.body || {};
    const clientIp = getClientIp(req);
    const userAgent = req.get('user-agent') || '';

    if (!email || !otp) {
        return res.status(400).json({
            success: false,
            message: 'Email and OTP are required'
        });
    }

    const result = verifyOtp(email, otp);

    if (!result || !result.valid) {
        await logAuthentication({
            actorId: null,
            actorType: mapActorType(requestedRole || inferRoleFromEmail(email) || 'student'),
            action: 'SIGN_IN',
            success: false,
            ipAddress: clientIp,
            userAgent,
            eventName: 'OTP_FAILED',
            endpoint: req.originalUrl,
            status: 401,
            userEmail: email,
            role: requestedRole || inferRoleFromEmail(email) || 'student',
        });

        return res.status(400).json({
            success: false,
            message: 'Invalid or expired OTP'
        });
    }

    const payload = result.payload;
    const role = payload.role || requestedRole || inferRoleFromEmail(email) || 'student';
    const user = payload.user || payload;

    if (!user?.id) {
        return res.status(400).json({
            success: false,
            message: 'Invalid OTP payload'
        });
    }

    return createAuthenticatedSessionResponse(req, res, {
        user,
        role,
        clientIp,
        userAgent,
    });
});

router.post('/verify-otp', async (req, res) => {
    const clientIp = getClientIp(req);
    const userAgent = req.get('user-agent') || '';
    return finalizeSignup(req, res, { clientIp, userAgent });
});

router.post('/signup', async (req, res) => {
    const clientIp = getClientIp(req);
    const userAgent = req.get('user-agent') || '';
    return finalizeSignup(req, res, { clientIp, userAgent });
});
// CURRENT USER
// ======================================================

router.get('/me', auth, async (req, res) => {

    const { id, email, role } = req.user;

    const tableName = ROLE_TABLES[role];

    if (!tableName) {
        return res.status(400).json({
            message: 'Invalid role'
        });
    }

    try {

        const result = await pool.query(
            `SELECT * FROM ${tableName}
             WHERE id = $1 AND email = $2
             LIMIT 1`,
            [id, email]
        );

        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        return res.status(200).json({
            user,
            role
        });

    } catch (err) {
        console.error("Error in /me:", err);

        return res.status(500).json({
            message: err.message || 'Internal server error',
            error: err.toString(),
            detail: err.detail,
            code: err.code
        });
    }
});


// ======================================================
// SIGNUP STEP 1: SEND OTP
// ======================================================

router.post('/send-otp', async (req, res) => {

    const data = req.body;
    const clientIp = getClientIp(req);
    const userAgent = req.get('user-agent') || '';

    if (!data || !data.role) {
        return res.status(400).json({
            message: 'Role is required'
        });
    }

    try {

        let tempUserData = {};
        const { role, email } = data;

        // ======================================================
        // STUDENT SIGNUP
        // ======================================================

        if (role === 'student') {

            const {
                name,
                password,
                phone,
                department,
                rollno,
                hostel,
                degree_type,
                academic_year
            } = data;

            const missingFields = [];
            if (!name) missingFields.push('name');
            if (!email) missingFields.push('email');
            if (!password) missingFields.push('password');
            if (!phone) missingFields.push('phone');
            if (!department) missingFields.push('department');
            if (!rollno) missingFields.push('rollno');
            if (!hostel) missingFields.push('hostel');

            if (missingFields.length > 0) {
                return res.status(400).json({
                    message: `Missing required fields for student: ${missingFields.join(', ')}`
                });
            }

            if (!validateDepartmentRollNumber(department, rollno)) {
                return res.status(400).json({
                    message: 'Roll number does not match the selected department.'
                });
            }

            if (!validateStudentEmail(email, rollno)) {
                return res.status(400).json({
                    message: 'Email must be in the format rollno@nith.ac.in'
                });
            }

            const existingStudent = await pool.query(
                `SELECT email, roll_no, phone FROM student
                 WHERE email = $1 OR roll_no = $2 OR phone = $3
                 LIMIT 1`,
                [email, rollno, phone]
            );

            if (existingStudent.rows.length > 0) {
                const existing = existingStudent.rows[0];
                const conflicts = [];

                if (existing.email === email) conflicts.push('email');
                if (existing.roll_no === rollno) conflicts.push('roll number');
                if (existing.phone === phone) conflicts.push('phone number');

                return res.status(409).json({
                    message: `The following values already exist: ${conflicts.join(', ')}`
                });
            }

            // Find hostel
            const hostelResult = await pool.query(
                `SELECT id, name
                 FROM hostel
                 WHERE name = $1
                 LIMIT 1`,
                [hostel]
            );

            if (hostelResult.rows.length === 0) {
                return res.status(404).json({
                    message: 'Hostel not found. Pick one of the available hostels.'
                });
            }

            const hostelData = hostelResult.rows[0];
            const hashedPassword = await bcrypt.hash(password, 10);

            tempUserData = {
                role,
                name,
                email,
                password: hashedPassword,
                hostel: hostelData.name,
                hostel_id: hostelData.id,
                rollno,
                phone,
                department,
                degree_type,
                academic_year
            };
        }

        // ======================================================
        // ATTENDANT SIGNUP
        // ======================================================

        else if (role === 'attendant') {

            const {
                name,
                password,
                hostel,
                phone
            } = data;

            const missingFields = [];
            if (!name) missingFields.push('name');
            if (!email) missingFields.push('email');
            if (!password) missingFields.push('password');
            if (!phone) missingFields.push('phone');
            if (!hostel) missingFields.push('hostel');

            if (missingFields.length > 0) {
                return res.status(400).json({
                    message: `Missing required fields for attendant: ${missingFields.join(', ')}`
                });
            }

            // Find hostel
            const hostelResult = await pool.query(
                `SELECT id, name
                 FROM hostel
                 WHERE name = $1
                 LIMIT 1`,
                [hostel]
            );

            if (hostelResult.rows.length === 0) {
                return res.status(404).json({
                    message: 'Hostel not found'
                });
            }

            const hostelData = hostelResult.rows[0];
            const hashedPasswordAttendant = await bcrypt.hash(password, 10);

            tempUserData = {
                role,
                name,
                email,
                password: hashedPasswordAttendant,
                hostel: hostelData.name,
                hostel_id: hostelData.id,
                phone
            };
        }

        // ======================================================
        // GUARD SIGNUP
        // ======================================================

        else if (role === 'guard') {

            const {
                name,
                password,
                phone
            } = data;

            const missingFields = [];
            if (!name) missingFields.push('name');
            if (!email) missingFields.push('email');
            if (!password) missingFields.push('password');
            if (!phone) missingFields.push('phone');

            if (missingFields.length > 0) {
                return res.status(400).json({
                    message: `Missing required fields for guard: ${missingFields.join(', ')}`
                });
            }

            const hashedPasswordGuard = await bcrypt.hash(password, 10);

            tempUserData = {
                role,
                name,
                email,
                password: hashedPasswordGuard,
                phone
            };
        }

        // ======================================================
        // WARDEN SIGNUP
        // ======================================================

        else if (role === 'warden') {

            const {
                name,
                password,
                authority_level
            } = data;

            const missingFields = [];

            if (!name) missingFields.push('name');
            if (!email) missingFields.push('email');
            if (!password) missingFields.push('password');
            if (!authority_level) missingFields.push('authority_level');

            if (missingFields.length > 0) {
                return res.status(400).json({
                    message: `Missing required fields for warden: ${missingFields.join(', ')}`
                });
            }

            if (![1, 2, 3].includes(Number(authority_level))) {
                return res.status(400).json({
                    message: 'authority_level must be 1, 2, or 3'
                });
            }

            const hashedPasswordWarden = await bcrypt.hash(password, 10);

            tempUserData = {
                role,
                name,
                email,
                password: hashedPasswordWarden,
                authority_level
            };
        }

        // ======================================================
        // INVALID ROLE
        // ======================================================

        else {
            return res.status(400).json({
                message: 'Invalid role'
            });
        }

        // ======================================================
        // GENERATE AND STORE OTP
        // ======================================================

        const otp = generateOtp();
        storeOtp(email, otp, role, tempUserData);

        await logAuthentication({
            actorId: null,
            actorType: mapActorType(role),
            action: 'SIGN_UP',
            success: true,
            ipAddress: clientIp,
            userAgent,
            eventName: 'OTP_SENT',
            endpoint: req.originalUrl,
            status: 200,
            userEmail: email,
            role,
        });

        return res.status(200).json({
            success: true,
            message: 'OTP sent successfully to email.',
            email,
            role,
            otp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });

    } catch (err) {
        console.error("Signup error:", err);

        if (err.code === '23505') {
            let detailMessage = 'Email or roll number already exists.';
            if (err.detail) {
                detailMessage = err.detail;
            }
            return res.status(409).json({
                message: 'Duplicate key violation: User already exists.',
                detail: detailMessage,
                code: err.code
            });
        }

        return res.status(500).json({
            message: err.message || 'Internal server error',
            error: err.toString(),
            detail: err.detail,
            code: err.code
        });
    }
});


// ======================================================
// LOGOUT
// ======================================================

router.post('/logout', async (req, res) => {
    const clientIp = getClientIp(req);
    const userAgent = req.get('user-agent') || '';
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : req.headers.token;

    if (!token) {
        return res.status(401).json({ message: 'Token is required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const activeSession = await getActiveSession({ actorId: decoded.id, actorType: mapActorType(decoded.role || 'student') });
        await deactivateSessions({ actorId: decoded.id, actorType: mapActorType(decoded.role || 'student') });
        if (activeSession?.id) {
            await endSession(activeSession.id);
        }
        await logAuthentication({
            actorId: decoded.id,
            actorType: mapActorType(decoded.role || 'student'),
            action: 'SIGN_OUT',
            success: true,
            ipAddress: clientIp,
            userAgent,
            eventName: 'LOGOUT',
            endpoint: req.originalUrl,
            status: 200,
            userEmail: decoded.email,
            role: decoded.role,
        });

        return res.status(200).json({
            message: 'Logout successful'
        });
    } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
    }
});

router.post('/refresh', async (req, res) => {
    const clientIp = getClientIp(req);
    const userAgent = req.get('user-agent') || '';
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : req.headers.token;
    const refreshToken = req.body?.refreshToken;

    if (!token || !refreshToken) {
        return res.status(401).json({ message: 'Token and refresh token are required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const activeSession = await getActiveSession({ actorId: decoded.id, actorType: mapActorType(decoded.role || 'student') });

        if (!activeSession || !activeSession.refresh_token_hash) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        const tokenMatches = await compareRefreshTokens(refreshToken, activeSession.refresh_token_hash);
        if (!tokenMatches || new Date(activeSession.refresh_expires_at) < new Date()) {
            return res.status(401).json({ message: 'Invalid or expired refresh token' });
        }

        const newRefreshToken = jwt.sign({ sub: decoded.id, role: decoded.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const newRefreshTokenHash = await hashRefreshToken(newRefreshToken);
        const newRefreshExpiresAt = new Date(Date.now() + getRefreshTokenExpiry(decoded.role));
        const updatedSession = await rotateSessionRefresh(activeSession.id, {
            refreshTokenHash: newRefreshTokenHash,
            refreshExpiresAt: newRefreshExpiresAt,
            isActive: true,
        });

        await logAuthentication({
            actorId: decoded.id,
            actorType: mapActorType(decoded.role || 'student'),
            action: 'SIGN_IN',
            success: true,
            ipAddress: clientIp,
            userAgent,
            eventName: 'REFRESH_TOKEN_ROTATED',
            endpoint: req.originalUrl,
            status: 200,
            userEmail: decoded.email,
            role: decoded.role,
        });

        return res.status(200).json({
            success: true,
            token: jwt.sign({ id: decoded.id, email: decoded.email, role: decoded.role, authority_level: decoded.authority_level }, process.env.JWT_SECRET, { expiresIn: '1h' }),
            refreshToken: newRefreshToken,
            sessionId: updatedSession?.id,
        });
    } catch (err) {
        return res.status(401).json({ message: 'Invalid refresh token' });
    }
});
router.get("/debug/sessions", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        actor_id,
        actor_type,
        is_active,
        login_time,
        ip_address
      FROM user_session
      ORDER BY login_time DESC;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;