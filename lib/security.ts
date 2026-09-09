import crypto from 'crypto';

function getSecret(): string {
  // Prefer dedicated secret, fallback to CRON_SECRET, then RESEND_API_KEY (always present)
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || process.env.RESEND_API_KEY || 'fallback-secret-change-me';
}

export function generateUnsubscribeToken(email: string): string {
  const secret = getSecret();
  return crypto.createHmac('sha256', secret).update(email.toLowerCase().trim()).digest('hex').slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  if (!email || !token) return false;
  const expected = generateUnsubscribeToken(email);
  // timingSafeEqual to prevent timing attacks
  try {
    const a = Buffer.from(expected, 'utf-8');
    const b = Buffer.from(token, 'utf-8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return expected === token;
  }
}

export function getUnsubscribeUrl(email: string): string {
  const base = process.env.APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://avisos-esjf.vercel.app';
  // APP_URL may already include https://
  const appUrl = base.startsWith('http') ? base : `https://${base}`;
  const token = generateUnsubscribeToken(email);
  return `${appUrl.replace(/\/$/, '')}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

// Simple in-memory + Upstash rate limiter
const memoryHits = new Map<string, { count: number; resetAt: number }>();

async function upstashRateLimit(key: string, windowMs: number, limit: number): Promise<{ allowed: boolean; remaining: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    // Use INCR + EXPIRE pattern via pipeline
    const now = Date.now();
    const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`;
    const incrRes = await fetch(`${url}/incr/${windowKey}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!incrRes.ok) return null;
    const incrData = await incrRes.json() as { result: number };
    if (incrData.result === 1) {
      // First hit in window, set expire
      await fetch(`${url}/expire/${windowKey}/${Math.ceil(windowMs / 1000)}`, { headers: { Authorization: `Bearer ${token}` } });
    }
    const allowed = incrData.result <= limit;
    return { allowed, remaining: Math.max(0, limit - incrData.result) };
  } catch {
    return null;
  }
}

export async function checkRateLimit(ip: string, limit: number = 5, windowMs: number = 60_000): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  // Try Upstash first
  const upstash = await upstashRateLimit(ip, windowMs, limit);
  if (upstash) {
    return { allowed: upstash.allowed, remaining: upstash.remaining, resetIn: windowMs };
  }

  // Fallback to memory
  const now = Date.now();
  const entry = memoryHits.get(ip);
  if (!entry || now > entry.resetAt) {
    memoryHits.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetIn: windowMs };
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }
  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetIn: entry.resetAt - now };
}

// Cleanup old entries every 5 min
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryHits.entries()) {
      if (now > v.resetAt + 60_000) memoryHits.delete(k);
    }
  }, 5 * 60_000).unref?.();
}
