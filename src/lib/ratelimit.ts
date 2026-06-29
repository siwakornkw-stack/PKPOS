// Tiny in-memory fixed-window rate limiter. Good enough for a single-instance
// deploy; for multi-instance production back it with Redis.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }
  if (b.count >= limit) return false; // blocked
  b.count++;
  return true;
}

// Derive the client IP for rate-limit keys. X-Forwarded-For is client-spoofable, so
// only trust it according to the proxy topology: set TRUST_PROXY_HOPS to the number of
// trusted proxies in front (the real client is that many entries from the right). Default
// 0 = leftmost, which is correct on platforms that overwrite client-supplied XFF (Vercel).
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) {
      const hops = Number(process.env.TRUST_PROXY_HOPS) || 0;
      const idx = hops > 0 ? Math.max(0, parts.length - 1 - hops) : 0;
      return parts[idx];
    }
  }
  return headers.get("x-real-ip") || "unknown";
}
