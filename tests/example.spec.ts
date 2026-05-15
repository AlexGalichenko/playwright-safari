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

  // Wait for the login button to be present
  await page.waitForSelector('#login-button');

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
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');

  await expect(page.locator('[data-test="title"]')).toHaveText('Products');
  await expect(page.locator('[data-test="inventory-item"]')).toHaveCount(6);

  // ── Add items to cart ────────────────────────────────────────────────────
  await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
  await page.waitForSelector('[data-test="remove-sauce-labs-backpack"]');

  const state1 = await page.evaluate<object>(`({
    badge: document.querySelector('[data-test="shopping-cart-badge"]')?.textContent,
    removeBackpack: !!document.querySelector('[data-test="remove-sauce-labs-backpack"]'),
    cartContents: localStorage.getItem('cart-contents'),
    lsLength: localStorage.length,
    allLsKeys: Array.from({length: localStorage.length}, (_, i) => localStorage.key(i)),
    lsTryWrite: (function() {
      try { localStorage.setItem('__test__', '42'); var v = localStorage.getItem('__test__'); localStorage.removeItem('__test__'); return v; }
      catch(e) { return 'ERROR: ' + e.message; }
    })(),
  })`);
  console.log('after backpack click:', JSON.stringify(state1));

  await page.locator('[data-test="add-to-cart-sauce-labs-bike-light"]').click();
  await page.waitForSelector('[data-test="remove-sauce-labs-bike-light"]');

  const state2 = await page.evaluate<object>(`({
    badge: document.querySelector('[data-test="shopping-cart-badge"]')?.textContent,
    addBackpack: !!document.querySelector('[data-test="add-to-cart-sauce-labs-backpack"]'),
    removeBackpack: !!document.querySelector('[data-test="remove-sauce-labs-backpack"]'),
    addBikeLight: !!document.querySelector('[data-test="add-to-cart-sauce-labs-bike-light"]'),
    removeBikeLight: !!document.querySelector('[data-test="remove-sauce-labs-bike-light"]'),
    removeCount: document.querySelectorAll('[data-test^="remove-"]').length,
    cartContents: localStorage.getItem('cart-contents'),
    bikelightBtnText: document.querySelector('[data-test^="sauce-labs-bike-light"]')?.textContent,
    bikelightBtnTestId: document.querySelector('[data-test^="sauce-labs-bike-light"]')?.getAttribute('data-test'),
  })`);
  console.log('after bike-light click:', JSON.stringify(state2));

  await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('2');


  // ── Cart ─────────────────────────────────────────────────────────────────
  await page.locator('[data-test="shopping-cart-link"]').click();

  await expect(page.locator('[data-test="title"]')).toHaveText('Your Cart');

  const cartItems = page.locator('[data-test="inventory-item"]');
  await expect(cartItems).toHaveCount(2);
  await expect(cartItems.filter({ hasText: 'Sauce Labs Backpack' })).toBeVisible();
  await expect(cartItems.filter({ hasText: 'Sauce Labs Bike Light' })).toBeVisible();

  // ── Checkout: Your Information ────────────────────────────────────────────
  await page.locator('[data-test="checkout"]').click();

  await expect(page.locator('[data-test="title"]')).toHaveText('Checkout: Your Information');

  await page.fill('#first-name', 'John');
  await page.fill('#last-name', 'Doe');
  await page.fill('#postal-code', '12345');

  await expect(page.locator('#first-name')).toHaveValue('John');
  await expect(page.locator('#last-name')).toHaveValue('Doe');
  await expect(page.locator('#postal-code')).toHaveValue('12345');

  await page.locator('[data-test="continue"]').click();

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

  // ── Confirmation ──────────────────────────────────────────────────────────
  await expect(page.locator('[data-test="complete-header"]')).toHaveText('Thank you for your order!');
  await expect(page.locator('[data-test="complete-text"]')).toContainText(/dispatched/i);

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

  // Wait for the username input to be present
  await page.waitForSelector('#user-name');

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

// ════════════════════════════════════════════════════════════════════════════
// Tests for dialog handling
// ════════════════════════════════════════════════════════════════════════════

test('dialog — alert accept', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Set up listener before triggering dialog
  let dialogFired = false;
  let dialogType = '';
  let dialogMessage = '';

  page.on('dialog', async dialog => {
    dialogFired = true;
    dialogType = dialog.type;
    dialogMessage = dialog.message;
    await dialog.accept();
  });

  // Trigger the dialog via JavaScript string
  setTimeout(() => {
    page.evaluate('alert("Test Alert Message")');
  }, 50);

  // Give the event handler time to process
  await new Promise(r => setTimeout(r, 500));

  expect(dialogFired).toBe(true);
  expect(dialogType).toBe('alert');
  expect(dialogMessage).toBe('Test Alert Message');
});

test('dialog — confirm dismiss', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  let dialogConfirmed = false;

  page.on('dialog', async dialog => {
    expect(dialog.type).toBe('confirm');
    expect(dialog.message).toBe('Do you confirm?');
    await dialog.dismiss();
  });

  // Trigger dialog and capture result
  setTimeout(() => {
    page.evaluate('window._confirmResult = confirm("Do you confirm?")');
  }, 50);

  await new Promise(r => setTimeout(r, 500));

  dialogConfirmed = await page.evaluate<boolean>('window._confirmResult ?? false');

  // If dismiss works, confirm returns false
  expect(dialogConfirmed).toBe(false);
});

test('dialog — prompt with text', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  let promptResult = '';

  page.on('dialog', async dialog => {
    expect(dialog.type).toBe('prompt');
    expect(dialog.message).toBe('Enter your name:');
    // Accept with text
    await dialog.accept('John Doe');
  });

  setTimeout(() => {
    page.evaluate('window._promptResult = prompt("Enter your name:", "DefaultName")');
  }, 50);

  await new Promise(r => setTimeout(r, 500));

  promptResult = await page.evaluate<string>('window._promptResult ?? ""');

  expect(promptResult).toBe('John Doe');
});

// ════════════════════════════════════════════════════════════════════════════
// Tests for console message handling
// ════════════════════════════════════════════════════════════════════════════

test('console message — log', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  const messages: string[] = [];

  page.on('console', msg => {
    messages.push(`[${msg.type}] ${msg.text}`);
  });

  await page.evaluate('console.log("Test log message")');

  await new Promise(r => setTimeout(r, 100));

  expect(messages.some(m => m.includes('Test log message'))).toBe(true);
});

test('console message — error', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  const messages: string[] = [];

  page.on('console', msg => {
    if (msg.type === 'error') {
      messages.push(msg.text);
    }
  });

  await page.evaluate('console.error("Test error message")');

  await new Promise(r => setTimeout(r, 100));

  expect(messages.some(m => m.includes('Test error message'))).toBe(true);
});

test('console message — warning', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  const messages: string[] = [];

  page.on('console', msg => {
    if (msg.type === 'warning') {
      messages.push(msg.text);
    }
  });

  await page.evaluate('console.warn("Test warning message")');

  await new Promise(r => setTimeout(r, 100));

  expect(messages.some(m => m.includes('Test warning message'))).toBe(true);
});

test('console message — multiple args', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  let capturedMessage = '';

  page.on('console', msg => {
    capturedMessage = msg.text;
  });

  await page.evaluate('console.log("Hello", "World", "!")');

  await new Promise(r => setTimeout(r, 100));

  expect(capturedMessage).toContain('Hello');
  expect(capturedMessage).toContain('World');
});

// ════════════════════════════════════════════════════════════════════════════
// Tests for locator state query methods
// ════════════════════════════════════════════════════════════════════════════

test('locator.isChecked', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Create a checkbox for testing
  await page.evaluate('const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.id = "test-checkbox"; checkbox.checked = false; document.body.appendChild(checkbox);');

  const checkbox = page.locator('#test-checkbox');

  expect(await checkbox.isChecked()).toBe(false);

  // Check the checkbox via JavaScript
  await page.evaluate('document.querySelector("#test-checkbox").checked = true;');

  expect(await checkbox.isChecked()).toBe(true);
});

test('locator.isEnabled and isDisabled', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Create enabled and disabled inputs
  await page.evaluate('const enabledInput = document.createElement("input"); enabledInput.id = "enabled-input"; enabledInput.type = "text"; enabledInput.disabled = false; document.body.appendChild(enabledInput); const disabledInput = document.createElement("input"); disabledInput.id = "disabled-input"; disabledInput.type = "text"; disabledInput.disabled = true; document.body.appendChild(disabledInput);');

  expect(await page.locator('#enabled-input').isEnabled()).toBe(true);
  expect(await page.locator('#enabled-input').isDisabled()).toBe(false);

  expect(await page.locator('#disabled-input').isEnabled()).toBe(false);
  expect(await page.locator('#disabled-input').isDisabled()).toBe(true);
});

test('locator.isEditable', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Create editable and readonly inputs
  await page.evaluate('const editableInput = document.createElement("input"); editableInput.id = "editable-input"; editableInput.type = "text"; editableInput.readOnly = false; document.body.appendChild(editableInput); const readonlyInput = document.createElement("input"); readonlyInput.id = "readonly-input"; readonlyInput.type = "text"; readonlyInput.readOnly = true; document.body.appendChild(readonlyInput);');

  expect(await page.locator('#editable-input').isEditable()).toBe(true);
  expect(await page.locator('#readonly-input').isEditable()).toBe(false);
});

test('locator.isHidden', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Create visible and hidden elements
  await page.evaluate('const visibleEl = document.createElement("div"); visibleEl.id = "visible-element"; visibleEl.textContent = "Visible"; document.body.appendChild(visibleEl); const hiddenEl = document.createElement("div"); hiddenEl.id = "hidden-element"; hiddenEl.textContent = "Hidden"; hiddenEl.style.display = "none"; document.body.appendChild(hiddenEl);');

  expect(await page.locator('#visible-element').isHidden()).toBe(false);
  expect(await page.locator('#hidden-element').isHidden()).toBe(true);
});

// ════════════════════════════════════════════════════════════════════════════
// Tests for locator action methods
// ════════════════════════════════════════════════════════════════════════════

test('locator.check', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Create an unchecked checkbox
  await page.evaluate('const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.id = "check-test-checkbox"; checkbox.checked = false; document.body.appendChild(checkbox);');

  const checkbox = page.locator('#check-test-checkbox');

  expect(await checkbox.isChecked()).toBe(false);

  // Check the checkbox
  await checkbox.check();

  expect(await checkbox.isChecked()).toBe(true);
});

test('locator.uncheck', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Create a checked checkbox
  await page.evaluate('const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.id = "uncheck-test-checkbox"; checkbox.checked = true; document.body.appendChild(checkbox);');

  const checkbox = page.locator('#uncheck-test-checkbox');

  expect(await checkbox.isChecked()).toBe(true);

  // Uncheck the checkbox
  await checkbox.uncheck();

  expect(await checkbox.isChecked()).toBe(false);
});

test('locator.setChecked', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Create an unchecked checkbox
  await page.evaluate('const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.id = "set-checked-test-checkbox"; checkbox.checked = false; document.body.appendChild(checkbox);');

  const checkbox = page.locator('#set-checked-test-checkbox');

  expect(await checkbox.isChecked()).toBe(false);

  // Set to checked
  await checkbox.setChecked(true);
  expect(await checkbox.isChecked()).toBe(true);

  // Set to unchecked
  await checkbox.setChecked(false);
  expect(await checkbox.isChecked()).toBe(false);
});

test('locator.getAttribute', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  const button = page.locator('#login-button');

  // Get the type attribute
  const type = await button.getAttribute('type');
  expect(type).toBe('submit');

  // Get a non-existent attribute
  const customAttr = await button.getAttribute('data-non-existent');
  expect(customAttr).toBeNull();
});

test('locator.textContent', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  await page.waitForSelector('.title');

  const titleElement = page.locator('.title');
  const textContent = await titleElement.textContent();

  expect(textContent).toContain('Products');
});

test('locator.innerHTML', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Create an element with HTML content
  await page.evaluate('const container = document.createElement("div"); container.id = "html-container"; container.innerHTML = "<strong>Bold Text</strong> and <em>Italic Text</em>"; document.body.appendChild(container);');

  const html = await page.locator('#html-container').innerHTML();

  expect(html).toContain('<strong>Bold Text</strong>');
  expect(html).toContain('<em>Italic Text</em>');
});

test('locator.boundingBox', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  const button = page.locator('#login-button');
  const box = await button.boundingBox();

  expect(box).not.toBeNull();
  expect(box).toHaveProperty('x');
  expect(box).toHaveProperty('y');
  expect(box).toHaveProperty('width');
  expect(box).toHaveProperty('height');

  if (box) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  }
});

test('locator.allInnerTexts', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  await page.waitForSelector('.inventory_item_name');

  const names = await page.locator('.inventory_item_name').allInnerTexts();

  expect(Array.isArray(names)).toBe(true);
  expect(names.length).toBeGreaterThan(0);
  expect(names.some(n => n.includes('Backpack') || n.includes('Sauce'))).toBe(true);
});

test('locator.allTextContents', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Create multiple elements with text content
  await page.evaluate('const container = document.createElement("div"); container.id = "text-container"; container.innerHTML = "<span>Item 1</span><span>Item 2</span><span>Item 3</span>"; document.body.appendChild(container);');

  const contents = await page.locator('#text-container span').allTextContents();

  expect(Array.isArray(contents)).toBe(true);
  expect(contents).toContain('Item 1');
  expect(contents).toContain('Item 2');
  expect(contents).toContain('Item 3');
});

// ════════════════════════════════════════════════════════════════════════════
// Tests for viewport/window size
// ════════════════════════════════════════════════════════════════════════════

test('setViewportSize', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Get initial window dimensions
  const initialWidth = await page.evaluate<number>('window.innerWidth');
  const initialHeight = await page.evaluate<number>('window.innerHeight');

  expect(initialWidth).toBeGreaterThan(0);
  expect(initialHeight).toBeGreaterThan(0);

  // Set viewport to specific dimensions
  await page.setViewportSize({ width: 640, height: 480 });

  // Allow a brief moment for the viewport to resize
  await new Promise(r => setTimeout(r, 500));

  // Verify the new viewport dimensions
  const newWidth = await page.evaluate<number>('window.innerWidth');
  const newHeight = await page.evaluate<number>('window.innerHeight');

  // Note: Due to browser chrome (tabs, toolbars), the actual innerWidth/innerHeight
  // may not exactly match the set window size, but should be close
  expect(newWidth).toBeLessThanOrEqual(640);
  expect(newHeight).toBeLessThanOrEqual(480);
});

// ════════════════════════════════════════════════════════════════════════════
// Tests for locator.evaluate / evaluateAll / screenshot / scrollIntoViewIfNeeded
// setInputFiles / tap
// ════════════════════════════════════════════════════════════════════════════

test('locator.evaluate — string fn', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  const tagName = await page.locator('#user-name').evaluate<string>('el => el.tagName.toLowerCase()');
  expect(tagName).toBe('input');
});

test('locator.evaluate — function with arg', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  const result = await page.locator('#user-name').evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el: HTMLInputElement, attr: any) => el.getAttribute(attr),
    'type',
  );
  expect(result).toBe('text');
});

test('locator.evaluateAll', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  await page.waitForSelector('.inventory_item_name');

  const names = await page.locator('.inventory_item_name').evaluateAll<string[]>(
    (els: HTMLElement[]) => els.map(el => el.textContent?.trim() ?? ''),
  );

  expect(Array.isArray(names)).toBe(true);
  expect(names.length).toBeGreaterThan(0);
  expect(names.some(n => n.includes('Sauce'))).toBe(true);
});

test('locator.screenshot — crops to element', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  const fullBuf = await page.screenshot();
  const elBuf = await page.locator('#login-button').screenshot();

  // Valid PNG magic bytes
  expect(elBuf[0]).toBe(0x89);
  expect(elBuf[1]).toBe(0x50);
  expect(elBuf[2]).toBe(0x4e);
  expect(elBuf[3]).toBe(0x47);

  // Element crop must be smaller than the full-page screenshot
  expect(elBuf.byteLength).toBeLessThan(fullBuf.byteLength);
  expect(elBuf.byteLength).toBeGreaterThan(0);
});

test('locator.scrollIntoViewIfNeeded', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Pick a footer-area element that is likely off screen on first load
  await page.evaluate(`
    const el = document.createElement('div');
    el.id = 'deep-footer';
    el.textContent = 'Deep Footer';
    el.style.marginTop = '5000px';
    document.body.appendChild(el);
  `);

  const el = page.locator('#deep-footer');
  await el.scrollIntoViewIfNeeded();

  // After scroll, element should be within the viewport
  const inView = await page.evaluate(`
    (() => {
      const el = document.getElementById('deep-footer');
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight + 50;
    })()
  `);
  expect(inView).toBe(true);
});

test('locator.setInputFiles', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  // Inject a file input
  await page.evaluate(`
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'file-input';
    document.body.appendChild(input);
  `);

  const fileContent = Buffer.from('hello playwright-safari');
  await page.locator('#file-input').setInputFiles({
    name: 'test.txt',
    mimeType: 'text/plain',
    buffer: fileContent,
  });

  const fileName = await page.evaluate<string>(`document.getElementById('file-input').files[0].name`);
  const fileSize = await page.evaluate<number>(`document.getElementById('file-input').files[0].size`);

  expect(fileName).toBe('test.txt');
  expect(fileSize).toBe(fileContent.byteLength);
});

test('locator.tap — fires click on Safari desktop', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  await page.evaluate(`
    const btn = document.createElement('button');
    btn.id = 'tap-target';
    btn.textContent = 'Tap Me';
    window._tapClicked = false;
    btn.addEventListener('click', () => { window._tapClicked = true; });
    document.body.appendChild(btn);
  `);

  await page.locator('#tap-target').tap();

  const clicked = await page.evaluate<boolean>('window._tapClicked');
  expect(clicked).toBe(true);
});

// ════════════════════════════════════════════════════════════════════════════
// Tests for iframe support: page.frame(), page.mainFrame(), page.frameLocator(),
// page.frames()
// ════════════════════════════════════════════════════════════════════════════

test('page.mainFrame — basic actions', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  const frame = page.mainFrame();
  await frame.fill('#user-name', 'standard_user');
  await frame.fill('#password', 'secret_sauce');
  await frame.click('#login-button');
  await frame.waitForSelector('.inventory_list');

  const title = await frame.evaluate<string>('document.title');
  expect(title).toMatch(/Swag Labs/);
});

test('page.frame — named iframe fill and evaluate', async ({ proxyPage: page }) => {
  page.route(url => url === 'https://example-iframe-host.test/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><head></head><body>
        <iframe name="child" src="https://example-iframe-host.test/child"></iframe>
      </body></html>`,
    });
  });
  page.route(url => url === 'https://example-iframe-host.test/child', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><head></head><body>
        <input id="iframe-input" type="text" />
        <p id="iframe-text">Hello from iframe</p>
      </body></html>`,
    });
  });

  await page.goto('https://example-iframe-host.test/');
  await page.waitForLoadState('networkidle');

  const frame = page.frame({ name: 'child' });
  await frame.fill('#iframe-input', 'typed in iframe');

  const val = await frame.evaluate<string>(`document.getElementById('iframe-input').value`);
  expect(val).toBe('typed in iframe');

  const text = await frame.evaluate<string>(`document.getElementById('iframe-text').textContent`);
  expect(text).toBe('Hello from iframe');
});

test('page.frame — locator chain inside iframe', async ({ proxyPage: page }) => {
  page.route(url => url === 'https://example-iframe-host.test/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><head></head><body>
        <iframe name="child" src="https://example-iframe-host.test/child"></iframe>
      </body></html>`,
    });
  });
  page.route(url => url === 'https://example-iframe-host.test/child', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><head></head><body>
        <ul id="list">
          <li class="item">Alpha</li>
          <li class="item">Beta</li>
          <li class="item">Gamma</li>
        </ul>
      </body></html>`,
    });
  });

  await page.goto('https://example-iframe-host.test/');
  await page.waitForLoadState('networkidle');

  const frame = page.frame({ name: 'child' });
  const items = frame.locator('.item');

  const count = await items.count();
  expect(count).toBe(3);

  const firstText = await items.first().innerText();
  expect(firstText).toBe('Alpha');

  const texts = await items.allInnerTexts();
  expect(texts).toEqual(['Alpha', 'Beta', 'Gamma']);
});

test('page.frameLocator — textContent via CSS selector', async ({ proxyPage: page }) => {
  page.route(url => url === 'https://example-iframe-host.test/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><head></head><body>
        <iframe id="my-frame" src="https://example-iframe-host.test/child"></iframe>
      </body></html>`,
    });
  });
  page.route(url => url === 'https://example-iframe-host.test/child', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><head></head><body>
        <h1 id="heading">Frame Heading</h1>
      </body></html>`,
    });
  });

  await page.goto('https://example-iframe-host.test/');
  await page.waitForLoadState('networkidle');

  const text = await page.frameLocator('#my-frame').locator('#heading').innerText();
  expect(text).toBe('Frame Heading');
});

test('page.frames — lists main frame plus iframes', async ({ proxyPage: page }) => {
  page.route(url => url === 'https://example-iframe-host.test/', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<html><head></head><body>
        <iframe name="frame-a" src="https://example-iframe-host.test/a"></iframe>
        <iframe name="frame-b" src="https://example-iframe-host.test/b"></iframe>
      </body></html>`,
    });
  });
  page.route(url => url === 'https://example-iframe-host.test/a', async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>A</body></html>' });
  });
  page.route(url => url === 'https://example-iframe-host.test/b', async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>B</body></html>' });
  });

  await page.goto('https://example-iframe-host.test/');
  await page.waitForLoadState('networkidle');

  const frames = await page.frames();
  // Main frame + 2 iframes
  expect(frames.length).toBeGreaterThanOrEqual(3);

  const names = frames.map(f => f.name());
  expect(names).toContain('frame-a');
  expect(names).toContain('frame-b');
});

// ════════════════════════════════════════════════════════════════════════════
// Tests for custom Locator matchers
// ════════════════════════════════════════════════════════════════════════════

test('expect(locator).toBeVisible / toBeHidden', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  await page.evaluate(`
    const vis = document.createElement('div');
    vis.id = 'visible-el';
    vis.textContent = 'visible';
    document.body.appendChild(vis);
    const hid = document.createElement('div');
    hid.id = 'hidden-el';
    hid.textContent = 'hidden';
    hid.style.display = 'none';
    document.body.appendChild(hid);
  `);

  await expect(page.locator('#visible-el')).toBeVisible();
  await expect(page.locator('#hidden-el')).toBeHidden();
  await expect(page.locator('#hidden-el')).not.toBeVisible();
  await expect(page.locator('#visible-el')).not.toBeHidden();
});

test('expect(locator).toBeEnabled / toBeDisabled', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  await page.evaluate(`
    const en = document.createElement('input'); en.id = 'en-input'; document.body.appendChild(en);
    const dis = document.createElement('input'); dis.id = 'dis-input'; dis.disabled = true; document.body.appendChild(dis);
  `);

  await expect(page.locator('#en-input')).toBeEnabled();
  await expect(page.locator('#dis-input')).toBeDisabled();
  await expect(page.locator('#dis-input')).not.toBeEnabled();
  await expect(page.locator('#en-input')).not.toBeDisabled();
});

test('expect(locator).toBeChecked', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  await page.evaluate(`
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'matcher-cb';
    document.body.appendChild(cb);
  `);

  await expect(page.locator('#matcher-cb')).toBeChecked({ checked: false });
  await page.evaluate(`document.getElementById('matcher-cb').checked = true`);
  await expect(page.locator('#matcher-cb')).toBeChecked();
});

test('expect(locator).toBeEditable', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  await page.evaluate(`
    const ed = document.createElement('input'); ed.id = 'editable'; document.body.appendChild(ed);
    const ro = document.createElement('input'); ro.id = 'readonly'; ro.readOnly = true; document.body.appendChild(ro);
  `);

  await expect(page.locator('#editable')).toBeEditable();
  await expect(page.locator('#readonly')).not.toBeEditable();
});

test('expect(locator).toBeFocused', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  await page.evaluate(`
    const inp = document.createElement('input');
    inp.id = 'focus-target';
    document.body.appendChild(inp);
  `);

  await page.locator('#focus-target').focus();
  await expect(page.locator('#focus-target')).toBeFocused();
});

test('expect(locator).toHaveText — string and RegExp', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  await page.waitForSelector('.title');

  await expect(page.locator('.title')).toHaveText('Products');
  await expect(page.locator('.title')).toHaveText(/Products/);
  await expect(page.locator('.title')).not.toHaveText('Inventory');
});

test('expect(locator).toHaveText — array', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  await page.evaluate(`
    const ul = document.createElement('ul'); ul.id = 'text-list';
    ['Alpha', 'Beta', 'Gamma'].forEach(t => {
      const li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
    });
    document.body.appendChild(ul);
  `);

  await expect(page.locator('#text-list li')).toHaveText(['Alpha', 'Beta', 'Gamma']);
});

test('expect(locator).toContainText', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  await page.waitForSelector('.title');

  await expect(page.locator('.title')).toContainText('Prod');
  await expect(page.locator('.title')).toContainText(/roduct/);
});

test('expect(locator).toHaveValue', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'standard_user');
  await expect(page.locator('#user-name')).toHaveValue('standard_user');
  await expect(page.locator('#user-name')).toHaveValue(/standard/);
  await expect(page.locator('#user-name')).not.toHaveValue('wrong_user');
});

test('expect(locator).toHaveAttribute', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await expect(page.locator('#login-button')).toHaveAttribute('type', 'submit');
  await expect(page.locator('#login-button')).toHaveAttribute('type', /submit/);
  await expect(page.locator('#login-button')).not.toHaveAttribute('type', 'button');
});

test('expect(locator).toHaveCount', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'standard_user');
  await page.fill('#password', 'secret_sauce');
  await page.click('#login-button');
  await page.waitForSelector('.inventory_item');

  await expect(page.locator('.inventory_item')).toHaveCount(6);
  await expect(page.locator('.nonexistent')).toHaveCount(0);
});

test('expect(locator).toHaveClass', async ({ proxyPage: page }) => {
  await page.goto('https://playwright.dev/');

  await page.evaluate(`
    const el = document.createElement('div');
    el.id = 'classy';
    el.className = 'foo bar baz';
    document.body.appendChild(el);
  `);

  await expect(page.locator('#classy')).toHaveClass('foo');
  await expect(page.locator('#classy')).toHaveClass('foo bar');
  await expect(page.locator('#classy')).toHaveClass(/baz/);
  await expect(page.locator('#classy')).not.toHaveClass('qux');
});

test('expect(locator).toHaveId', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await expect(page.locator('#login-button')).toHaveId('login-button');
  await expect(page.locator('#login-button')).toHaveId(/login/);
  await expect(page.locator('#login-button')).not.toHaveId('other-button');
});

test('expect(locator).toHaveJSProperty', async ({ proxyPage: page }) => {
  await page.goto('https://www.saucedemo.com/');

  await page.fill('#user-name', 'hello');

  await expect(page.locator('#user-name')).toHaveJSProperty('value', 'hello');
  await expect(page.locator('#user-name')).not.toHaveJSProperty('value', 'world');
});
