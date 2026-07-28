import test from 'node:test';
import assert from 'node:assert/strict';

import { generateOtp, storeOtp, verifyOtp, clearOtpStore } from '../src/utils/otp.js';

test('generateOtp returns a 6-digit code', () => {
  const otp = generateOtp();
  assert.equal(String(otp).length, 6);
  assert.match(String(otp), /^\d{6}$/);
});

test('storeOtp and verifyOtp work for a valid code', () => {
  clearOtpStore();
  const email = 'student@nith.ac.in';
  const otp = generateOtp();
  const user = { id: 1, email };

  storeOtp(email, otp, 'student', user);

  const result = verifyOtp(email, otp);

  assert.ok(result);
  assert.equal(result.payload.role, 'student');
  assert.equal(result.payload.email, email);
  assert.equal(result.payload.id, user.id);
});

test('verifyOtp rejects an expired or wrong code', () => {
  clearOtpStore();
  const email = 'student@nith.ac.in';
  const otp = '123456';
  const user = { id: 2, email };

  storeOtp(email, otp, 'student', user, 0);

  assert.equal(verifyOtp(email, '000000'), null);
});
