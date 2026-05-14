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

test('route — fulfill', async ({ proxyPage: page }) => {
  page.route('https://www.saucedemo.com/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><head></head><body><h1 id="mock">Mocked</h1></body></html>',
    });
  });

  await page.goto('https://www.saucedemo.com/');
  await page.waitForSelector('#mock');
  expect(await page.locator('#mock').innerText()).toBe('Mocked');
});

test('route — abort', async ({ proxyPage: page }) => {
  const abortedUrls: string[] = [];
  // Abort all CSS requests — page HTML and client script still load so goto completes.
  page.route(/\.css$/, async route => {
    abortedUrls.push(route.request.url);
    await route.abort();
  });

  await page.goto('https://playwright.dev/');
  expect(abortedUrls.length).toBeGreaterThan(0);
  expect(abortedUrls.every(u => u.endsWith('.css'))).toBe(true);
});

test('route — continue', async ({ proxyPage: page }) => {
  let intercepted = false;
  page.route('https://www.saucedemo.com/', async route => {
    intercepted = true;
    await route.continue();
  });

  await page.goto('https://www.saucedemo.com/');
  const title = await page.evaluate<string>('document.title');
  expect(title).toMatch(/Swag Labs/);
  expect(intercepted).toBe(true);
});

test('waitForRequest and waitForResponse', async ({ proxyPage: page }) => {
  const [, request, response] = await Promise.all([
    page.goto('https://playwright.dev/'),
    page.waitForRequest('playwright.dev'),
    page.waitForResponse(url => url === 'https://playwright.dev/'),
  ]);

  expect(request.url).toContain('playwright.dev');
  expect(request.method).toBe('GET');

  expect(response.url).toBe('https://playwright.dev/');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/text\/html/);
});

test('screenshot', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  await page.waitForSelector('.highlight_gXVj');
  const buf = await page.screenshot();

  // PNG magic bytes: 89 50 4E 47
  expect(buf[0]).toBe(0x89);
  expect(buf[1]).toBe(0x50); // P
  expect(buf[2]).toBe(0x4e); // N
  expect(buf[3]).toBe(0x47); // G
  expect(buf.byteLength).toBeGreaterThan(1000);

  await test.info().attach('screenshot.png', { body: buf, contentType: 'image/png' });
});

test('wikipedia search', async ({ proxyPage: page }) => {
  await page.goto('https://www.wikipedia.org/');

  await page.locator('#searchInput').fill('Playwright');
  await page.locator('button[type="submit"]').click();
  await page.waitForSelector('#firstHeading');

  const title = await page.locator('#firstHeading').innerText();
  expect(title).toMatch(/Playwright/);

  // Article has a content body
  expect(await page.locator('#mw-content-text').isVisible()).toBe(true);

  // TOC or first paragraph mentions theatre/software
  const intro = await page.locator('#mw-content-text p').first().innerText();
  expect(intro.length).toBeGreaterThan(0);
});

test('full checkout flow', async ({ proxyPage: page }) => {
  // ── Login ────────────────────────────────────────────────────────────────
  await page.goto('https://www.saucedemo.com/');
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  await page.waitForSelector('[data-test="inventory-list"]');

  expect(await page.locator('[data-test="title"]').innerText()).toBe('Products');
  expect(await page.locator('[data-test="inventory-item"]').count()).toBe(6);

  // ── Add items to cart ────────────────────────────────────────────────────
  await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
  await page.locator('[data-test="add-to-cart-sauce-labs-bike-light"]').click();

  expect(await page.locator('[data-test="shopping-cart-badge"]').innerText()).toBe('2');

  // ── Cart ─────────────────────────────────────────────────────────────────
  await page.locator('[data-test="shopping-cart-link"]').click();
  await page.waitForSelector('[data-test="cart-list"]');

  expect(await page.locator('[data-test="title"]').innerText()).toBe('Your Cart');

  const cartItems = page.locator('[data-test="inventory-item"]');
  expect(await cartItems.count()).toBe(2);
  expect(await cartItems.filter({ hasText: 'Sauce Labs Backpack' }).isVisible()).toBe(true);
  expect(await cartItems.filter({ hasText: 'Sauce Labs Bike Light' }).isVisible()).toBe(true);

  // ── Checkout: Your Information ────────────────────────────────────────────
  await page.locator('[data-test="checkout"]').click();
  await page.waitForSelector('[data-test="checkout-info-container"]');

  expect(await page.locator('[data-test="title"]').innerText()).toBe('Checkout: Your Information');

  await page.fill('#first-name', 'John');
  await page.fill('#last-name', 'Doe');
  await page.fill('#postal-code', '12345');
  await page.locator('[data-test="continue"]').click();
  await page.waitForSelector('[data-test="checkout-summary-container"]');

  // ── Checkout: Overview ────────────────────────────────────────────────────
  expect(await page.locator('[data-test="title"]').innerText()).toBe('Checkout: Overview');
  expect(await page.locator('[data-test="inventory-item"]').count()).toBe(2);

  // Verify line items and totals are present
  expect(await page.locator('[data-test="inventory-item"]').filter({ hasText: 'Sauce Labs Backpack' }).isVisible()).toBe(true);
  expect(await page.locator('[data-test="inventory-item"]').filter({ hasText: 'Sauce Labs Bike Light' }).isVisible()).toBe(true);

  const subtotal = await page.locator('[data-test="subtotal-label"]').innerText();
  expect(subtotal).toMatch(/Item total: \$39\.98/);

  const tax = await page.locator('[data-test="tax-label"]').innerText();
  expect(tax).toMatch(/Tax: \$/);

  const total = await page.locator('[data-test="total-label"]').innerText();
  expect(total).toMatch(/Total: \$/);

  // ── Finish ────────────────────────────────────────────────────────────────
  await page.locator('[data-test="finish"]').click();
  await page.waitForSelector('[data-test="checkout-complete-container"]');

  // ── Confirmation ──────────────────────────────────────────────────────────
  expect(await page.locator('[data-test="complete-header"]').innerText()).toBe('Thank you for your order!');

  const confirmText = await page.locator('[data-test="complete-text"]').innerText();
  expect(confirmText).toMatch(/dispatched/i);
  await page.waitForSelector('[data-test="complete-text"]');

  const buf = await page.screenshot();
  await test.info().attach('screenshot.png', { body: buf, contentType: 'image/png' });
});

test('keyboard.type and press Enter', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.click('#user-name');
  await page.keyboard.type('standard_user');

  expect(await page.locator('#user-name').inputValue()).toBe('standard_user');

  await page.click('#password');
  await page.keyboard.type('secret_sauce');

  expect(await page.locator('#password').inputValue()).toBe('secret_sauce');

  // Enter on the focused input submits the form
  await page.keyboard.press('Enter');
  await page.waitForSelector('.inventory_list');

  const url = await page.evaluate<string>('document.URL');
  expect(url).toMatch(/inventory\.html/);
});

test('keyboard.insertText', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.click('#user-name');
  await page.keyboard.insertText('standard_user');

  expect(await page.locator('#user-name').inputValue()).toBe('standard_user');
});

test('keyboard.down + up (modifier)', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.click('#user-name');
  await page.keyboard.type('hello');

  // Shift+Home selects to the start; the key event fires even if browser focus
  // management for untrusted events doesn't move the cursor — the main thing
  // we verify is no error is thrown and the modifier state cleans up correctly.
  await page.keyboard.down('Shift');
  await page.keyboard.press('End');
  await page.keyboard.up('Shift');

  // Value should still be 'hello' — no mutation from the selection shortcut
  expect(await page.locator('#user-name').inputValue()).toBe('hello');
});

test('keyboard.press Backspace', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'hello');
  await page.click('#user-name');

  // Move cursor to end then delete last char
  await page.evaluate('document.querySelector("#user-name").setSelectionRange(5, 5)');
  await page.keyboard.press('Backspace');

  expect(await page.locator('#user-name').inputValue()).toBe('hell');
});

test('mouse.click by coordinates', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');

  // Get center of login button, then click via coordinates
  const center = await page.evaluate<{ x: number; y: number }>(
    `(() => { const r = document.querySelector('#login-button').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`
  );

  await page.mouse.click(center.x, center.y);
  await page.waitForSelector('.inventory_list');

  const url = await page.evaluate<string>('document.URL');
  expect(url).toMatch(/inventory\.html/);
});

test('mouse.move fires mousemove events', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.evaluate(
    `(() => { window._moveCount = 0; document.addEventListener('mousemove', () => window._moveCount++); })()`
  );

  await page.mouse.move(300, 200, { steps: 4 });

  const count = await page.evaluate<number>('window._moveCount');
  expect(count).toBe(4);
});

test('mouse.dblclick', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  // Track dblclick events on the username input
  await page.evaluate(
    `(() => { window._dblclickFired = false; document.querySelector('#user-name').addEventListener('dblclick', () => { window._dblclickFired = true; }); })()`
  );

  const center = await page.evaluate<{ x: number; y: number }>(
    `(() => { const r = document.querySelector('#user-name').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`
  );

  await page.mouse.dblclick(center.x, center.y);

  expect(await page.evaluate<boolean>('window._dblclickFired')).toBe(true);
});

test('mouse.wheel', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');
  await page.waitForSelector('nav');

  // Track wheel events — synthetic wheel events may not scroll natively in Safari,
  // but the event should fire on the document.
  await page.evaluate(
    `(() => { window._wheelFired = false; document.addEventListener('wheel', () => { window._wheelFired = true; }, { once: true }); })()`
  );

  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, 500);

  expect(await page.evaluate<boolean>('window._wheelFired')).toBe(true);
});
