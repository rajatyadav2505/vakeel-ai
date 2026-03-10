import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('enforceRateLimit', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses the in-memory fallback when Redis is unavailable', async () => {
    const { enforceRateLimit } = await import('./rate-limit');

    await enforceRateLimit('fallback-user', 2);
    await enforceRateLimit('fallback-user', 2);
    await expect(enforceRateLimit('fallback-user', 2)).rejects.toThrow(
      'Rate limit exceeded. Please retry shortly.',
    );
  });
});
