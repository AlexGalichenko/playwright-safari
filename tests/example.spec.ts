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

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');

  const url = await page.evaluate<string>('document.URL');
  expect(url).toMatch(/inventory\.html/);
});

test('locator', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  const username = page.locator('#user-name');
  const password = page.locator('#password');

  await username.fill('standard_user');
  await password.fill('secret_sauce');

  expect(await username.inputValue()).toBe('standard_user');
  expect(await password.inputValue()).toBe('secret_sauce');

  await page.locator('#login-button').click();
  await page.waitForSelector('.inventory_list');

  const heading = await page.locator('.title').innerText();
  expect(heading).toBe('Products');
});

test('getByPlaceholder', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.getByPlaceholder('Username').fill('standard_user');
  await page.getByPlaceholder('Password').fill('secret_sauce');

  expect(await page.getByPlaceholder('Username').inputValue()).toBe('standard_user');
  expect(await page.getByPlaceholder('Password').inputValue()).toBe('secret_sauce');

  await page.locator('#login-button').click();
  await page.waitForSelector('.inventory_list');
});

test('getByRole', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  // Login button has role="button" inferred from its input[type=submit]
  const loginBtn = page.getByRole('button').filter({ hasText: 'Login' });
  expect(await loginBtn.isVisible()).toBe(true);

  await page.getByPlaceholder('Username').fill('standard_user');
  await page.getByPlaceholder('Password').fill('secret_sauce');
  await loginBtn.click();
  await page.waitForSelector('.inventory_list');
});

test('getByText', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.getByPlaceholder('Username').fill('standard_user');
  await page.getByPlaceholder('Password').fill('secret_sauce');
  await page.locator('#login-button').click();
  await page.waitForSelector('.inventory_list');

  // Products heading
  const heading = page.getByText('Products', { exact: true });
  expect(await heading.isVisible()).toBe(true);

  // A specific product name
  const backpack = page.getByText('Sauce Labs Backpack');
  expect(await backpack.isVisible()).toBe(true);
});

test('filter with hasText', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.getByPlaceholder('Username').fill('standard_user');
  await page.getByPlaceholder('Password').fill('secret_sauce');
  await page.locator('#login-button').click();
  await page.waitForSelector('.inventory_list');

  // Find the inventory item that contains "Sauce Labs Backpack"
  const item = page.locator('.inventory_item').filter({ hasText: 'Sauce Labs Backpack' });
  expect(await item.isVisible()).toBe(true);

  const name = await item.locator('.inventory_item_name').innerText();
  expect(name).toBe('Sauce Labs Backpack');
});

test('first, last, nth', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.getByPlaceholder('Username').fill('standard_user');
  await page.getByPlaceholder('Password').fill('secret_sauce');
  await page.locator('#login-button').click();
  await page.waitForSelector('.inventory_list');

  const items = page.locator('.inventory_item_name');

  const count = await items.count();
  expect(count).toBeGreaterThan(0);

  const firstName = await items.first().innerText();
  const lastName = await items.last().innerText();
  const secondName = await items.nth(1).innerText();

  expect(firstName).toBeTruthy();
  expect(lastName).toBeTruthy();
  expect(secondName).toBeTruthy();
  // first and last should differ (6 products on the page)
  expect(firstName).not.toBe(lastName);
});

test('count and isVisible', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.getByPlaceholder('Username').fill('standard_user');
  await page.getByPlaceholder('Password').fill('secret_sauce');
  await page.locator('#login-button').click();
  await page.waitForSelector('.inventory_list');

  const count = await page.locator('.inventory_item').count();
  expect(count).toBe(6);

  expect(await page.locator('.inventory_list').isVisible()).toBe(true);
  expect(await page.locator('.nonexistent-element').isVisible()).toBe(false);
});
