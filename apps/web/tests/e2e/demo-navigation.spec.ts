import { expect, test } from '@playwright/test';

test('demo page exposes the primary navigation affordance', async ({ page }) => {
  await page.goto('/demo');

  const openMainApp = page.getByRole('link', { name: /open main app/i });
  await expect(openMainApp).toBeVisible();
  await expect(openMainApp).toHaveAttribute('href', '/');
  await expect(page.getByText('demo')).toBeVisible();
});
