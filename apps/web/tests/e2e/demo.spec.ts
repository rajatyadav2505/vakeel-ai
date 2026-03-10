import { expect, test } from '@playwright/test';

test('demo page renders war-room sample blocks', async ({ page }) => {
  await page.goto('/demo');

  await expect(page.getByRole('heading', { name: 'Live UI Sample' })).toBeVisible();
  await expect(page.getByText('Interactive war-room canvas')).toBeVisible();
  await expect(page.getByText('Agent discussion thread')).toBeVisible();
  await expect(page.getByText(/Rao v Horizon Habitat Developers/i)).toBeVisible();
  await expect(page.getByText('KAUTILYA_CERES board')).toBeVisible();
  await expect(page.getByText('Petitioner strategies')).toBeVisible();
});
