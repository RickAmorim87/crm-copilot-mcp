import { HttpError } from './errors.js';

/** Fixed-window in-memory rate limiter. Swap the Map for Redis to scale horizontally. */
export function createRateLimiter({ windowMs, max, keyFn }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.reset - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return next(new HttpError(429, `Rate limit exceeded. Retry in ${retryAfter}s`));
    }
    next();
  };
}
