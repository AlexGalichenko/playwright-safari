import { test, expect } from '@playwright/test';
import { Browser } from '../src';

// Allow extra time for each resource to be fetched through the proxy.
test.setTimeout(60_000);

// Each test uses a distinct port so parallel workers don't clash.
const PROXY_PORT = 8081;

test('has title', async ({ }) => {
  const browser = new Browser({ port: PROXY_PORT });
  await browser.launch();

  try {
    // Use domcontentloaded so Playwright doesn't wait for every sub-resource
    // (CSS, JS, images) to be fetched through the proxy before resolving.
    const proxyPage = browser.newPage();

    await proxyPage.goto('https://playwright.dev/');

  } finally {
    await browser.close();
  }
});

test('fill via proxy', async ({ page }) => {
  const browser = new Browser({ port: PROXY_PORT + 1 });
  await browser.launch();

  try {
    const proxyPage = browser.newPage(
      url => page.goto(url, { waitUntil: 'domcontentloaded' }).then(() => {}),
    );

    await proxyPage.goto('https://the-internet.herokuapp.com/login');

    // fill() sends commands over the injected WebSocket — no CDP involved.
    await proxyPage.fill('#username', 'tomsmith');
    await proxyPage.fill('#password', 'SuperSecretPassword!');

    // Verify with Playwright that the proxy's WS-based fill actually worked.
    await expect(page.locator('#username')).toHaveValue('tomsmith');
    await expect(page.locator('#password')).toHaveValue('SuperSecretPassword!');
  } finally {
    await browser.close();
  }
});
