import { Router } from "express";
import { testLateReturnNotification } from "../controllers/notification.controller.js";

const router = Router();

// Demo/testing route for the late-return email notification feature.
// Intentionally left open (no auth) since it's meant to be trivially
// demoable — remove or lock behind an admin-only auth middleware before any
// real deployment.
router.post("/demo/late-return", testLateReturnNotification);

export default router;
