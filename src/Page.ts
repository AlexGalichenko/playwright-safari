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
import { Frame } from './Frame';
import type { FrameInfo } from './Frame';
import { FrameLocator } from './FrameLocator';

const execAsync = promisify(exec);

export type NavigateFn = (url: string) => Promise<void>;
export type ScreenshotFn = () => Promise<Buffer>;
export type SetViewportSizeFn = (width: number, height: number) => Promise<void>;
export type GetViewportSizeFn = () => Promise<{ width: number; height: number }>;

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
    private readonly getViewportSizeFn?: GetViewportSizeFn,
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

  async viewportSize(): Promise<{ width: number; height: number }> {
    if (!this.getViewportSizeFn) throw new Error('No viewport size provider — use Browser.newPage()');
    return this.getViewportSizeFn();
  }

  exposeFunction(name: string, fn: (...args: unknown[]) => unknown): void {
    // Store the function to be called when browser invokes it
    this.proxy.exposeFunction(name, fn);

    // Inject the function into the page context
    const script = `
      window.${name} = async (...args) => {
        return new Promise((resolve, reject) => {
          const id = Date.now() + Math.random();
          window.__pw_exposed_functions = window.__pw_exposed_functions || {};
          window.__pw_exposed_functions[id] = { resolve, reject };

          // Send message to Node.js via WebSocket
          if (window.__pw_ws) {
            window.__pw_ws.send(JSON.stringify({
              type: 'callExposedFunction',
              name: '${name}',
              args: args,
              callId: id
            }));
          } else {
            reject(new Error('WebSocket not available'));
          }
        });
      };
    `;
    this.evaluate(script);
  }

  setExtraHTTPHeaders(headers: Record<string, string>): void {
    this.proxy.setExtraHTTPHeaders(headers);
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

  async reload(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    const currentUrl = await this.url();
    await this.goto(currentUrl);
  }

  async goBack(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.evaluate('window.history.back()');
    await this.waitForLoadState('load', { timeout });
  }

  async goForward(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.evaluate('window.history.forward()');
    await this.waitForLoadState('load', { timeout });
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

  async addScriptTag(options: { url?: string; content?: string; type?: string }): Promise<Element> {
    const { url, content, type = 'text/javascript' } = options;
    if (url && content) throw new Error('Cannot specify both url and content');
    if (!url && !content) throw new Error('Must specify either url or content');

    const scriptId = `pw-script-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const script = url
      ? `<script id="${scriptId}" type="${type}" src="${url}"></script>`
      : `<script id="${scriptId}" type="${type}">${content}</script>`;

    await this.evaluate(`(() => {
      const div = document.createElement('div');
      div.innerHTML = ${JSON.stringify(script)};
      const scriptEl = div.firstElementChild;
      document.head.appendChild(scriptEl);
      return scriptEl;
    })()`);

    return this.evaluate(`document.getElementById(${JSON.stringify(scriptId)})`);
  }

  async addStyleTag(options: { url?: string; content?: string }): Promise<Element> {
    const { url, content } = options;
    if (url && content) throw new Error('Cannot specify both url and content');
    if (!url && !content) throw new Error('Must specify either url or content');

    const styleId = `pw-style-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const style = url
      ? `<link id="${styleId}" rel="stylesheet" href="${url}">`
      : `<style id="${styleId}">${content}</style>`;

    await this.evaluate(`(() => {
      const div = document.createElement('div');
      div.innerHTML = ${JSON.stringify(style)};
      const styleEl = div.firstElementChild;
      document.head.appendChild(styleEl);
      return styleEl;
    })()`);

    return this.evaluate(`document.getElementById(${JSON.stringify(styleId)})`);
  }

  async dragAndDrop(source: string, target: string, options: { timeout?: number; steps?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'dragAndDrop', source, target, steps: options.steps ?? 5, timeout }, timeout + 1_000);
  }

  // ---- element shortcuts ----

  async isVisible(selector: string, options: { timeout?: number } = {}): Promise<boolean> {
    return this.locator(selector).isVisible(options);
  }

  async innerText(selector: string, options: { timeout?: number } = {}): Promise<string> {
    return this.locator(selector).innerText(options);
  }

  // Returns a FrameLocator that scopes all locator operations to the iframe
  // matched by the CSS selector. Equivalent to Playwright's frameLocator().
  frameLocator(selector: string): FrameLocator {
    return new FrameLocator(this.proxy, '__selector:' + selector);
  }

  // ---- frame access ----

  // Returns the main frame (the top-level page document).
  mainFrame(): Frame {
    return new Frame(this.proxy, '', '', -1);
  }

  // Returns a Frame targeting a named iframe. Commands are routed via the main
  // frame's WebSocket using the iframe's name attribute for document lookup.
  frame(options: { name: string }): Frame {
    return new Frame(this.proxy, options.name, '', 0);
  }

  // Queries the page for all iframes and returns Frame objects for each,
  // with the main frame at index 0.
  async frames(): Promise<Frame[]> {
    const infos = await this.proxy.sendCommand<FrameInfo[]>({ type: 'queryFrames' });
    return [
      this.mainFrame(),
      ...infos.map(info => new Frame(this.proxy, info.name, info.url, info.index)),
    ];
  }
}
