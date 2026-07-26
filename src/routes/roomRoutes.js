import express from 'express';
import {
  getRooms, addRoom, updateRoom, deleteRoom,
  assignResident, bulkUploadRooms, removeResident
} from '../controllers/roomController.js';
import auth from '../middleware/middleware.js';
import { requireWarden, requireHostelAccess } from '../roomallocation/middleware/roomAccess.js';

const router = express.Router({ mergeParams: true });

const readAccess = requireHostelAccess({ readOnly: true });
const writeAccess = requireHostelAccess({ readOnly: false });

// Room CRUD
router.get('/', auth, requireWarden, readAccess, getRooms);
router.post('/', auth, requireWarden, writeAccess, addRoom);
router.put('/:roomId', auth, requireWarden, writeAccess, updateRoom);
router.delete('/:roomId', auth, requireWarden, writeAccess, deleteRoom);
router.post('/bulk', auth, requireWarden, writeAccess, bulkUploadRooms);

// Resident Management
router.post('/:roomId/residents', auth, requireWarden, writeAccess, assignResident);
router.delete('/:roomId/residents/:studentId', auth, requireWarden, writeAccess, removeResident);

export default router;
