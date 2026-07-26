import { jest } from '@jest/globals'; // <-- Explicitly import jest for ES Modules
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/db/pool.js';
import legacyPool from '../src/db/db.js';
import redisClient from '../src/config/redis.js';

// Intercept database and cache calls so we don't alter real data
jest.spyOn(pool, 'query');
jest.spyOn(pool, 'connect');
jest.spyOn(redisClient, 'get');
jest.spyOn(redisClient, 'setEx');
jest.spyOn(redisClient, 'del');

// app.js transitively imports working-routes/complaint.js, which opens its
// own real connection via the legacy src/db/db.js pool (unmocked). Without
// closing it, that in-flight connection races Jest's process teardown and
// crashes after the suite already reports its results.
afterAll(async () => {
  await pool.end().catch(() => {});
  await legacyPool.end().catch(() => {});
  await redisClient.quit?.().catch(() => {});
});

// Room routes are RBAC-protected (auth + requireWarden + requireHostelAccess).
// Sign a level-3 ("other admin") token so tests exercise full cross-hostel
// access without needing to mock the level-2 hostel-name lookup query.
const wardenToken = jwt.sign(
  { id: 1, email: 'warden@test.com', role: 'warden', authority_level: 3, hostel: null },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
const authHeaders = { Authorization: `Bearer ${wardenToken}`, role: 'warden' };

describe('Warden Room Management API Tests', () => {
  const dummyHostelId = '11111111-1111-1111-1111-111111111111';
  const dummyRoomId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    jest.clearAllMocks();
  });


  test('1. GET /rooms - Should fetch rooms and use cache if empty', async () => {
    redisClient.get.mockResolvedValueOnce(null);
    pool.query.mockResolvedValueOnce({ rows: [{ id: dummyRoomId, roomNumber: '101' }] });
    redisClient.setEx.mockResolvedValueOnce('OK');

    const response = await request(app)
      .get(`/api/v1/hostels/${dummyHostelId}/rooms`)
      .set(authHeaders);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
  });

  test('2. POST /rooms - Should add a new room and clear cache', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: dummyRoomId, roomNumber: '102' }] });
    redisClient.del.mockResolvedValueOnce(1);

    const response = await request(app)
      .post(`/api/v1/hostels/${dummyHostelId}/rooms`)
      .set(authHeaders)
      .send({ roomNumber: '102', capacity: 2, status: 'STUDENT' });

    expect(response.status).toBe(201);
    expect(response.body.roomNumber).toBe('102');
    expect(redisClient.del).toHaveBeenCalled();
  });

  test('3. PUT /rooms/:roomId - Should update room details', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: dummyRoomId, capacity: 3 }] });
    redisClient.del.mockResolvedValueOnce(1);

    const response = await request(app)
      .put(`/api/v1/hostels/${dummyHostelId}/rooms/${dummyRoomId}`)
      .set(authHeaders)
      .send({ capacity: 3, status: 'GUEST' });

    expect(response.status).toBe(200);
    expect(response.body.capacity).toBe(3);
  });

  test('4. POST /bulk - Should bulk upload multiple rooms safely', async () => {
    const mockClient = { query: jest.fn(), release: jest.fn() };
    pool.connect.mockResolvedValueOnce(mockClient);
    redisClient.del.mockResolvedValueOnce(1);

    const response = await request(app)
      .post(`/api/v1/hostels/${dummyHostelId}/rooms/bulk`)
      .set(authHeaders)
      .send({
        rooms: [
          { roomNumber: '103', capacity: 2, status: 'STUDENT' },
          { roomNumber: '104', capacity: 1, status: 'GUEST' }
        ]
      });

    expect(response.status).toBe(201);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  test('5. DELETE /residents/:studentId - Should evict a student', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1 });
    redisClient.del.mockResolvedValueOnce(1);

    const response = await request(app)
      .delete(`/api/v1/hostels/${dummyHostelId}/rooms/${dummyRoomId}/residents/555`)
      .set(authHeaders);

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('evicted');
  });

  describe('RBAC enforcement', () => {
    test('6. GET /rooms - no token -> 401', async () => {
      const response = await request(app).get(`/api/v1/hostels/${dummyHostelId}/rooms`);
      expect(response.status).toBe(401);
    });

    test('7. GET /rooms - wrong role -> 403', async () => {
      const studentToken = jwt.sign(
        { id: 2, email: 'student@test.com', role: 'student' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      const response = await request(app)
        .get(`/api/v1/hostels/${dummyHostelId}/rooms`)
        .set({ Authorization: `Bearer ${studentToken}`, role: 'student' });
      expect(response.status).toBe(403);
    });

    test('8. POST /rooms - authority_level 1 (view-only) -> 403', async () => {
      const viewOnlyToken = jwt.sign(
        { id: 3, email: 'chiefwarden@test.com', role: 'warden', authority_level: 1, hostel: null },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      const response = await request(app)
        .post(`/api/v1/hostels/${dummyHostelId}/rooms`)
        .set({ Authorization: `Bearer ${viewOnlyToken}`, role: 'warden' })
        .send({ roomNumber: '105', capacity: 2, status: 'STUDENT' });
      expect(response.status).toBe(403);
    });

    test('9. POST /rooms - authority_level 2, mismatched hostel -> 403', async () => {
      const scopedToken = jwt.sign(
        { id: 4, email: 'scopedwarden@test.com', role: 'warden', authority_level: 2, hostel: 'Some Other Hostel' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'different-hostel-uuid' }] });

      const response = await request(app)
        .post(`/api/v1/hostels/${dummyHostelId}/rooms`)
        .set({ Authorization: `Bearer ${scopedToken}`, role: 'warden' })
        .send({ roomNumber: '106', capacity: 2, status: 'STUDENT' });
      expect(response.status).toBe(403);
    });
  });
});
