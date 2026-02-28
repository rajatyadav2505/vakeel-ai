import { test, expect } from '@playwright/test';

test('global disclaimer is visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/AI-generated content is assistive only/i)).toBeVisible();
});
