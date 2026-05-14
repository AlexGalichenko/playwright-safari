import { spawn, ChildProcess } from 'child_process';

const SAFARIDRIVER = '/usr/bin/safaridriver';

// Thin W3C WebDriver client around macOS safaridriver.
// Requires "Allow Remote Automation" to be enabled in Safari ▸ Develop menu.
export class SafariDriver {
  private process?: ChildProcess;
  private sessionId?: string;

  constructor(private readonly port: number = 4444) {}

  async start(): Promise<void> {
    if (!await this.isReady()) {
      await this.spawn();
      await this.waitForReady();
    }
    this.sessionId = await this.createSession();
  }

  async navigate(url: string): Promise<void> {
    if (!this.sessionId) throw new Error('No active Safari session');
    await this.wd('POST', `/session/${this.sessionId}/url`, { url });
  }

  async screenshot(): Promise<Buffer> {
    if (!this.sessionId) throw new Error('No active Safari session');
    const value = await this.wd('GET', `/session/${this.sessionId}/screenshot`) as string;
    return Buffer.from(value, 'base64');
  }

  async setWindowSize(width: number, height: number): Promise<void> {
    if (!this.sessionId) throw new Error('No active Safari session');
    await this.wd('POST', `/session/${this.sessionId}/window/rect`, { width, height });
  }

  async stop(): Promise<void> {
    if (this.sessionId) {
      try { await this.wd('DELETE', `/session/${this.sessionId}`); } catch { /* ignore */ }
      this.sessionId = undefined;
    }
    this.process?.kill();
    this.process = undefined;
  }

  private spawn(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn(SAFARIDRIVER, ['--port', String(this.port)], { stdio: 'ignore' });
      this.process.on('error', err =>
        reject(new Error(
          `safaridriver failed to start: ${err.message}\n` +
          'Enable "Allow Remote Automation" in Safari ▸ Develop menu.',
        )),
      );
      // Give the process time to bind the port before we start polling.
      setTimeout(resolve, 400);
    });
  }

  private async waitForReady(attempts = 20): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      if (await this.isReady()) return;
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(
      `safaridriver not ready on port ${this.port}. ` +
      'Enable "Allow Remote Automation" in Safari ▸ Develop menu.',
    );
  }

  private async isReady(): Promise<boolean> {
    try {
      await fetch(`http://localhost:${this.port}/status`);
      return true;
    } catch {
      return false;
    }
  }

  private async createSession(): Promise<string> {
    const value = await this.wd('POST', '/session', {
      capabilities: { alwaysMatch: { browserName: 'safari' } },
    }) as { sessionId: string };
    return value.sessionId;
  }

  private async wd(method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`http://localhost:${this.port}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json() as { value: unknown };
    const val = json.value;
    if (val && typeof val === 'object' && 'error' in val) {
      const { error, message } = val as { error: string; message: string };
      throw new Error(`WebDriver [${error}]: ${message}`);
    }
    return val;
  }
}
