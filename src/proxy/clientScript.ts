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

  // ---- keyboard support ----

  const KEY_DEFINITIONS = {
    'Shift':      { key: 'Shift',      code: 'ShiftLeft',   keyCode: 16 },
    'Control':    { key: 'Control',    code: 'ControlLeft', keyCode: 17 },
    'Alt':        { key: 'Alt',        code: 'AltLeft',     keyCode: 18 },
    'Meta':       { key: 'Meta',       code: 'MetaLeft',    keyCode: 91 },
    'Enter':      { key: 'Enter',      code: 'Enter',       keyCode: 13 },
    'Tab':        { key: 'Tab',        code: 'Tab',         keyCode: 9  },
    'Space':      { key: ' ',          code: 'Space',       keyCode: 32 },
    ' ':          { key: ' ',          code: 'Space',       keyCode: 32 },
    'Backspace':  { key: 'Backspace',  code: 'Backspace',   keyCode: 8  },
    'Delete':     { key: 'Delete',     code: 'Delete',      keyCode: 46 },
    'Insert':     { key: 'Insert',     code: 'Insert',      keyCode: 45 },
    'Escape':     { key: 'Escape',     code: 'Escape',      keyCode: 27 },
    'ArrowLeft':  { key: 'ArrowLeft',  code: 'ArrowLeft',   keyCode: 37 },
    'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight',  keyCode: 39 },
    'ArrowUp':    { key: 'ArrowUp',    code: 'ArrowUp',     keyCode: 38 },
    'ArrowDown':  { key: 'ArrowDown',  code: 'ArrowDown',   keyCode: 40 },
    'Home':       { key: 'Home',       code: 'Home',        keyCode: 36 },
    'End':        { key: 'End',        code: 'End',         keyCode: 35 },
    'PageUp':     { key: 'PageUp',     code: 'PageUp',      keyCode: 33 },
    'PageDown':   { key: 'PageDown',   code: 'PageDown',    keyCode: 34 },
    'F1':  { key: 'F1',  code: 'F1',  keyCode: 112 },
    'F2':  { key: 'F2',  code: 'F2',  keyCode: 113 },
    'F3':  { key: 'F3',  code: 'F3',  keyCode: 114 },
    'F4':  { key: 'F4',  code: 'F4',  keyCode: 115 },
    'F5':  { key: 'F5',  code: 'F5',  keyCode: 116 },
    'F6':  { key: 'F6',  code: 'F6',  keyCode: 117 },
    'F7':  { key: 'F7',  code: 'F7',  keyCode: 118 },
    'F8':  { key: 'F8',  code: 'F8',  keyCode: 119 },
    'F9':  { key: 'F9',  code: 'F9',  keyCode: 120 },
    'F10': { key: 'F10', code: 'F10', keyCode: 121 },
    'F11': { key: 'F11', code: 'F11', keyCode: 122 },
    'F12': { key: 'F12', code: 'F12', keyCode: 123 },
  };

  const MODIFIER_KEY_NAMES = ['Shift', 'Control', 'Alt', 'Meta'];
  const currentModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };

  function resolveKey(keyName) {
    const def = KEY_DEFINITIONS[keyName];
    if (def) return def;
    if (keyName.length === 1) {
      const upper = keyName.toUpperCase();
      const isLetter = upper >= 'A' && upper <= 'Z';
      const code = isLetter ? ('Key' + upper) : ('Digit' + upper);
      return { key: keyName, code, keyCode: upper.charCodeAt(0) };
    }
    return { key: keyName, code: keyName, keyCode: 0 };
  }

  function parseCompoundKey(keyStr) {
    const parts = keyStr.split('+');
    const modifiers = parts.slice(0, -1).filter(p => MODIFIER_KEY_NAMES.includes(p));
    return { modifiers, key: parts[parts.length - 1] };
  }

  function setModifier(key, active) {
    if (key === 'Shift')   currentModifiers.shiftKey = active;
    if (key === 'Control') currentModifiers.ctrlKey  = active;
    if (key === 'Alt')     currentModifiers.altKey   = active;
    if (key === 'Meta')    currentModifiers.metaKey  = active;
  }

  function dispatchKeyEvent(type, keyDef) {
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent(type, {
      key: keyDef.key,
      code: keyDef.code,
      keyCode: keyDef.keyCode,
      which: keyDef.keyCode,
      charCode: type === 'keypress' ? keyDef.keyCode : 0,
      bubbles: true,
      cancelable: true,
      shiftKey: currentModifiers.shiftKey,
      ctrlKey:  currentModifiers.ctrlKey,
      altKey:   currentModifiers.altKey,
      metaKey:  currentModifiers.metaKey,
    }));
  }

  function insertCharIntoActive(ch) {
    const el = document.activeElement;
    if (!el) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const start = el.selectionStart != null ? el.selectionStart : el.value.length;
      const end   = el.selectionEnd   != null ? el.selectionEnd   : el.value.length;
      const desc  = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      const newValue = el.value.slice(0, start) + ch + el.value.slice(end);
      if (desc && desc.set) desc.set.call(el, newValue); else el.value = newValue;
      el.selectionStart = el.selectionEnd = start + ch.length;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: ch }));
    } else if (el.isContentEditable) {
      document.execCommand('insertText', false, ch);
    }
  }

  // ---- mouse support ----

  let mouseX = 0;
  let mouseY = 0;
  let mouseButtons = 0; // bitmask: 1=left, 2=right, 4=middle

  function resolveButton(name) {
    if (name === 'middle') return { button: 1, mask: 4 };
    if (name === 'right')  return { button: 2, mask: 2 };
    return { button: 0, mask: 1 };
  }

  // Dispatches a MouseEvent at (x, y) and returns the target element.
  function fireMouseEvent(type, x, y, button, clickCount) {
    const el = document.elementFromPoint(x, y) || document.body;
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button,
      buttons: mouseButtons,
      detail: clickCount,
      shiftKey: currentModifiers.shiftKey,
      ctrlKey:  currentModifiers.ctrlKey,
      altKey:   currentModifiers.altKey,
      metaKey:  currentModifiers.metaKey,
    }));
    return el;
  }

  // Apply the side-effect of pressing a key (character insertion, form submission, etc.)
  function handleKeyEffect(mainKey) {
    const keyDef = resolveKey(mainKey);
    const ch = keyDef.key;

    if (mainKey === 'Enter') {
      const el = document.activeElement;
      if (el && el.tagName === 'TEXTAREA') {
        insertCharIntoActive('\n');
      } else if (el && el.form) {
        const submitBtn = el.form.querySelector('[type="submit"]');
        if (submitBtn) submitBtn.click();
        else if (el.form.requestSubmit) el.form.requestSubmit();
        else el.form.submit();
      }
    } else if (mainKey === 'Backspace') {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        const start = el.selectionStart != null ? el.selectionStart : el.value.length;
        const end   = el.selectionEnd   != null ? el.selectionEnd   : el.value.length;
        const desc  = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
        let newVal, newPos;
        if (start !== end) {
          newVal = el.value.slice(0, start) + el.value.slice(end); newPos = start;
        } else if (start > 0) {
          newVal = el.value.slice(0, start - 1) + el.value.slice(start); newPos = start - 1;
        } else {
          return;
        }
        if (desc && desc.set) desc.set.call(el, newVal); else el.value = newVal;
        el.selectionStart = el.selectionEnd = newPos;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      }
    } else if (mainKey === 'Delete') {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        const start = el.selectionStart != null ? el.selectionStart : el.value.length;
        const end   = el.selectionEnd   != null ? el.selectionEnd   : el.value.length;
        const desc  = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
        let newVal;
        if (start !== end) {
          newVal = el.value.slice(0, start) + el.value.slice(end);
        } else if (start < el.value.length) {
          newVal = el.value.slice(0, start) + el.value.slice(start + 1);
        } else {
          return;
        }
        if (desc && desc.set) desc.set.call(el, newVal); else el.value = newVal;
        el.selectionStart = el.selectionEnd = start;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      }
    } else if (ch.length === 1 && !currentModifiers.ctrlKey && !currentModifiers.metaKey) {
      const actualChar = currentModifiers.shiftKey ? ch.toUpperCase() : ch;
      insertCharIntoActive(actualChar);
    }
  }

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

        case 'keyboardDown': {
          if (MODIFIER_KEY_NAMES.includes(cmd.key)) setModifier(cmd.key, true);
          dispatchKeyEvent('keydown', resolveKey(cmd.key));
          break;
        }

        case 'keyboardUp': {
          dispatchKeyEvent('keyup', resolveKey(cmd.key));
          if (MODIFIER_KEY_NAMES.includes(cmd.key)) setModifier(cmd.key, false);
          break;
        }

        case 'keyboardPress': {
          const { modifiers, key: mainKey } = parseCompoundKey(cmd.key);

          for (const mod of modifiers) {
            setModifier(mod, true);
            dispatchKeyEvent('keydown', resolveKey(mod));
          }

          const pressKeyDef = resolveKey(mainKey);
          dispatchKeyEvent('keydown', pressKeyDef);
          if (cmd.delay) await delay(cmd.delay);

          const isPrintable = pressKeyDef.key.length === 1;
          if (isPrintable || mainKey === 'Enter' || mainKey === 'Backspace' || mainKey === 'Delete') {
            if (isPrintable) dispatchKeyEvent('keypress', pressKeyDef);
            handleKeyEffect(mainKey);
          }

          dispatchKeyEvent('keyup', pressKeyDef);

          for (let i = modifiers.length - 1; i >= 0; i--) {
            dispatchKeyEvent('keyup', resolveKey(modifiers[i]));
            setModifier(modifiers[i], false);
          }
          break;
        }

        case 'keyboardType': {
          for (const ch of cmd.text) {
            const typeKeyDef = resolveKey(ch);
            dispatchKeyEvent('keydown', typeKeyDef);
            dispatchKeyEvent('keypress', typeKeyDef);
            insertCharIntoActive(ch);
            dispatchKeyEvent('keyup', typeKeyDef);
            if (cmd.delay) await delay(cmd.delay);
          }
          break;
        }

        case 'keyboardInsertText': {
          const el = document.activeElement;
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
            const start = el.selectionStart != null ? el.selectionStart : el.value.length;
            const end   = el.selectionEnd   != null ? el.selectionEnd   : el.value.length;
            const desc  = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
            const newValue = el.value.slice(0, start) + cmd.text + el.value.slice(end);
            if (desc && desc.set) desc.set.call(el, newValue); else el.value = newValue;
            el.selectionStart = el.selectionEnd = start + cmd.text.length;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            document.execCommand('insertText', false, cmd.text);
          }
          break;
        }

        case 'mouseMove': {
          const steps = Math.max(1, cmd.steps || 1);
          const fromX = mouseX;
          const fromY = mouseY;
          for (let i = 1; i <= steps; i++) {
            const sx = Math.round(fromX + (cmd.x - fromX) * i / steps);
            const sy = Math.round(fromY + (cmd.y - fromY) * i / steps);
            fireMouseEvent('mousemove', sx, sy, 0, 0);
          }
          mouseX = cmd.x;
          mouseY = cmd.y;
          break;
        }

        case 'mouseDown': {
          const { button: mdBtn, mask: mdMask } = resolveButton(cmd.button);
          mouseButtons |= mdMask;
          fireMouseEvent('mousedown', mouseX, mouseY, mdBtn, cmd.clickCount || 1);
          break;
        }

        case 'mouseUp': {
          const { button: muBtn, mask: muMask } = resolveButton(cmd.button);
          mouseButtons &= ~muMask;
          fireMouseEvent('mouseup', mouseX, mouseY, muBtn, cmd.clickCount || 1);
          break;
        }

        case 'mouseClick': {
          const { button: mcBtn, mask: mcMask } = resolveButton(cmd.button);
          const clickCount = cmd.clickCount || 1;
          mouseX = cmd.x; mouseY = cmd.y;
          fireMouseEvent('mousemove', cmd.x, cmd.y, 0, 0);
          for (let i = 0; i < clickCount; i++) {
            mouseButtons |= mcMask;
            const downEl = fireMouseEvent('mousedown', cmd.x, cmd.y, mcBtn, i + 1);
            if (cmd.delay) await delay(cmd.delay);
            mouseButtons &= ~mcMask;
            fireMouseEvent('mouseup', cmd.x, cmd.y, mcBtn, i + 1);
            // Use trusted .click() for left button so default actions (form submit, links) fire.
            if (mcBtn === 0) downEl.click(); else fireMouseEvent('click', cmd.x, cmd.y, mcBtn, i + 1);
          }
          break;
        }

        case 'mouseDblclick': {
          const { button: dbBtn, mask: dbMask } = resolveButton(cmd.button);
          mouseX = cmd.x; mouseY = cmd.y;
          fireMouseEvent('mousemove', cmd.x, cmd.y, 0, 0);
          for (const detail of [1, 2]) {
            mouseButtons |= dbMask;
            const downEl = fireMouseEvent('mousedown', cmd.x, cmd.y, dbBtn, detail);
            if (cmd.delay) await delay(cmd.delay);
            mouseButtons &= ~dbMask;
            fireMouseEvent('mouseup', cmd.x, cmd.y, dbBtn, detail);
            if (dbBtn === 0) downEl.click(); else fireMouseEvent('click', cmd.x, cmd.y, dbBtn, detail);
          }
          fireMouseEvent('dblclick', cmd.x, cmd.y, dbBtn, 2);
          break;
        }

        case 'mouseWheel': {
          const wheelEl = document.elementFromPoint(mouseX, mouseY) || document.body;
          wheelEl.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: mouseX,
            clientY: mouseY,
            deltaX: cmd.deltaX,
            deltaY: cmd.deltaY,
            deltaMode: 0,
          }));
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