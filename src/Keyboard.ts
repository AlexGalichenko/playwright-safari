import { ProxyServer } from './proxy/ProxyServer';

export class Keyboard {
  constructor(private readonly proxy: ProxyServer) {}

  async down(key: string): Promise<void> {
    await this.proxy.sendCommand({ type: 'keyboardDown', key });
  }

  async up(key: string): Promise<void> {
    await this.proxy.sendCommand({ type: 'keyboardUp', key });
  }

  async press(key: string, options: { delay?: number } = {}): Promise<void> {
    await this.proxy.sendCommand({ type: 'keyboardPress', key, delay: options.delay ?? 0 });
  }

  async type(text: string, options: { delay?: number } = {}): Promise<void> {
    await this.proxy.sendCommand({ type: 'keyboardType', text, delay: options.delay ?? 0 });
  }

  async insertText(text: string): Promise<void> {
    await this.proxy.sendCommand({ type: 'keyboardInsertText', text });
  }
}
