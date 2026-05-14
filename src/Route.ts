export type UrlMatcher = string | RegExp | ((url: string) => boolean);

export function matchesUrl(url: string, matcher: UrlMatcher): boolean {
  if (typeof matcher === 'string') return url.includes(matcher);
  if (matcher instanceof RegExp) return matcher.test(url);
  return matcher(url);
}

export interface FulfillOptions {
  status?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}

export type RouteAction =
  | ({ type: 'fulfill' } & FulfillOptions)
  | { type: 'abort' }
  | { type: 'continue' };

export class Route {
  readonly request: { url: string; method: string };
  private settled = false;

  constructor(
    url: string,
    method: string,
    private readonly _resolve: (action: RouteAction) => void,
  ) {
    this.request = { url, method };
  }

  async fulfill(options: FulfillOptions = {}): Promise<void> {
    if (this.settled) return;
    this.settled = true;
    this._resolve({ type: 'fulfill', ...options });
  }

  async abort(): Promise<void> {
    if (this.settled) return;
    this.settled = true;
    this._resolve({ type: 'abort' });
  }

  async continue(): Promise<void> {
    if (this.settled) return;
    this.settled = true;
    this._resolve({ type: 'continue' });
  }
}
