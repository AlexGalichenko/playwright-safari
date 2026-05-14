import { URL } from 'url';
import { CLIENT_SCRIPT } from './clientScript';

const SKIP_PREFIXES = ['data:', 'javascript:', 'mailto:', '#', 'blob:', '/__proxy/'];
const URL_ATTRS = ['href', 'src', 'action', 'data-src', 'poster'];

// Rewrites all URL attributes to route through the proxy and injects the
// automation client script so the browser can receive commands via WebSocket.
export function rewriteHtml(html: string, originalUrl: string, proxyPort: number): string {
  const base = new URL(originalUrl);

  function rewrite(url: string): string {
    if (!url) return url;
    if (SKIP_PREFIXES.some(p => url.startsWith(p))) return url;
    try {
      const absolute = new URL(url, base).href;
      return `/__proxy/fetch?url=${encodeURIComponent(absolute)}`;
    } catch {
      return url;
    }
  }

  const attrPattern = new RegExp(
    `(\\s(?:${URL_ATTRS.join('|')})\\s*=\\s*)(['"])(.*?)\\2`,
    'gis',
  );

  let result = html.replace(attrPattern, (_m, attrEq, quote, url) =>
    `${attrEq}${quote}${rewrite(url)}${quote}`,
  );

  // Strip inline CSP meta tags — HTTP-header CSP is already removed in ProxyServer,
  // but sites can also set policy via <meta http-equiv="Content-Security-Policy">.
  result = result.replace(
    /<meta[^>]+http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi,
    '',
  );

  const injectedScript = `<script>\n${CLIENT_SCRIPT}\n</script>`;

  if (/<\/head>/i.test(result)) {
    result = result.replace(/<\/head>/i, `${injectedScript}\n</head>`);
  } else if (/<body[^>]*>/i.test(result)) {
    result = result.replace(/(<body[^>]*>)/i, `$1\n${injectedScript}`);
  } else {
    result = injectedScript + '\n' + result;
  }

  return result;
}
