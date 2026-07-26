const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000;

export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000);
}

export function storeOtp(email, otp, role, user, ttlMs = OTP_TTL_MS) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const code = String(otp);

  otpStore.set(normalizedEmail, {
    otp: code,
    role,
    user,
    id: user?.id ?? null,
    authority_level: user?.authority_level ?? null,
    expiresAt: Date.now() + ttlMs,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[OTP] ${normalizedEmail}: ${code}`);
  }
}

export function verifyOtp(email, otp) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const entry = otpStore.get(normalizedEmail);
  const code = String(otp);

  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalizedEmail);
    return null;
  }

  if (entry.otp !== code) return null;

  otpStore.delete(normalizedEmail);
  return {
    valid: true,
    payload: {
      email: normalizedEmail,
      role: entry.role,
      user: entry.user,
      id: entry.id,
      authority_level: entry.authority_level,
    }
  };
}

export function clearOtpStore() {
  otpStore.clear();
}
