import { ProxyServer } from './proxy/ProxyServer';
import { SafariDriver } from './browser/SafariDriver';
import { Page } from './Page';

export interface BrowserLaunchOptions {
  port?: number;
  driverPort?: number;
}

export class Browser {
  private readonly proxy: ProxyServer;
  private readonly driver: SafariDriver;

  constructor(options: BrowserLaunchOptions = {}) {
    this.proxy = new ProxyServer(options.port ?? 8080);
    this.driver = new SafariDriver(options.driverPort ?? 4444);
  }

  async launch(): Promise<void> {
    await this.proxy.start();
    await this.driver.start();
  }

  newPage(): Page {
    return new Page(
      this.proxy,
      url => this.driver.navigate(url),
      () => this.driver.screenshot(),
    );
  }

  async close(): Promise<void> {
    await this.driver.stop();
    await this.proxy.stop();
  }
}
