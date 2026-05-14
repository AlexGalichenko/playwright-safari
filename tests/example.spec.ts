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
  
  await new Promise(r => setTimeout(r, 3000)); // Wait for page load + WS connection.
  const title = await page.evaluate<string>('document.title');
  expect(title).toMatch(/Swag Labs/);


  await page.fill('#user-name', 'standard_user');
    await new Promise(r => setTimeout(r, 3000)); // Wait for page load + WS connection.

  await page.fill('#password', 'secret_sauce!');
    await new Promise(r => setTimeout(r, 3000)); // Wait for page load + WS connection.

  await page.click('#login-button');

  await new Promise(r => setTimeout(r, 3000)); // Wait for page load + WS connection.

  //expect(await page.evaluate<string>("document.querySelector('#user-name').value")).toBe('standard_user');
  //expect(await page.evaluate<string>("document.querySelector('#password').value")).toBe('secret_sauce!');
});
