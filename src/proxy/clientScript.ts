// Browser-side script injected into every proxied page.
// Connects back to the proxy via WebSocket and handles automation commands.
export const CLIENT_SCRIPT = `(function () {
  'use strict';

  const proxyHost = location.host;
  let ws;

  function send(msg) {
    if (ws && ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(msg));
  }

  // Waits until document.querySelector(selector) returns an element, or rejects
  // after timeout ms. Resolves immediately if the element is already present.
  function waitForElement(selector, timeout) {
    const el = document.querySelector(selector);
    if (el) return Promise.resolve(el);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timeout (' + timeout + 'ms) waiting for: ' + selector));
      }, timeout);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    });
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  async function handleCommand(cmd) {
    let result = { id: cmd.id, success: true };
    const timeout = cmd.timeout ?? 30000;

    try {
      switch (cmd.type) {
        case 'navigate':
          window.location.href = cmd.url;
          return; // page navigates away — no response expected

        case 'fill': {
          const el = await waitForElement(cmd.selector, timeout);
          el.focus();

          // Use the prototype-level native setter so React's instance-level
          // descriptor (which would discard the change on next render) is
          // bypassed. The bubbling InputEvent then triggers React's onChange,
          // which updates its internal state.
          const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
          if (descriptor && descriptor.set) {
            descriptor.set.call(el, cmd.value);
          } else {
            el.value = cmd.value;
          }

          await delay(16);
          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
          await delay(16);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          await delay(16);
          break;
        }

        case 'click': {
          const el = await waitForElement(cmd.selector, timeout);
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true }));
          break;
        }

        case 'evaluate': {
          const fn = new Function('return (' + cmd.expression + ')');
          result.result = await Promise.resolve(fn.call(window));
          break;
        }

        case 'waitForSelector': {
          await waitForElement(cmd.selector, timeout);
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
      setTimeout(connect, 500);
    };

    ws.onerror = function (e) {
      console.error('[proxy-client] ws error', e);
    };
  }

  connect();
})();`;
