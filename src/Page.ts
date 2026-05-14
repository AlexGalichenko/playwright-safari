import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { ProxyServer } from './proxy/ProxyServer';
import type { ProxyRequest, ProxyResponse } from './proxy/ProxyServer';
import { Locator } from './Locator';
import type { LocatorStep } from './Locator';
import { Route, UrlMatcher, matchesUrl } from './Route';
import { Keyboard } from './Keyboard';
import { Mouse } from './Mouse';

const execAsync = promisify(exec);

export type NavigateFn = (url: string) => Promise<void>;
export type ScreenshotFn = () => Promise<Buffer>;

export type { ProxyRequest, ProxyResponse, UrlMatcher };

export class Page {
  readonly keyboard: Keyboard;
  readonly mouse: Mouse;

  constructor(
    private readonly proxy: ProxyServer,
    private readonly externalNavigate?: NavigateFn,
    private readonly screenshotFn?: ScreenshotFn,
  ) {
    this.keyboard = new Keyboard(proxy);
    this.mouse = new Mouse(proxy);
  }

  // Navigate to a URL through the proxy.
  // First call opens the proxied URL via externalNavigate (if provided) or the
  // system browser; subsequent calls send a navigate command over the live WS.
  async goto(url: string): Promise<void> {
    const proxyUrl = `http://localhost:${this.proxy.port}/__proxy/fetch?url=${encodeURIComponent(url)}`;

    // Register the waiter BEFORE triggering navigation — avoids a race where
    // the page loads and connects WS before we start listening.
    const connected = this.proxy.waitForNextConnection();

    if (this.proxy.hasActiveConnections) {
      this.proxy.navigateTo(proxyUrl);
    } else if (this.externalNavigate) {
      await this.externalNavigate(proxyUrl);
    } else {
      await execAsync(`open "${proxyUrl}"`);
    }

    await connected;
  }

  async fill(selector: string, value: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'fill', selector, value, timeout }, timeout + 1_000);
  }

  async click(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'click', selector, timeout }, timeout + 1_000);
  }

  // Explicitly wait for a selector without interacting with it.
  async waitForSelector(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'waitForSelector', selector, timeout }, timeout + 1_000);
  }
  
  locator(selector: string): Locator {
    return new Locator(this.proxy, [{ type: 'css', selector }]);
  }

  getByText(text: string, options: { exact?: boolean } = {}): Locator {
    const step: LocatorStep = { type: 'getByText', text, exact: options.exact };
    return new Locator(this.proxy, [step]);
  }

  getByRole(role: string, options: { name?: string } = {}): Locator {
    const step: LocatorStep = { type: 'getByRole', role, name: options.name };
    return new Locator(this.proxy, [step]);
  }

  getByLabel(text: string, options: { exact?: boolean } = {}): Locator {
    const step: LocatorStep = { type: 'getByLabel', text, exact: options.exact };
    return new Locator(this.proxy, [step]);
  }

  getByPlaceholder(text: string, options: { exact?: boolean } = {}): Locator {
    const step: LocatorStep = { type: 'getByPlaceholder', text, exact: options.exact };
    return new Locator(this.proxy, [step]);
  }

  getByTestId(testId: string): Locator {
    const step: LocatorStep = { type: 'getByTestId', testId };
    return new Locator(this.proxy, [step]);
  }

  route(matcher: UrlMatcher, handler: (route: Route) => void | Promise<void>): void {
    this.proxy.addRoute(matcher, handler);
  }

  unroute(matcher: UrlMatcher, handler?: (route: Route) => void | Promise<void>): void {
    this.proxy.removeRoute(matcher, handler);
  }

  waitForRequest(matcher: UrlMatcher, options: { timeout?: number } = {}): Promise<ProxyRequest> {
    const timeout = options.timeout ?? 30_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.proxy.off('request', handler);
        reject(new Error(`Timeout waiting for request matching ${matcher}`));
      }, timeout);
      const handler = (req: ProxyRequest) => {
        if (matchesUrl(req.url, matcher)) {
          clearTimeout(timer);
          this.proxy.off('request', handler);
          resolve(req);
        }
      };
      this.proxy.on('request', handler);
    });
  }

  waitForResponse(matcher: UrlMatcher, options: { timeout?: number } = {}): Promise<ProxyResponse> {
    const timeout = options.timeout ?? 30_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.proxy.off('response', handler);
        reject(new Error(`Timeout waiting for response matching ${matcher}`));
      }, timeout);
      const handler = (resp: ProxyResponse) => {
        if (matchesUrl(resp.url, matcher)) {
          clearTimeout(timer);
          this.proxy.off('response', handler);
          resolve(resp);
        }
      };
      this.proxy.on('response', handler);
    });
  }

  async screenshot(options: { path?: string } = {}): Promise<Buffer> {
    if (!this.screenshotFn) throw new Error('No screenshot provider — use Browser.newPage()');
    const buf = await this.screenshotFn();
    if (options.path) await writeFile(options.path, buf);
    return buf;
  }

  // Evaluate a JavaScript expression in the page context and return its value.
  async evaluate<T = unknown>(expression: string): Promise<T> {
    return this.proxy.sendCommand<T>({ type: 'evaluate', expression });
  }
}
