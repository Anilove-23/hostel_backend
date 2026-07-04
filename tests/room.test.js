import { jest } from '@jest/globals'; // <-- Explicitly import jest for ES Modules
import request from 'supertest';
import app from '../src/app.js'; 
import pool from '../src/db/pool.js';
import redisClient from '../src/config/redis.js';

// Intercept database and cache calls so we don't alter real data
jest.spyOn(pool, 'query');
jest.spyOn(pool, 'connect');
jest.spyOn(redisClient, 'get');
jest.spyOn(redisClient, 'setEx');
jest.spyOn(redisClient, 'del');

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

    const response = await request(app).get(`/api/v1/hostels/${dummyHostelId}/rooms`);
    
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
      .delete(`/api/v1/hostels/${dummyHostelId}/rooms/${dummyRoomId}/residents/555`);
    
    expect(response.status).toBe(200);
    expect(response.body.message).toContain('evicted');
  });
});