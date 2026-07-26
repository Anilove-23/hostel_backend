import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/db/pool.js';
import legacyPool from '../src/db/db.js';
import redisClient from '../src/config/redis.js';

jest.spyOn(pool, 'query');
jest.spyOn(redisClient, 'del');

afterAll(async () => {
  await pool.end().catch(() => {});
  await legacyPool.end().catch(() => {});
  await redisClient.quit?.().catch(() => {});
});

const wardenToken = (overrides = {}) =>
  jwt.sign(
    { id: 7, email: 'warden@test.com', role: 'warden', authority_level: 3, hostel: null, ...overrides },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

const studentToken = jwt.sign(
  { id: 1, email: 'student@test.com', role: 'student' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const dummyHostelId = '11111111-1111-1111-1111-111111111111';
const dummyRoomId = '22222222-2222-2222-2222-222222222222';

describe('Resident management — assign/remove', () => {
  beforeEach(() => jest.clearAllMocks());

  test('1. Assigns an existing student to an empty room', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // no existing allocation
      .mockResolvedValueOnce({ rows: [{}] }); // assign_student_to_room(...)
    redisClient.del.mockResolvedValueOnce(1);

    const res = await request(app)
      .post(`/api/v1/hostels/${dummyHostelId}/rooms/${dummyRoomId}/residents`)
      .set({ Authorization: `Bearer ${wardenToken()}`, role: 'warden' })
      .send({ studentId: 42 });

    expect(res.status).toBe(200);
    expect(redisClient.del).toHaveBeenCalledWith(`hostel:${dummyHostelId}:rooms`);
  });

  test('2. Prevents assigning a student already allocated elsewhere, reporting their current room', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ hostel_name: 'Hostel A', room_number: 'A1' }],
    });

    const res = await request(app)
      .post(`/api/v1/hostels/${dummyHostelId}/rooms/${dummyRoomId}/residents`)
      .set({ Authorization: `Bearer ${wardenToken()}`, role: 'warden' })
      .send({ studentId: 42 });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Hostel A');
    expect(res.body.error).toContain('A1');
    expect(res.body.currentAllocation).toEqual({ hostelName: 'Hostel A', roomNumber: 'A1' });
    // Only the existence check ran — assign_student_to_room must not be called.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('3. Removing a student only updates room_assignment, never deletes the student row', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1 });
    redisClient.del.mockResolvedValueOnce(1);

    const res = await request(app)
      .delete(`/api/v1/hostels/${dummyHostelId}/rooms/${dummyRoomId}/residents/42`)
      .set({ Authorization: `Bearer ${wardenToken()}`, role: 'warden' });

    expect(res.status).toBe(200);
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE room_assignment/i);
    expect(sql).not.toMatch(/DELETE FROM student/i);
  });

  test('4. Removal is scoped: level-2 warden cannot evict in a hostel that is not their own', async () => {
    // requireHostelAccess resolves the warden's own hostel name to an id and
    // compares it against the route's :hostelId — mock a DIFFERENT id here.
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'a-completely-different-hostel-id' }] });

    const res = await request(app)
      .delete(`/api/v1/hostels/${dummyHostelId}/rooms/${dummyRoomId}/residents/42`)
      .set({ Authorization: `Bearer ${wardenToken({ authority_level: 2, hostel: 'Some Other Hostel' })}`, role: 'warden' });

    expect(res.status).toBe(403);
  });
});

describe('Student directory search', () => {
  beforeEach(() => jest.clearAllMocks());

  test('5. Returns a student with their current hostel/room when allocated', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 42, name: 'Rahul Sharma', roll_no: '12345', department: 'CSE',
        hostel_id: 'h1', hostel_name: 'H1', room_id: 'r1', room_number: '204', room_status: 'Student',
      }],
    });

    const res = await request(app)
      .get('/api/students/directory?q=Rahul')
      .set({ Authorization: `Bearer ${wardenToken()}`, role: 'warden' });

    expect(res.status).toBe(200);
    expect(res.body.students[0]).toEqual({
      id: 42,
      name: 'Rahul Sharma',
      rollNo: '12345',
      department: 'CSE',
      allocation: { hostelId: 'h1', hostelName: 'H1', roomId: 'r1', roomNumber: '204', roomStatus: 'Student' },
    });
  });

  test('6. Shows "not allocated" (allocation: null) for a student with no current room', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 43, name: 'Priya Patel', roll_no: '99999', department: 'ECE',
        hostel_id: null, hostel_name: null, room_id: null, room_number: null, room_status: null }],
    });

    const res = await request(app)
      .get('/api/students/directory?q=Priya')
      .set({ Authorization: `Bearer ${wardenToken()}`, role: 'warden' });

    expect(res.status).toBe(200);
    expect(res.body.students[0].allocation).toBeNull();
  });

  test('7. Returns every match when multiple students share a similar name', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, name: 'Rahul Sharma', roll_no: '111', department: 'CSE', hostel_id: null, hostel_name: null, room_id: null, room_number: null, room_status: null },
        { id: 2, name: 'Rahul Shah', roll_no: '112', department: 'ECE', hostel_id: null, hostel_name: null, room_id: null, room_number: null, room_status: null },
      ],
    });

    const res = await request(app)
      .get('/api/students/directory?q=Rahul')
      .set({ Authorization: `Bearer ${wardenToken()}`, role: 'warden' });

    expect(res.body.students).toHaveLength(2);
  });

  test('8. Query is wrapped for a case-insensitive partial match (ILIKE + wildcards)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/students/directory?q=raHUL')
      .set({ Authorization: `Bearer ${wardenToken()}`, role: 'warden' });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/ILIKE/i);
    expect(params).toEqual(['%raHUL%']);
  });

  test('9. Rejects queries shorter than 2 characters', async () => {
    const res = await request(app)
      .get('/api/students/directory?q=a')
      .set({ Authorization: `Bearer ${wardenToken()}`, role: 'warden' });
    expect(res.status).toBe(400);
  });

  test('10. No token -> 401', async () => {
    const res = await request(app).get('/api/students/directory?q=Rahul');
    expect(res.status).toBe(401);
  });

  test('11. Wrong role (student) -> 403', async () => {
    const res = await request(app)
      .get('/api/students/directory?q=Rahul')
      .set({ Authorization: `Bearer ${studentToken}`, role: 'student' });
    expect(res.status).toBe(403);
  });

  test('12. A level-1 (view-only) warden can still search across all hostels', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/students/directory?q=Rahul')
      .set({ Authorization: `Bearer ${wardenToken({ authority_level: 1, hostel: null })}`, role: 'warden' });
    expect(res.status).toBe(200);
  });
});
