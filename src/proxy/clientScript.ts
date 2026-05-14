// Browser-side script injected into every proxied page.
// Connects back to the proxy via WebSocket and handles automation commands.
export const CLIENT_SCRIPT = `(function () {
  'use strict';

  const proxyHost = location.host;
  let ws;

  function send(msg) {
    if (ws && ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(msg));
  }

  async function handleCommand(cmd) {
    let result = { id: cmd.id, success: true };

    try {
      switch (cmd.type) {
        case 'navigate':
          window.location.href = cmd.url;
          return; // page navigates away — no response expected
        case 'fill': {
          const el = document.querySelector(cmd.selector);
          if (!el) throw new Error('Element not found: ' + cmd.selector);
          el.focus();
          el.value = cmd.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
        case 'click': {
          const el = document.querySelector(cmd.selector);
          if (!el) throw new Error('Element not found: ' + cmd.selector);
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true }));
          break;
        }
        case 'evaluate': {
          // new Function wraps the expression so it can return a value.
          const fn = new Function('return (' + cmd.expression + ')');
          result.result = await Promise.resolve(fn.call(window));
          break;
        }
        default:
          throw new Error('Unknown command type: ' + cmd.type);
      }
    } catch (e) {
      result = { id: cmd.id, success: false, error: e.message };
    }

    send(result);
  }

  function connect() {
    ws = new WebSocket('ws://' + proxyHost + '/__proxy/ws');

    ws.onmessage = function (event) {
      try { handleCommand(JSON.parse(event.data)); }
      catch (e) { console.error('[proxy-client] parse error', e); }
    };

    ws.onclose = function () {
      // Reconnect on unexpected disconnect (not triggered by navigation,
      // since the page would be unloading anyway).
      setTimeout(connect, 500);
    };

    ws.onerror = function (e) {
      console.error('[proxy-client] ws error', e);
    };
  }

  connect();
})();`;
