import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { rewriteHtml, rewriteCss } from './HtmlRewriter';

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  payload: string;
}

const STRIPPED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'content-security-policy',       // would block injected WS connection
  'content-security-policy-report-only',
  'x-frame-options',
]);

export class ProxyServer {
  private readonly server: http.Server;
  private readonly wss: WebSocketServer;
  private readonly connections = new Set<WebSocket>();
  private readonly pending = new Map<string, PendingCommand>();
  private readonly nextConnectionResolvers: Array<() => void> = [];
  private cmdId = 0;

  constructor(public readonly port: number) {
    this.server = http.createServer(this.onRequest.bind(this));
    this.wss = new WebSocketServer({ server: this.server, path: '/__proxy/ws' });
    this.wss.on('connection', this.onWsConnection.bind(this));
  }

  start(): Promise<void> {
    return new Promise(resolve => this.server.listen(this.port, () => resolve()));
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) =>
      this.server.close(err => (err ? reject(err) : resolve())),
    );
  }

  get hasActiveConnections(): boolean {
    for (const ws of this.connections) {
      if (ws.readyState === WebSocket.OPEN) return true;
    }
    return false;
  }

  // Resolves when the next WebSocket client connects (i.e. a new page finishes loading).
  // Register the waiter BEFORE triggering navigation to avoid the race where
  // the page loads faster than the caller sets up the listener.
  waitForNextConnection(): Promise<void> {
    return new Promise(resolve => this.nextConnectionResolvers.push(resolve));
  }

  // Send a command that expects a response from the page.
  // If no connection is currently open (e.g. the page is mid-navigation after
  // a click that caused a redirect) the command is queued and dispatched as
  // soon as the next WebSocket connection arrives, rather than rejecting
  // immediately. This handles the common "click → navigate → waitForSelector"
  // pattern without requiring callers to manually wait for navigation.
  sendCommand<T = void>(command: object, timeoutMs = 30_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = String(++this.cmdId);
      const payload = JSON.stringify({ ...command, id });

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Command timed out: ${JSON.stringify(command)}`));
      }, timeoutMs);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer, payload });

      const dispatch = () => {
        for (const ws of this.connections) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
            return;
          }
        }
        // No open connection yet — re-queue for the next one.
        this.nextConnectionResolvers.push(dispatch);
      };

      dispatch();
    });
  }

  // Fire-and-forget navigate — the page unloads immediately so no response comes back.
  navigateTo(proxyUrl: string): void {
    for (const ws of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'navigate', url: proxyUrl, id: String(++this.cmdId) }));
        break;
      }
    }
  }

  private onWsConnection(ws: WebSocket): void {
    this.connections.add(ws);

    ws.on('close', () => {
      this.connections.delete(ws);
      // Any command still in `pending` was sent to the page that just closed
      // (e.g. waitForSelector called right after a navigating click). Re-queue
      // each one so it is dispatched to the next page that connects.
      for (const [id, cmd] of this.pending) {
        const resend = () => {
          if (!this.pending.has(id)) return; // already resolved by the old page
          for (const ws2 of this.connections) {
            if (ws2.readyState === WebSocket.OPEN) {
              ws2.send(cmd.payload);
              return;
            }
          }
          this.nextConnectionResolvers.push(resend);
        };
        resend();
      }
    });
    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString()) as {
          id: string;
          success: boolean;
          error?: string;
          result?: unknown;
        };
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        msg.success
          ? pending.resolve(msg.result)
          : pending.reject(new Error(msg.error ?? 'Command failed'));
      } catch {
        // ignore malformed messages
      }
    });

    // Notify any callers waiting for a fresh page connection.
    const resolvers = this.nextConnectionResolvers.splice(0);
    for (const r of resolvers) r();
  }

  private async onRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const reqUrl = new URL(req.url ?? '/', `http://localhost:${this.port}`);

    if (reqUrl.pathname === '/__proxy/fetch') {
      const target = reqUrl.searchParams.get('url');
      if (!target) {
        res.writeHead(400);
        res.end('Missing url parameter');
        return;
      }
      await this.proxyFetch(target, res);
    } else if (!reqUrl.pathname.startsWith('/__proxy/')) {
      // Fallback for root-relative requests made by page JS (e.g. webpack chunks
      // with publicPath "/", fetch() calls, dynamically created <script> tags).
      // Reconstruct the absolute target by resolving the request path against
      // the original URL embedded in the Referer's ?url= parameter.
      const target = this.resolveFromReferer(reqUrl, req.headers['referer']);
      if (target) {
        await this.proxyFetch(target, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    }
  }

  private resolveFromReferer(reqUrl: URL, referer: string | undefined): string | null {
    if (!referer) return null;
    try {
      const ref = new URL(referer);
      const base = ref.pathname === '/__proxy/fetch' ? ref.searchParams.get('url') : null;
      if (!base) return null;
      return new URL(reqUrl.pathname + reqUrl.search + reqUrl.hash, base).href;
    } catch {
      return null;
    }
  }

  private async proxyFetch(targetUrl: string, res: http.ServerResponse): Promise<void> {
    try {
      const response = await fetch(targetUrl, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; playwright-safari/1.0)' },
      });

      // Transparently forward redirects, rewriting the Location to stay in-proxy.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const absolute = new URL(location, targetUrl).href;
          res.writeHead(302, {
            location: `/__proxy/fetch?url=${encodeURIComponent(absolute)}`,
          });
          res.end();
          return;
        }
      }

      const contentType = response.headers.get('content-type') ?? '';
      const safeHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (!STRIPPED_RESPONSE_HEADERS.has(key)) safeHeaders[key] = value;
      });

      if (contentType.includes('text/html')) {
        const html = await response.text();
        const rewritten = rewriteHtml(html, targetUrl, this.port);
        const buf = Buffer.from(rewritten, 'utf-8');
        res.writeHead(response.status, {
          ...safeHeaders,
          'content-type': 'text/html; charset=utf-8',
          'content-length': String(buf.byteLength),
        });
        res.end(buf);
      } else if (contentType.includes('text/css')) {
        const css = await response.text();
        const rewritten = rewriteCss(css, targetUrl);
        const buf = Buffer.from(rewritten, 'utf-8');
        res.writeHead(response.status, {
          ...safeHeaders,
          'content-type': 'text/css; charset=utf-8',
          'content-length': String(buf.byteLength),
        });
        res.end(buf);
      } else {
        const buf = Buffer.from(await response.arrayBuffer());
        res.writeHead(response.status, {
          ...safeHeaders,
          'content-length': String(buf.byteLength),
        });
        res.end(buf);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.writeHead(502);
      res.end(`Proxy error: ${msg}`);
    }
  }
}
