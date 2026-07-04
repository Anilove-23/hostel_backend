import express from 'express';
import { 
  getRooms, addRoom, updateRoom, deleteRoom, 
  assignResident, bulkUploadRooms, removeResident 
} from '../controllers/roomController.js';

const router = express.Router({ mergeParams: true }); 

// Room CRUD
router.get('/', getRooms);
router.post('/', addRoom);
router.put('/:roomId', updateRoom);
router.delete('/:roomId', deleteRoom);
router.post('/bulk', bulkUploadRooms); // <-- NEW: Bulk Upload Route

// Resident Management
router.post('/:roomId/residents', assignResident);
router.delete('/:roomId/residents/:studentId', removeResident); // <-- NEW: Evict Route

export default router;