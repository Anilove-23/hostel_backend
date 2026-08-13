import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import dotenv from "dotenv";
dotenv.config();



import importRoutes from "./imports/import.routes.js";

import outpassRoutes from "./routes/outpass.routes.js";
import studentRoutes from "./routes/student.routes.js";
import chiefWardenRoutes from "./routes/chiefWarden.routes.js";

// Working Routes
import authRoutes from "../working-routes/auth.js";
import complaintRoutes from "../working-routes/complaint.js";
import outpassRoutesWorking from "../working-routes/outpass.js";
import dayScholarRoutes from "../working-routes/day_scholar.js";

// === Custom Warden Room Management Routes ===
import wardenRoomRoutes from "./routes/roomRoutes.js";

// Face Authentication Routes
import faceAuthRoutes from "./face-auth/routes/face.routes.js";

// Logging Routes
import { logRouter } from "./logging/index.js";

// Late-return Notification Routes
import { notificationRouter } from "./notifications/index.js";

const app = express();

/*
=====================================================
GLOBAL MIDDLEWARES
=====================================================
*/

// Security headers — works on both localhost and production.
// On localhost, HSTS is not enforced by browsers so it is safe.
app.use(helmet());

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (Postman, curl, server-to-server)
            if (!origin) return callback(null, true);

            // In production, only allow the configured frontend URL
            if (process.env.NODE_ENV === "production") {
                return origin === process.env.FRONTEND_URL
                    ? callback(null, true)
                    : callback(new Error("Not allowed by CORS"));
            }

            // In development, allow any localhost/127.0.0.1 origin
            if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }

            // Also allow the explicitly configured frontend URL if set
            if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
                return callback(null, true);
            }

            callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    })
);

app.use(express.json({ limit: "1mb" }));

app.use(
    express.urlencoded({
        extended: true,
        limit: "1mb",
    })
);

app.use(cookieParser());

/*
=====================================================
HEALTH CHECK
=====================================================
*/
app.get("/", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "Hostel Backend Running Successfully",
    });
});

/*
=====================================================
API ROUTES
=====================================================
*/
// Auth Routes (mounted at both /auth and /api/auth for compatibility)
app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes);

// Working Routes
app.use("/complaint", complaintRoutes);
app.use("/outpass", outpassRoutesWorking);
app.use("/api/v1/dayscholar", dayScholarRoutes);

// Outpass Routes
app.use("/api/outpasses", outpassRoutes);

// Complaint Routes
app.use("/api/complaints", complaintRoutes);

// Student Routes
app.use("/api/students", studentRoutes);

// Face Authentication
app.use("/api/face-auth", faceAuthRoutes);

// Logging System
app.use("/api/logs", logRouter);

// Late-return Notification System
app.use("/api/notifications", notificationRouter);


app.use("/api/chief-warden", chiefWardenRoutes);

// Import Routes
app.use("/api/import", importRoutes);

// === Warden Room Management Module ===
app.use("/api/v1/hostels/:hostelId/rooms", wardenRoomRoutes);

/*
=====================================================
404 HANDLER
=====================================================
*/
app.use((req, res) => {
    return res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

/*
=====================================================
GLOBAL ERROR HANDLER
=====================================================
*/
app.use((err, req, res, next) => {
    console.error(err);

    return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
        errors: err.errors || [],
    });
});

export default app;