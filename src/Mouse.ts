import { ProxyServer } from './proxy/ProxyServer';

type Button = 'left' | 'right' | 'middle';

export class Mouse {
  constructor(private readonly proxy: ProxyServer) {}

  async move(x: number, y: number, options: { steps?: number } = {}): Promise<void> {
    await this.proxy.sendCommand({ type: 'mouseMove', x, y, steps: options.steps ?? 1 });
  }

  async down(options: { button?: Button; clickCount?: number } = {}): Promise<void> {
    await this.proxy.sendCommand({ type: 'mouseDown', button: options.button ?? 'left', clickCount: options.clickCount ?? 1 });
  }

  async up(options: { button?: Button; clickCount?: number } = {}): Promise<void> {
    await this.proxy.sendCommand({ type: 'mouseUp', button: options.button ?? 'left', clickCount: options.clickCount ?? 1 });
  }

  async click(x: number, y: number, options: { button?: Button; clickCount?: number; delay?: number } = {}): Promise<void> {
    await this.proxy.sendCommand({ type: 'mouseClick', x, y, button: options.button ?? 'left', clickCount: options.clickCount ?? 1, delay: options.delay ?? 0 });
  }

  async dblclick(x: number, y: number, options: { button?: Button; delay?: number } = {}): Promise<void> {
    await this.proxy.sendCommand({ type: 'mouseDblclick', x, y, button: options.button ?? 'left', delay: options.delay ?? 0 });
  }

  async wheel(deltaX: number, deltaY: number): Promise<void> {
    await this.proxy.sendCommand({ type: 'mouseWheel', deltaX, deltaY });
  }
}
