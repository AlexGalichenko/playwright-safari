import { test, expect } from './fixtures';

// Tests against the local test app served at http://localhost:3000.
// The server is started automatically via the webServer option in playwright.config.ts.
// Requires: Safari ▸ Develop ▸ Allow Remote Automation.

const BASE = 'http://localhost:3000';

// ════════════════════════════════════════════════════════════════════════════
// Login page
// ════════════════════════════════════════════════════════════════════════════

test('local — has title', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/`);

  const title = await page.evaluate<string>('document.title');
  expect(title).toMatch(/Swag Labs/);
});

test('local — login form elements', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/`);

  expect(await page.locator('#user-name').isVisible()).toBe(true);
  expect(await page.locator('#password').isVisible()).toBe(true);
  expect(await page.locator('#login-button').isVisible()).toBe(true);

  // input[type=submit] → inferred role "button"; value is checked via el.value
  const loginBtn = page.getByRole('button').filter({ hasText: 'Login' });
  expect(await loginBtn.isVisible()).toBe(true);

  const type = await page.locator('#login-button').getAttribute('type');
  expect(type).toBe('submit');
});

test('local — getByPlaceholder', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/`);

  expect(await page.getByPlaceholder('Username').isVisible()).toBe(true);
  expect(await page.getByPlaceholder('Password').isVisible()).toBe(true);
});

test('local — fill and login', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/`);

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');

  expect(await page.locator('#user-name').inputValue()).toBe('standard_user');
  expect(await page.locator('#password').inputValue()).toBe('secret_sauce');

  await page.click('#login-button');
  await page.waitForSelector('.inventory_list');

  const url = await page.evaluate<string>('document.URL');
  expect(url).toMatch(/inventory\.html/);
});

test('local — keyboard login', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/`);

  await page.click('#user-name');
  await page.keyboard.type('standard_user');

  await page.click('#password');
  await page.keyboard.type('secret_sauce');

  await page.keyboard.press('Enter');
  await page.waitForSelector('.inventory_list');

  const url = await page.evaluate<string>('document.URL');
  expect(url).toMatch(/inventory\.html/);
});

// ════════════════════════════════════════════════════════════════════════════
// Inventory page
// ════════════════════════════════════════════════════════════════════════════

test('local — inventory title and count', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/inventory.html`);

  await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  expect(await page.locator('.title').textContent()).toContain('Products');

  const count = await page.locator('.inventory_item').count();
  expect(count).toBe(6);
});

test('local — inventory getByText', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/inventory.html`);

  const heading = page.getByText('Products', { exact: true });
  expect(await heading.isVisible()).toBe(true);

  const backpack = page.getByText('Sauce Labs Backpack');
  expect(await backpack.isVisible()).toBe(true);
});

test('local — inventory first, last, nth', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/inventory.html`);

  const names = page.locator('.inventory_item_name');

  expect(await names.count()).toBe(6);

  const firstName  = await names.first().innerText();
  const lastName   = await names.last().innerText();
  const secondName = await names.nth(1).innerText();

  expect(firstName).toBeTruthy();
  expect(lastName).toBeTruthy();
  expect(secondName).toBeTruthy();
  expect(firstName).not.toBe(lastName);
});

test('local — inventory allInnerTexts', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/inventory.html`);

  const texts = await page.locator('.inventory_item_name').allInnerTexts();

  expect(Array.isArray(texts)).toBe(true);
  expect(texts.length).toBe(6);
  expect(texts.some(t => t.includes('Backpack') || t.includes('Sauce'))).toBe(true);
});

test('local — inventory filter with hasText', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/inventory.html`);

  const item = page.locator('.inventory_item').filter({ hasText: 'Sauce Labs Backpack' });
  expect(await item.isVisible()).toBe(true);

  const name = await item.locator('.inventory_item_name').innerText();
  expect(name).toBe('Sauce Labs Backpack');
});

test('local — add to cart updates badge and button', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/inventory.html`);

  // Initially the add button is visible, remove button hidden
  expect(await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').isVisible()).toBe(true);
  expect(await page.locator('[data-test="remove-sauce-labs-backpack"]').isVisible()).toBe(false);

  await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
  await page.waitForSelector('[data-test="remove-sauce-labs-backpack"]:not([style*="display: none"]):not([style*="display:none"])');

  expect(await page.locator('[data-test="remove-sauce-labs-backpack"]').isVisible()).toBe(true);
  expect(await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').isVisible()).toBe(false);

  await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');
});

// ════════════════════════════════════════════════════════════════════════════
// Full checkout flow
// ════════════════════════════════════════════════════════════════════════════

test('local — full checkout flow', async ({ proxyPage: page }) => {
  // Full flow spans 6 pages and 5 proxy navigations — needs more than the
  // 10 s global default.
  test.setTimeout(60_000);

  // ── Login ────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/`);
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  // .inventory_list is absent on the login page → correctly waits for navigation
  await page.waitForSelector('.inventory_list');

  await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  expect(await page.locator('.inventory_item').count()).toBe(6);

  // ── Add items ────────────────────────────────────────────────────────────
  await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
  await page.waitForSelector('[data-test="remove-sauce-labs-backpack"]');

  await page.locator('[data-test="add-to-cart-sauce-labs-bike-light"]').click();
  await page.waitForSelector('[data-test="remove-sauce-labs-bike-light"]');

  await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('2');

  // ── Cart ─────────────────────────────────────────────────────────────────
  await page.locator('[data-test="shopping-cart-link"]').click();
  // [data-test="inventory-item"] only appears after cart.html's DOMContentLoaded renders items.
  // inventory.html has no such elements → this wait survives the navigation boundary.
  await page.waitForSelector('[data-test="inventory-item"]');

  await expect(page.locator('[data-test="title"]')).toHaveText('Your Cart');

  const cartItems = page.locator('[data-test="inventory-item"]');
  await expect(cartItems).toHaveCount(2);
  await expect(cartItems.filter({ hasText: 'Sauce Labs Backpack' })).toBeVisible();
  await expect(cartItems.filter({ hasText: 'Sauce Labs Bike Light' })).toBeVisible();

  // ── Checkout: Your Information ───────────────────────────────────────────
  await page.locator('[data-test="checkout"]').click();
  // [data-test="continue"] is the submit button — only on checkout-step-one, not on cart.html
  await page.waitForSelector('[data-test="continue"]');

  await expect(page.locator('[data-test="title"]')).toHaveText('Checkout: Your Information');

  await page.fill('#first-name', 'John');
  await page.fill('#last-name', 'Doe');
  await page.fill('#postal-code', '12345');

  await expect(page.locator('#first-name')).toHaveValue('John');
  await expect(page.locator('#last-name')).toHaveValue('Doe');
  await expect(page.locator('#postal-code')).toHaveValue('12345');

  await page.locator('[data-test="continue"]').click();
  // [data-test="inventory-item"] only appears after checkout-step-two.html's DOMContentLoaded.
  // checkout-step-one has no such elements → this wait survives the navigation boundary.
  // The same DOMContentLoaded handler also fills subtotal/tax/total, so those are ready too.
  await page.waitForSelector('[data-test="inventory-item"]');

  // ── Checkout: Overview ────────────────────────────────────────────────────
  await expect(page.locator('[data-test="title"]')).toHaveText('Checkout: Overview');
  await expect(page.locator('[data-test="inventory-item"]')).toHaveCount(2);

  await expect(page.locator('[data-test="inventory-item"]').filter({ hasText: 'Sauce Labs Backpack' })).toBeVisible();
  await expect(page.locator('[data-test="inventory-item"]').filter({ hasText: 'Sauce Labs Bike Light' })).toBeVisible();

  await expect(page.locator('[data-test="subtotal-label"]')).toContainText(/Item total: \$39\.98/);
  await expect(page.locator('[data-test="tax-label"]')).toContainText(/Tax: \$/);
  await expect(page.locator('[data-test="total-label"]')).toContainText(/Total: \$/);

  // ── Finish ────────────────────────────────────────────────────────────────
  await page.locator('[data-test="finish"]').click();
  await page.waitForSelector('[data-test="complete-header"]');

  // ── Confirmation ──────────────────────────────────────────────────────────
  await expect(page.locator('[data-test="complete-header"]')).toHaveText('Thank you for your order!');
  await expect(page.locator('[data-test="complete-text"]')).toContainText(/dispatched/i);

  const buf = await page.screenshot();
  await test.info().attach('checkout-complete.png', { body: buf, contentType: 'image/png' });
});

// ════════════════════════════════════════════════════════════════════════════
// Route interception against local server
// ════════════════════════════════════════════════════════════════════════════

test('local — route fulfill', async ({ proxyPage: page }) => {
  page.route(`${BASE}/`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><head></head><body><h1 id="mock">Mocked Login</h1></body></html>',
    });
  });

  await page.goto(`${BASE}/`);
  await page.waitForSelector('#mock');
  expect(await page.locator('#mock').innerText()).toBe('Mocked Login');
});

test('local — route abort CSS', async ({ proxyPage: page }) => {
  const abortedUrls: string[] = [];

  page.route(/\.css$/, async route => {
    abortedUrls.push(route.request.url);
    await route.abort();
  });

  await page.goto(`${BASE}/inventory.html`);

  expect(abortedUrls.length).toBeGreaterThan(0);
  expect(abortedUrls.every(u => u.endsWith('.css'))).toBe(true);
});

test('local — waitForRequest and waitForResponse', async ({ proxyPage: page }) => {
  const [, request, response] = await Promise.all([
    page.goto(`${BASE}/`),
    page.waitForRequest(`${BASE}/`),
    page.waitForResponse(url => url === `${BASE}/`),
  ]);

  expect(request.url).toContain('localhost:3000');
  expect(request.method).toBe('GET');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/text\/html/);
});

// ════════════════════════════════════════════════════════════════════════════
// contentEditable editing
// ════════════════════════════════════════════════════════════════════════════

test('local — contentEditable keyboard.type', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/content-editable.html`);

  const editor = page.locator('[data-test="editor"]');
  expect(await editor.isVisible()).toBe(true);

  await editor.click();
  await page.keyboard.type('Hello, world!');

  await expect(editor).toHaveText('Hello, world!');
  await expect(page.locator('[data-test="char-count"]')).toContainText('13');
});

test('local — contentEditable pressSequentially', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/content-editable.html`);

  const editor = page.locator('[data-test="editor"]');
  await editor.click();
  await editor.pressSequentially('Playwright');

  await expect(editor).toHaveText('Playwright');
  await expect(page.locator('[data-test="char-count"]')).toContainText('10');
});

test('local — contentEditable evaluate textContent', async ({ proxyPage: page }) => {
  await page.goto(`${BASE}/content-editable.html`);

  const editor = page.locator('[data-test="editor"]');
  await editor.click();
  await page.keyboard.type('Hello Safari');

  // Verify via evaluate in addition to locator matcher
  const text = await page.evaluate<string>(
    `document.querySelector('[data-test="editor"]').textContent`
  );
  expect(text).toBe('Hello Safari');
  await expect(editor).toHaveText('Hello Safari');
});
