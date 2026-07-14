type RateLimitEntry = {
  count: number;
  resetAt: number;
};

declare global {
  var __airArenaRateLimits: Map<string, RateLimitEntry> | undefined;
}

function store() {
  globalThis.__airArenaRateLimits ??= new Map<string, RateLimitEntry>();
  return globalThis.__airArenaRateLimits;
}

export function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const entries = store();
  const current = entries.get(key);
  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfter: 0 };
  }

  current.count += 1;
  entries.set(key, current);
  const allowed = current.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - current.count),
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function resetRateLimit(key: string) {
  store().delete(key);
}

export function clearRateLimits() {
  store().clear();
}
