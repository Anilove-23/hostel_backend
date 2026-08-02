import { Router } from "express";
import auth from "../middleware/middleware.js";

import {
    getOutpassDetails,
    addChiefWardenRemark
} from "../controllers/chiefWarden.controller.js";

const router = Router();

router.get(
    "/outpasses/:id",
    auth,
    getOutpassDetails
);

router.post(
    "/outpasses/:id/remarks",
    auth,
    addChiefWardenRemark
);

export default router;