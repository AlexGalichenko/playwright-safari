import { ProxyServer } from './proxy/ProxyServer';
import { Page, NavigateFn } from './Page';

export interface BrowserLaunchOptions {
  port?: number;
}

export class Browser {
  private readonly proxy: ProxyServer;

  constructor(options: BrowserLaunchOptions = {}) {
    this.proxy = new ProxyServer(options.port ?? 8080);
  }

  async launch(): Promise<void> {
    await this.proxy.start();
  }

  // Pass a navigate callback when an external browser (e.g. Playwright's page
  // fixture) should handle the initial navigation instead of system `open`.
  newPage(externalNavigate?: NavigateFn): Page {
    return new Page(this.proxy, externalNavigate);
  }

  async close(): Promise<void> {
    await this.proxy.stop();
  }
}
