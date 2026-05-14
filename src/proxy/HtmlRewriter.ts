import { URL } from 'url';
import { CLIENT_SCRIPT } from './clientScript';

const SKIP_PREFIXES = ['data:', 'javascript:', 'mailto:', '#', 'blob:', '/__proxy/'];
const URL_ATTRS = ['href', 'src', 'action', 'data-src', 'poster'];

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function makeRewriter(base: URL) {
  return function rewrite(url: string): string {
    if (!url) return url;
    url = decodeEntities(url.trim());
    if (SKIP_PREFIXES.some(p => url.startsWith(p))) return url;
    try {
      const absolute = new URL(url, base).href;
      return `/__proxy/fetch?url=${encodeURIComponent(absolute)}`;
    } catch {
      return url;
    }
  };
}

// Rewrites srcset attribute value: "url 1x, url 2x" or "url 100w, url 200w"
function rewriteSrcset(srcset: string, rewrite: (url: string) => string): string {
  return srcset
    .split(',')
    .map(part => {
      const trimmed = part.trim();
      const spaceIdx = trimmed.search(/\s+\S+$/);
      if (spaceIdx === -1) return rewrite(trimmed);
      const url = trimmed.slice(0, spaceIdx);
      const descriptor = trimmed.slice(spaceIdx);
      return rewrite(url) + descriptor;
    })
    .join(', ');
}

// Rewrites url() references inside CSS text.
export function rewriteCss(css: string, originalUrl: string): string {
  const base = new URL(originalUrl);
  const rewrite = makeRewriter(base);
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_m, quote, url) => {
    return `url(${quote}${rewrite(url)}${quote})`;
  });
}

// Rewrites all URL attributes to route through the proxy and injects the
// automation client script so the browser can receive commands via WebSocket.
export function rewriteHtml(html: string, originalUrl: string, proxyPort: number): string {
  const base = new URL(originalUrl);
  const rewrite = makeRewriter(base);

  const attrPattern = new RegExp(
    `(\\s(?:${URL_ATTRS.join('|')})\\s*=\\s*)(['"])(.*?)\\2`,
    'gis',
  );

  let result = html.replace(attrPattern, (_m, attrEq, quote, url) =>
    `${attrEq}${quote}${rewrite(url)}${quote}`,
  );

  // Rewrite srcset attributes (syntax differs from plain URL attrs)
  result = result.replace(
    /(\ssrcset\s*=\s*)(['"])(.*?)\2/gis,
    (_m, attrEq, quote, srcset) =>
      `${attrEq}${quote}${rewriteSrcset(srcset, rewrite)}${quote}`,
  );

  // Strip inline CSP meta tags — HTTP-header CSP is already removed in ProxyServer,
  // but sites can also set policy via <meta http-equiv="Content-Security-Policy">.
  result = result.replace(
    /<meta[^>]+http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/gi,
    '',
  );

  // Restore the original URL path before any app scripts run. SPAs (React
  // Router etc.) read window.location.pathname for routing; without this they
  // see "/__proxy/fetch" and render nothing.
  const originalPath = base.pathname + base.search + base.hash || '/';
  const headScript = `<script>
history.replaceState(null, '', ${JSON.stringify(originalPath)});
${CLIENT_SCRIPT}
</script>`;

  // Inject at the opening of <head> so it executes before any deferred/async
  // bundles have a chance to read window.location.
  if (/<head[^>]*>/i.test(result)) {
    result = result.replace(/(<head[^>]*>)/i, `$1\n${headScript}`);
  } else if (/<body[^>]*>/i.test(result)) {
    result = result.replace(/(<body[^>]*>)/i, `$1\n${headScript}`);
  } else {
    result = headScript + '\n' + result;
  }

  return result;
}
