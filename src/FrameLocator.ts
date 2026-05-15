import { ProxyServer } from './proxy/ProxyServer';
import { Locator } from './Locator';
import type { LocatorStep } from './Locator';

// Returned by page.frameLocator(selector) / frame.frameLocator(selector).
// Scopes all locator operations to the iframe matched by the CSS selector.
// Supports nesting: frameLocator('outer').frameLocator('inner').locator('button').
export class FrameLocator {
  constructor(
    private readonly proxy: ProxyServer,
    // Encodes the selector chain: '__selector:<css>[\n__selector:<css2>...]'
    private readonly frameId: string,
  ) {}

  locator(selector: string): Locator {
    return new Locator(this.proxy, [{ type: 'css', selector }], this.frameId);
  }

  getByText(text: string, options: { exact?: boolean } = {}): Locator {
    const step: LocatorStep = { type: 'getByText', text, exact: options.exact };
    return new Locator(this.proxy, [step], this.frameId);
  }

  getByRole(role: string, options: { name?: string } = {}): Locator {
    const step: LocatorStep = { type: 'getByRole', role, name: options.name };
    return new Locator(this.proxy, [step], this.frameId);
  }

  getByLabel(text: string, options: { exact?: boolean } = {}): Locator {
    const step: LocatorStep = { type: 'getByLabel', text, exact: options.exact };
    return new Locator(this.proxy, [step], this.frameId);
  }

  getByPlaceholder(text: string, options: { exact?: boolean } = {}): Locator {
    const step: LocatorStep = { type: 'getByPlaceholder', text, exact: options.exact };
    return new Locator(this.proxy, [step], this.frameId);
  }

  getByTestId(testId: string): Locator {
    const step: LocatorStep = { type: 'getByTestId', testId };
    return new Locator(this.proxy, [step], this.frameId);
  }

  // Chain into a nested iframe within this frame's document.
  frameLocator(selector: string): FrameLocator {
    return new FrameLocator(this.proxy, this.frameId + '\n__selector:' + selector);
  }
}
