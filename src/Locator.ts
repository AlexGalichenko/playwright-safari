import { ProxyServer } from './proxy/ProxyServer';

export type LocatorStep =
  | { type: 'css'; selector: string }
  | { type: 'getByText'; text: string; exact?: boolean }
  | { type: 'getByRole'; role: string; name?: string }
  | { type: 'getByLabel'; text: string; exact?: boolean }
  | { type: 'getByPlaceholder'; text: string; exact?: boolean }
  | { type: 'getByTestId'; testId: string }
  | { type: 'filter'; hasText?: string; has?: LocatorStep[] }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'nth'; index: number };

export class Locator {
  constructor(
    private readonly proxy: ProxyServer,
    private readonly steps: LocatorStep[],
  ) {}

  // Builder methods — return new Locator with appended step

  getByText(text: string, options: { exact?: boolean } = {}): Locator {
    return new Locator(this.proxy, [...this.steps, { type: 'getByText', text, exact: options.exact }]);
  }

  getByRole(role: string, options: { name?: string } = {}): Locator {
    return new Locator(this.proxy, [...this.steps, { type: 'getByRole', role, name: options.name }]);
  }

  getByLabel(text: string, options: { exact?: boolean } = {}): Locator {
    return new Locator(this.proxy, [...this.steps, { type: 'getByLabel', text, exact: options.exact }]);
  }

  getByPlaceholder(text: string, options: { exact?: boolean } = {}): Locator {
    return new Locator(this.proxy, [...this.steps, { type: 'getByPlaceholder', text, exact: options.exact }]);
  }

  getByTestId(testId: string): Locator {
    return new Locator(this.proxy, [...this.steps, { type: 'getByTestId', testId }]);
  }

  filter(options: { hasText?: string; has?: Locator } = {}): Locator {
    const step: LocatorStep = { type: 'filter' };
    if (options.hasText !== undefined) (step as Extract<LocatorStep, { type: 'filter' }>).hasText = options.hasText;
    if (options.has !== undefined) (step as Extract<LocatorStep, { type: 'filter' }>).has = options.has['steps'];
    return new Locator(this.proxy, [...this.steps, step]);
  }

  first(): Locator {
    return new Locator(this.proxy, [...this.steps, { type: 'first' }]);
  }

  last(): Locator {
    return new Locator(this.proxy, [...this.steps, { type: 'last' }]);
  }

  nth(index: number): Locator {
    return new Locator(this.proxy, [...this.steps, { type: 'nth', index }]);
  }

  locator(selector: string): Locator {
    return new Locator(this.proxy, [...this.steps, { type: 'css', selector }]);
  }

  // Action methods

  async fill(value: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'fill', steps: this.steps, value, timeout }, timeout + 1_000);
  }

  async click(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'click', steps: this.steps, timeout }, timeout + 1_000);
  }

  async innerText(options: { timeout?: number } = {}): Promise<string> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string>({ type: 'innerText', steps: this.steps, timeout }, timeout + 1_000);
  }

  async inputValue(options: { timeout?: number } = {}): Promise<string> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string>({ type: 'inputValue', steps: this.steps, timeout }, timeout + 1_000);
  }

  async isVisible(options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isVisible', steps: this.steps, timeout }, timeout + 1_000);
  }

  async count(): Promise<number> {
    return this.proxy.sendCommand<number>({ type: 'count', steps: this.steps });
  }

  async waitFor(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'waitForLocator', steps: this.steps, timeout }, timeout + 1_000);
  }
}
