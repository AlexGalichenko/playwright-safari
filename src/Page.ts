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
import { Dialog, DialogType } from './Dialog';
import { ConsoleMessage } from './ConsoleMessage';
import type { SelectOption } from './Locator';

const execAsync = promisify(exec);

export type NavigateFn = (url: string) => Promise<void>;
export type ScreenshotFn = () => Promise<Buffer>;
export type SetViewportSizeFn = (width: number, height: number) => Promise<void>;

export type { ProxyRequest, ProxyResponse, UrlMatcher };

export class Page {
  readonly keyboard: Keyboard;
  readonly mouse: Mouse;

  private readonly _eventHandlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(
    private readonly proxy: ProxyServer,
    private readonly externalNavigate?: NavigateFn,
    private readonly screenshotFn?: ScreenshotFn,
    private readonly setViewportSizeFn?: SetViewportSizeFn,
  ) {
    this.keyboard = new Keyboard(proxy);
    this.mouse = new Mouse(proxy);

    proxy.on('browser:dialog', (msg: Record<string, unknown>) => {
      const handlers = this._eventHandlers.get('dialog');
      if (!handlers?.size) return;
      const d = new Dialog(
        String(msg.dialogType ?? 'alert') as DialogType,
        String(msg.message ?? ''),
        String(msg.defaultValue ?? ''),
        this.proxy,
      );
      for (const h of handlers) (h as (d: Dialog) => void)(d);
    });
    proxy.on('browser:console', (msg: Record<string, unknown>) => {
      const handlers = this._eventHandlers.get('console');
      if (!handlers?.size) return;
      const c = new ConsoleMessage(
        String(msg.level ?? 'log'),
        (msg.args as string[] | undefined) ?? [],
      );
      for (const h of handlers) (h as (c: ConsoleMessage) => void)(c);
    });
  }

  on(event: 'dialog',  handler: (dialog: Dialog) => void | Promise<void>): this;
  on(event: 'console', handler: (msg: ConsoleMessage) => void | Promise<void>): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (data: any) => any): this {
    if (!this._eventHandlers.has(event)) this._eventHandlers.set(event, new Set());
    this._eventHandlers.get(event)!.add(handler as (data: unknown) => void);
    return this;
  }

  off(event: 'dialog',  handler?: (dialog: Dialog) => void | Promise<void>): this;
  off(event: 'console', handler?: (msg: ConsoleMessage) => void | Promise<void>): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, handler?: (data: any) => any): this {
    if (!handler) { this._eventHandlers.delete(event); return this; }
    this._eventHandlers.get(event)?.delete(handler as (data: unknown) => void);
    return this;
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

  async setViewportSize(options: { width: number; height: number }): Promise<void> {
    if (!this.setViewportSizeFn) throw new Error('No viewport size provider — use Browser.newPage()');
    await this.setViewportSizeFn(options.width, options.height);
  }

  // Evaluate a JavaScript expression in the page context and return its value.
  async evaluate<T = unknown>(expression: string): Promise<T> {
    return this.proxy.sendCommand<T>({ type: 'evaluate', expression });
  }

  // ---- page info ----

  async title(): Promise<string> {
    return this.evaluate<string>('document.title');
  }

  async url(): Promise<string> {
    return this.evaluate<string>('window.__pw_url || document.URL');
  }

  async content(): Promise<string> {
    return this.evaluate<string>('document.documentElement.outerHTML');
  }

  // ---- navigation helpers ----

  async waitForFunction<T = unknown>(expression: string, options: { timeout?: number; polling?: number } = {}): Promise<T> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<T>({ type: 'waitForFunction', expression, polling: options.polling ?? 100, timeout }, timeout + 1_000);
  }

  async waitForURL(url: string | RegExp, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    if (typeof url === 'string') {
      await this.proxy.sendCommand({ type: 'waitForURL', matcherType: 'string', matcherValue: url, timeout }, timeout + 1_000);
    } else {
      await this.proxy.sendCommand({ type: 'waitForURL', matcherType: 'regexp', matcherValue: url.source, matcherFlags: url.flags, timeout }, timeout + 1_000);
    }
  }

  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'load', options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    if (state === 'networkidle') {
      await this._waitForNetworkIdle(timeout);
      return;
    }
    if (this.proxy.hasActiveConnections) return;
    await Promise.race([
      this.proxy.waitForNextConnection(),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('waitForLoadState timed out')), timeout)),
    ]);
  }

  private _waitForNetworkIdle(timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let idleTimer: ReturnType<typeof setTimeout>;
      const deadline = setTimeout(() => {
        clearTimeout(idleTimer);
        this.proxy.off('request',  onReq);
        this.proxy.off('response', onResp);
        reject(new Error('waitForLoadState(networkidle) timed out'));
      }, timeout);

      const reset = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          clearTimeout(deadline);
          this.proxy.off('request',  onReq);
          this.proxy.off('response', onResp);
          resolve();
        }, 500);
      };

      const onReq  = () => reset();
      const onResp = () => reset();
      this.proxy.on('request',  onReq);
      this.proxy.on('response', onResp);
      reset();
    });
  }

  // ---- element shortcuts ----

  async focus(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'focus', selector, timeout }, timeout + 1_000);
  }

  async hover(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'hover', selector, timeout }, timeout + 1_000);
  }

  async isChecked(selector: string, options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isChecked', selector, timeout }, timeout + 1_000);
  }

  async isEnabled(selector: string, options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isEnabled', selector, timeout }, timeout + 1_000);
  }

  async check(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'check', selector, timeout }, timeout + 1_000);
  }

  async uncheck(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'uncheck', selector, timeout }, timeout + 1_000);
  }

  async selectOption(selector: string, values: string | string[] | SelectOption | SelectOption[], options: { timeout?: number } = {}): Promise<string[]> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string[]>({ type: 'selectOption', selector, values, timeout }, timeout + 1_000);
  }

  async getAttribute(selector: string, name: string, options: { timeout?: number } = {}): Promise<string | null> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string | null>({ type: 'getAttribute', selector, name, timeout }, timeout + 1_000);
  }

  async innerHTML(selector: string, options: { timeout?: number } = {}): Promise<string> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string>({ type: 'innerHTML', selector, timeout }, timeout + 1_000);
  }

  async textContent(selector: string, options: { timeout?: number } = {}): Promise<string | null> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string | null>({ type: 'textContent', selector, timeout }, timeout + 1_000);
  }

  async dispatchEvent(selector: string, type: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'dispatchEvent', selector, eventType: type, timeout }, timeout + 1_000);
  }

  addInitScript(script: string): void {
    this.proxy.addInitScript(script);
  }

  async dragAndDrop(source: string, target: string, options: { timeout?: number; steps?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'dragAndDrop', source, target, steps: options.steps ?? 5, timeout }, timeout + 1_000);
  }
}
