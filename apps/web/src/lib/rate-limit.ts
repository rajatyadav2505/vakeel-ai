import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

let redis: Redis | null = null;
if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const localBuckets = new Map<string, { count: number; expiresAt: number }>();
let warnedAboutFallback = false;

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of localBuckets) {
    if (bucket.expiresAt <= now) {
      localBuckets.delete(key);
    }
  }
}

function enforceInMemoryRateLimit(bucketKey: string, maxPerMinute: number) {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const existing = localBuckets.get(bucketKey);
  if (!existing) {
    localBuckets.set(bucketKey, { count: 1, expiresAt: now + 65_000 });
    return;
  }

  existing.count += 1;
  if (existing.count > maxPerMinute) {
    throw new Error('Rate limit exceeded. Please retry shortly.');
  }
}

export async function enforceRateLimit(key: string, maxPerMinute = 60) {
  const bucketKey = `rl:${key}:${new Date().toISOString().slice(0, 16)}`;
  if (!redis) {
    if (!warnedAboutFallback && process.env.NODE_ENV !== 'test') {
      warnedAboutFallback = true;
      console.warn(
        '[rate-limit] Upstash Redis is not configured. Falling back to in-memory rate limiting.',
      );
    }
    enforceInMemoryRateLimit(bucketKey, maxPerMinute);
    return;
  }

  await redis.set(bucketKey, 0, { ex: 65, nx: true });
  const count = await redis.incr(bucketKey);
  if (count > maxPerMinute) {
    throw new Error('Rate limit exceeded. Please retry shortly.');
  }
}
