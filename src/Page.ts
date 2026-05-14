import { exec } from 'child_process';
import { promisify } from 'util';
import { ProxyServer } from './proxy/ProxyServer';

const execAsync = promisify(exec);

// Callback used to open the first URL when an external browser (e.g. Playwright)
// controls navigation rather than the system `open` command.
export type NavigateFn = (url: string) => Promise<void>;

export class Page {
  constructor(
    private readonly proxy: ProxyServer,
    private readonly externalNavigate?: NavigateFn,
  ) {}

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
  
  // Evaluate a JavaScript expression in the page context and return its value.
  async evaluate<T = unknown>(expression: string): Promise<T> {
    return this.proxy.sendCommand<T>({ type: 'evaluate', expression });
  }
}
