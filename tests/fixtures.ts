import { test as base, expect as baseExpect } from '@playwright/test';
import { Browser, Page } from '../src';
import { matchers } from './matchers';

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

// Extended expect with Locator matchers: toBeVisible, toBeHidden, toBeEnabled,
// toBeDisabled, toBeChecked, toBeEditable, toBeFocused, toHaveText,
// toContainText, toHaveValue, toHaveAttribute, toHaveCount, toHaveClass,
// toHaveId, toHaveJSProperty.
export const expect = baseExpect.extend(matchers);
