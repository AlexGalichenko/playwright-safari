import { test as base, expect } from '@playwright/test';
import { Browser, Page } from '../src';

export type ProxyFixtures = { proxyPage: Page };

// Provides { proxyPage } — a proxy-backed Page that opens real Safari via
// safaridriver. Alias it as `page` in tests for Playwright-like readability:
//   test('…', async ({ proxyPage: page }) => { … })
export const test = base.extend<ProxyFixtures>({
  proxyPage: async ({}, use, testInfo) => {
    // Each worker gets distinct ports so parallel runs don't clash.
    const browser = new Browser({
      port: 8090 + testInfo.workerIndex,
      driverPort: 4444 + testInfo.workerIndex,
    });
    await browser.launch();
    await use(browser.newPage());
    await browser.close();
  },
});

export { expect };
