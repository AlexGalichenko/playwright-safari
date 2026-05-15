import { ProxyServer } from './proxy/ProxyServer';
import { Locator } from './Locator';
import type { LocatorStep } from './Locator';
import type { SelectOption } from './Locator';
import { FrameLocator } from './FrameLocator';

export interface FrameInfo {
  name: string;
  url: string;
  index: number;
}

export class Frame {
  constructor(
    private readonly proxy: ProxyServer,
    private readonly _name: string,
    private readonly _url: string,
    private readonly _index: number,
  ) {}

  name(): string { return this._name; }
  url(): string  { return this._url; }

  // frameId sent in every command. Main frame uses '' (empty = main document).
  // Named iframes use their name attribute; unnamed use __frame_N positional index.
  private get frameId(): string {
    if (this._index < 0) return '';
    if (this._name)      return this._name;
    return `__frame_${this._index}`;
  }

  async fill(selector: string, value: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'fill', selector, value, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async click(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'click', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async waitForSelector(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'waitForSelector', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    return this.proxy.sendCommand<T>({ type: 'evaluate', expression, frameId: this.frameId });
  }

  async title(): Promise<string> {
    return this.evaluate<string>('document.title');
  }

  async content(): Promise<string> {
    return this.evaluate<string>('document.documentElement.outerHTML');
  }

  async textContent(selector: string, options: { timeout?: number } = {}): Promise<string | null> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string | null>({ type: 'textContent', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async innerHTML(selector: string, options: { timeout?: number } = {}): Promise<string> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string>({ type: 'innerHTML', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async getAttribute(selector: string, name: string, options: { timeout?: number } = {}): Promise<string | null> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string | null>({ type: 'getAttribute', selector, name, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async isVisible(selector: string, options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isVisible', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async isChecked(selector: string, options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isChecked', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async isEnabled(selector: string, options: { timeout?: number } = {}): Promise<boolean> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<boolean>({ type: 'isEnabled', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async check(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'check', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async uncheck(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'uncheck', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async selectOption(selector: string, values: string | string[] | SelectOption | SelectOption[], options: { timeout?: number } = {}): Promise<string[]> {
    const timeout = options.timeout ?? 30_000;
    return this.proxy.sendCommand<string[]>({ type: 'selectOption', selector, values, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async focus(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'focus', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

  async hover(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const timeout = options.timeout ?? 30_000;
    await this.proxy.sendCommand({ type: 'hover', selector, timeout, frameId: this.frameId }, timeout + 1_000);
  }

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

  // Scopes to a nested iframe within this frame, located by CSS selector.
  frameLocator(selector: string): FrameLocator {
    const nestedId = this.frameId
      ? this.frameId + '\n__selector:' + selector
      : '__selector:' + selector;
    return new FrameLocator(this.proxy, nestedId);
  }
}
