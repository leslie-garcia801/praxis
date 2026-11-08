import { expect, test } from '@playwright/test';

test('the app shell loads the sign-in screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});
