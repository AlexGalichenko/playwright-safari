import { ProxyServer } from './proxy/ProxyServer';

export interface SelectOption {
  value?: string;
  label?: string;
  index?: number;
}

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

  // Returns one Locator per matched element (snapshot at call time).
  async all(): Promise<Locator[]> {
    const n = await this.count();
    return Array.from({ length: n }, (_, i) => this.nth(i));
  }

  async allInnerTexts(): Promise<string[]> {
    return this.proxy.sendCommand<string[]>({ type: 'allInnerTexts', steps: this.steps });
  }

  async allTextContents(): Promise<string[]> {
    return this.proxy.sendCommand<string[]>({ type: 'allTextContents', steps: this.steps });
  }

  async getAttribute(name: string, options: { timeout?: number } = {}): Promise<string | null> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string | null>({ type: 'getAttribute', steps: this.steps, name, timeout }, timeout + 1_000);
  }

  async textContent(options: { timeout?: number } = {}): Promise<string | null> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string | null>({ type: 'textContent', steps: this.steps, timeout }, timeout + 1_000);
  }

  async innerHTML(options: { timeout?: number } = {}): Promise<string> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string>({ type: 'innerHTML', steps: this.steps, timeout }, timeout + 1_000);
  }

  async boundingBox(options: { timeout?: number } = {}): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<{ x: number; y: number; width: number; height: number } | null>({ type: 'boundingBox', steps: this.steps, timeout }, timeout + 1_000);
  }

  async isChecked(options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isChecked', steps: this.steps, timeout }, timeout + 1_000);
  }

  async isEnabled(options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isEnabled', steps: this.steps, timeout }, timeout + 1_000);
  }

  async isDisabled(options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isDisabled', steps: this.steps, timeout }, timeout + 1_000);
  }

  async isEditable(options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isEditable', steps: this.steps, timeout }, timeout + 1_000);
  }

  async isHidden(options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isHidden', steps: this.steps, timeout }, timeout + 1_000);
  }

  async check(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'check', steps: this.steps, timeout }, timeout + 1_000);
  }

  async uncheck(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'uncheck', steps: this.steps, timeout }, timeout + 1_000);
  }

  async setChecked(checked: boolean, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'setChecked', steps: this.steps, checked, timeout }, timeout + 1_000);
  }

  async selectOption(values: string | string[] | SelectOption | SelectOption[], options: { timeout?: number } = {}): Promise<string[]> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string[]>({ type: 'selectOption', steps: this.steps, values, timeout }, timeout + 1_000);
  }

  async hover(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'hover', steps: this.steps, timeout }, timeout + 1_000);
  }

  async focus(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'focus', steps: this.steps, timeout }, timeout + 1_000);
  }

  async blur(options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'blur', steps: this.steps, timeout }, timeout + 1_000);
  }

  async press(key: string, options: { delay?: number; timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'press', steps: this.steps, key, delay: options.delay ?? 0, timeout }, timeout + 1_000);
  }

  async pressSequentially(text: string, options: { delay?: number; timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'pressSequentially', steps: this.steps, text, delay: options.delay ?? 0, timeout }, timeout + 1_000);
  }

  async dispatchEvent(type: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'dispatchEvent', steps: this.steps, eventType: type, timeout }, timeout + 1_000);
  }
}
