import { test, expect } from './fixtures';

// Tests open a real Safari window via safaridriver.
// Requires: Safari ▸ Develop ▸ Allow Remote Automation.

test('has title', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  const title = await page.evaluate<string>('document.title');
  expect(title).toMatch(/Playwright/);
});

test('fill via proxy', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  const title = await page.evaluate<string>('document.title');
  expect(title).toMatch(/Swag Labs/);

  await new Promise(resolve => setTimeout(resolve, 4000));

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');

  const title2 = await page.evaluate<string>('document.URL');
  expect(title2).toMatch(/inventory.html/);
});
