import { expect, test } from '@playwright/test';

test('health API returns service status', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    ok: boolean;
    service: string;
    time: string;
  };

  expect(payload.ok).toBe(true);
  expect(payload.service).toBe('nyaya-web');
  expect(Date.parse(payload.time)).not.toBeNaN();
});
