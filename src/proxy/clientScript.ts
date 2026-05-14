// @ts-nocheck
// Browser-side script injected into every proxied page.
// Connects back to the proxy via WebSocket and handles automation commands.
export const CLIENT_SCRIPT = `(${clientScript.toString()})()`;

function clientScript() {
  'use strict';

  const proxyHost = location.host;
  let ws;

  function send(msg) {
    if (ws && ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(msg));
  }

  // ---- locator resolution ----

  // Resolve a steps array against a root NodeList scope, returning matched elements.
  function resolveLocator(steps, scope) {
    let nodes = scope ? Array.from(scope) : [document];

    for (const step of steps) {
      let next = [];

      switch (step.type) {
        case 'css': {
          for (const root of nodes) {
            next.push(...Array.from(root.querySelectorAll ? root.querySelectorAll(step.selector) : []));
          }
          break;
        }

        case 'getByText': {
          const allEls = [];
          for (const root of nodes) {
            allEls.push(...Array.from(root.querySelectorAll ? root.querySelectorAll('*') : []));
          }
          next = allEls.filter(el => {
            const text = el.textContent || '';
            return step.exact ? text.trim() === step.text : text.includes(step.text);
          });
          break;
        }

        case 'getByRole': {
          const allEls = [];
          for (const root of nodes) {
            allEls.push(...Array.from(root.querySelectorAll ? root.querySelectorAll('*') : []));
          }
          next = allEls.filter(el => {
            const role = el.getAttribute('role') || inferRole(el);
            if (role !== step.role) return false;
            if (!step.name) return true;
            const label = el.getAttribute('aria-label') || el.textContent || '';
            return step.exact ? label.trim() === step.name : label.includes(step.name);
          });
          break;
        }

        case 'getByLabel': {
          const inputs = [];
          for (const root of nodes) {
            inputs.push(...Array.from(root.querySelectorAll ? root.querySelectorAll('input,select,textarea') : []));
          }
          next = inputs.filter(input => {
            const label = findLabelText(input);
            return step.exact ? label.trim() === step.text : label.includes(step.text);
          });
          break;
        }

        case 'getByPlaceholder': {
          const inputs = [];
          for (const root of nodes) {
            inputs.push(...Array.from(root.querySelectorAll ? root.querySelectorAll('[placeholder]') : []));
          }
          next = inputs.filter(el => {
            const ph = el.getAttribute('placeholder') || '';
            return step.exact ? ph === step.text : ph.includes(step.text);
          });
          break;
        }

        case 'getByTestId': {
          for (const root of nodes) {
            next.push(...Array.from(root.querySelectorAll ? root.querySelectorAll('[data-testid="' + step.testId + '"]') : []));
          }
          break;
        }

        case 'filter': {
          next = nodes.filter(el => {
            if (step.hasText !== undefined) {
              if (!(el.textContent || '').includes(step.hasText)) return false;
            }
            if (step.has) {
              const inner = resolveLocator(step.has, [el]);
              if (inner.length === 0) return false;
            }
            return true;
          });
          break;
        }

        case 'first':
          next = nodes.length > 0 ? [nodes[0]] : [];
          break;

        case 'last':
          next = nodes.length > 0 ? [nodes[nodes.length - 1]] : [];
          break;

        case 'nth':
          next = step.index < nodes.length ? [nodes[step.index]] : [];
          break;

        default:
          next = nodes;
      }

      nodes = next;
    }

    return nodes;
  }

  function inferRole(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'button' || (tag === 'input' && type === 'button') || (tag === 'input' && type === 'submit')) return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'input' && type === 'checkbox') return 'checkbox';
    if (tag === 'input' && type === 'radio') return 'radio';
    if (tag === 'input' || tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'img') return 'img';
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'heading';
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'list' || tag === 'ul' || tag === 'ol') return 'list';
    if (tag === 'listitem' || tag === 'li') return 'listitem';
    return '';
  }

  function findLabelText(input) {
    const id = input.id;
    if (id) {
      const label = document.querySelector('label[for="' + id + '"]');
      if (label) return label.textContent || '';
    }
    const parent = input.closest('label');
    if (parent) return parent.textContent || '';
    return input.getAttribute('aria-label') || '';
  }

  // Resolves elements (steps-based or legacy selector), polling until at least
  // one element is found or timeout expires.
  function getEl(cmd, timeout) {
    if (cmd.steps) {
      const els = resolveLocator(cmd.steps, null);
      if (els.length > 0) return Promise.resolve(els[0]);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error('Timeout (' + timeout + 'ms) waiting for locator'));
        }, timeout);

        const observer = new MutationObserver(() => {
          const found = resolveLocator(cmd.steps, null);
          if (found.length > 0) {
            clearTimeout(timer);
            observer.disconnect();
            resolve(found[0]);
          }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      });
    }

    return waitForElement(cmd.selector, timeout);
  }

  // ---- legacy waitForElement (CSS selector) ----

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
          const el = await getEl(cmd, timeout);
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
          const el = await getEl(cmd, timeout);
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
          // Use the native .click() so the event is trusted — untrusted synthetic
          // click events don't trigger browser default actions like form submission.
          el.click();
          break;
        }

        case 'evaluate': {
          const fn = new Function('return (' + cmd.expression + ')');
          result.result = await Promise.resolve(fn.call(window));
          break;
        }

        case 'innerText': {
          const el = await getEl(cmd, timeout);
          result.result = el.innerText;
          break;
        }

        case 'inputValue': {
          const el = await getEl(cmd, timeout);
          result.result = el.value;
          break;
        }

        case 'isVisible': {
          const els = cmd.steps ? resolveLocator(cmd.steps, null) : (document.querySelector(cmd.selector) ? [document.querySelector(cmd.selector)] : []);
          if (els.length === 0) { result.result = false; break; }
          const rect = els[0].getBoundingClientRect();
          result.result = rect.width > 0 && rect.height > 0 && getComputedStyle(els[0]).visibility !== 'hidden';
          break;
        }

        case 'count': {
          const els = cmd.steps ? resolveLocator(cmd.steps, null) : Array.from(document.querySelectorAll(cmd.selector));
          result.result = els.length;
          break;
        }

        case 'waitForSelector': {
          await waitForElement(cmd.selector, timeout);
          break;
        }

        case 'waitForLocator': {
          await getEl(cmd, timeout);
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

  // Intercept GET form submissions. When the browser submits a GET form it
  // replaces the action URL's query string with the form fields, which drops
  // the ?url= parameter and causes "missing url parameter". We catch the
  // submit event first, reconstruct the real target URL with form data
  // appended, then navigate through the proxy ourselves.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    if ((form.method || 'get').toLowerCase() !== 'get') return;

    var actionUrl;
    try { actionUrl = new URL(form.action); } catch (err) { return; }
    if (actionUrl.pathname !== '/__proxy/fetch') return;

    e.preventDefault();

    var realTarget = actionUrl.searchParams.get('url');
    if (!realTarget) return;

    var targetUrl;
    try { targetUrl = new URL(realTarget); } catch (err) { return; }

    new FormData(form).forEach(function (value, key) {
      targetUrl.searchParams.set(key, String(value));
    });

    window.location.href = '/__proxy/fetch?url=' + encodeURIComponent(targetUrl.href);
  }, true);
};