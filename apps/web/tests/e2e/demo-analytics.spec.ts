import { expect, test } from '@playwright/test';

test('demo page renders the strategy analytics panels', async ({ page }) => {
  await page.goto('/demo');

  await expect(page.getByText('Payoff matrix')).toBeVisible();
  await expect(page.getByText('Outcome probability band')).toBeVisible();
  await expect(page.getByText(/calibration pending/i)).toBeVisible();
});
