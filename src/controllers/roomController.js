import pool from '../db/pool.js'; 
import redisClient from '../config/redis.js';

// 1. Fetch all rooms
export const getRooms = async (req, res) => {
  try {
    const { hostelId } = req.params;
    const cacheKey = `hostel:${hostelId}:rooms`;

    const cachedRooms = await redisClient.get(cacheKey);
    if (cachedRooms) {
      console.log('⚡ Data served lightning fast from Redis Cache!');
      return res.status(200).json(JSON.parse(cachedRooms));
    }

    const query = `
      SELECT 
        r.id, r.room_number as "roomNumber", r.max_capacity as "capacity", 
        r.current_occupancy, r.room_type as "status", r.hostel_id as "hostelId",
        COALESCE(
          json_agg(
            json_build_object('id', s.id, 'name', s.name, 'rollNo', s.roll_no, 'branch', s.department)
          ) FILTER (WHERE s.id IS NOT NULL), '[]'
        ) as residents
      FROM room r
      LEFT JOIN room_assignment ra ON r.id = ra.room_id AND ra.assignment_status IN ('ACTIVE', 'UPCOMING')
      LEFT JOIN student s ON ra.student_id = s.id
      WHERE r.hostel_id = $1
      GROUP BY r.id
      ORDER BY r.room_number ASC;
    `;
    
    const { rows } = await pool.query(query, [hostelId]);

    await redisClient.setEx(cacheKey, 3600, JSON.stringify(rows));
    console.log('🗄️ Data served from PostgreSQL and saved to Cache');

    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
};

// 2. Add a new room
export const addRoom = async (req, res) => {
  try {
    const { hostelId } = req.params;
    const { roomNumber, capacity, status } = req.body;

    const formattedStatus = status === 'STUDENT' ? 'Student' : 
                            status === 'GUEST' ? 'Guest' : 'Reserved';

    const query = `
      INSERT INTO room (hostel_id, room_number, max_capacity, room_type)
      VALUES ($1, $2, $3, $4)
      RETURNING id, room_number as "roomNumber", max_capacity as "capacity", room_type as "status";
    `;
    
    const { rows } = await pool.query(query, [hostelId, roomNumber, capacity, formattedStatus]);
    
    await redisClient.del(`hostel:${hostelId}:rooms`);
    
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error adding room:", error);
    res.status(500).json({ error: 'Failed to add room' });
  }
};

// 3. Update room details
export const updateRoom = async (req, res) => {
  try {
    // Grab hostelId from the URL params now
    const { hostelId, roomId } = req.params;
    const { capacity, status } = req.body; 

    const formattedStatus = status === 'STUDENT' ? 'Student' : 
                            status === 'GUEST' ? 'Guest' : 'Reserved';

    const query = `
      UPDATE room 
      SET max_capacity = $1, room_type = $2
      WHERE id = $3
      RETURNING id, room_number as "roomNumber", max_capacity as "capacity", room_type as "status";
    `;
    
    const { rows } = await pool.query(query, [capacity, formattedStatus, roomId]);
    
    if (hostelId) await redisClient.del(`hostel:${hostelId}:rooms`);

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error updating room:", error);
    res.status(500).json({ error: 'Failed to update room' });
  }
};

// 4. Delete a room
export const deleteRoom = async (req, res) => {
  try {
    const { hostelId, roomId } = req.params; 

    await pool.query('DELETE FROM room WHERE id = $1', [roomId]);
    
    if (hostelId) await redisClient.del(`hostel:${hostelId}:rooms`);
    
    res.status(200).json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error("Error deleting room:", error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
};

// 5. Assign a student to a room
export const assignResident = async (req, res) => {
  try {
    const { hostelId, roomId } = req.params;
    const { studentId } = req.body; 

    const query = `SELECT assign_student_to_room($1, $2, 'ADMIN');`;
    await pool.query(query, [studentId, roomId]);
    
    if (hostelId) await redisClient.del(`hostel:${hostelId}:rooms`);
    
    res.status(200).json({ message: 'Student successfully assigned to room' });
  } catch (error) {
    console.error("Error assigning student:", error);
    res.status(400).json({ error: error.message });
  }
};

// 6. Bulk Upload Rooms (From CSV)
export const bulkUploadRooms = async (req, res) => {
  const client = await pool.connect(); 
  try {
    const { hostelId } = req.params;
    const { rooms } = req.body; 

    if (!rooms || rooms.length === 0) {
      return res.status(400).json({ error: 'No rooms provided for upload' });
    }

    await client.query('BEGIN'); 

    for (const room of rooms) {
      const formattedStatus = room.status === 'STUDENT' ? 'Student' : 
                              room.status === 'GUEST' ? 'Guest' : 'Reserved';

      const query = `
        INSERT INTO room (hostel_id, room_number, max_capacity, room_type)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (hostel_id, block, room_number) DO NOTHING; 
      `;
      
      await client.query(query, [hostelId, room.roomNumber, room.capacity, formattedStatus]);
    }

    await client.query('COMMIT'); 
    await redisClient.del(`hostel:${hostelId}:rooms`); 

    res.status(201).json({ message: `Successfully bulk uploaded rooms` });
  } catch (error) {
    await client.query('ROLLBACK'); 
    console.error("Error in bulk upload:", error);
    res.status(500).json({ error: 'Failed to bulk upload rooms' });
  } finally {
    client.release();
  }
};

// 7. Evict / Remove a Student from a Room
export const removeResident = async (req, res) => {
  try {
    // Both are grabbed safely from the URL params now
    const { hostelId, roomId, studentId } = req.params;

    const query = `
      UPDATE room_assignment 
      SET assignment_status = 'PAST', ended_at = CURRENT_TIMESTAMP
      WHERE room_id = $1 AND student_id = $2 AND assignment_status IN ('ACTIVE', 'UPCOMING')
      RETURNING id;
    `;
    
    const { rowCount } = await pool.query(query, [roomId, studentId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Active student assignment not found in this room' });
    }
    
    if (hostelId) await redisClient.del(`hostel:${hostelId}:rooms`);
    
    res.status(200).json({ message: 'Student successfully evicted/removed from room' });
  } catch (error) {
    console.error("Error removing student:", error);
    res.status(500).json({ error: 'Failed to remove student' });
  }
};