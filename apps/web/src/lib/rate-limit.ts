import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

let redis: Redis | null = null;
if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export async function enforceRateLimit(key: string, maxPerMinute = 60) {
  if (!redis) return;

  const bucketKey = `rl:${key}:${new Date().toISOString().slice(0, 16)}`;
  const count = await redis.incr(bucketKey);
  if (count === 1) {
    await redis.expire(bucketKey, 65);
  }
  if (count > maxPerMinute) {
    throw new Error('Rate limit exceeded. Please retry shortly.');
  }
}
