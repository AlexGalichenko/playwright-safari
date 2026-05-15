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

  // ---- SPA URL tracking ----
  // Intercept pushState/replaceState so page.url() stays accurate after client-side navigation.
  // The initial replaceState('/', ...) from our HTML rewriter fires before this code runs,
  // so it is not intercepted — window.__pw_url is already set correctly in the headScript.
  const _origPushState = history.pushState.bind(history);
  const _origReplaceState = history.replaceState.bind(history);
  const _updatePwUrl = function (url) {
    if (!url) return;
    try { window.__pw_url = new URL(String(url), window.__pw_url || location.href).href; } catch (e) {}
  };
  history.pushState    = function (state, title, url) { _updatePwUrl(url); return _origPushState(state, title, url); };
  history.replaceState = function (state, title, url) { _updatePwUrl(url); return _origReplaceState(state, title, url); };

  // ---- dialog interception ----
  // Override alert/confirm/prompt so they don't block JS execution.
  // A 'setDialogResponse' command pre-sets what confirm/prompt returns.
  let _nextDialogResponse = { accept: false, promptText: null };
  window.alert = function (msg) {
    send({ type: 'event', name: 'dialog', dialogType: 'alert', message: String(msg || '') });
  };
  window.confirm = function (msg) {
    const r = _nextDialogResponse;
    _nextDialogResponse = { accept: false, promptText: null };
    send({ type: 'event', name: 'dialog', dialogType: 'confirm', message: String(msg || '') });
    return r.accept;
  };
  window.prompt = function (msg, def) {
    const r = _nextDialogResponse;
    _nextDialogResponse = { accept: false, promptText: null };
    send({ type: 'event', name: 'dialog', dialogType: 'prompt', message: String(msg || ''), defaultValue: String(def || '') });
    return r.accept ? (r.promptText !== null ? r.promptText : String(def || '')) : null;
  };

  // ---- console forwarding ----
  const _origConsole = {};
  ['log', 'warn', 'error', 'info', 'debug'].forEach(function (level) {
    _origConsole[level] = console[level];
    console[level] = function () {
      _origConsole[level].apply(console, arguments);
      const args = Array.from(arguments).map(function (a) {
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e2) { return String(a); }
      });
      send({ type: 'event', name: 'console', level: level, args: args });
    };
  });

  // ---- frame helpers ----

  // Resolve a frameId to its document. An empty/missing frameId means the main document.
  // Formats:
  //   ''             → main document
  //   'myname'       → iframe[name="myname"].contentDocument
  //   '__frame_N'    → window.frames[N].document  (positional, unnamed iframe)
  //   '__selector:<css>' → document.querySelector(css).contentDocument
  //   '__selector:<css>\n__selector:<css2>' → nested iframes (chained)
  function getFrameDoc(frameId) {
    if (!frameId) return document;
    // CSS-selector-based lookup (from frameLocator API). Supports chaining for
    // nested iframes: each selector is separated by a newline.
    if (frameId.startsWith('__selector:')) {
      const parts = frameId.split('\n__selector:');
      let doc = document;
      for (let i = 0; i < parts.length; i++) {
        const sel = i === 0 ? parts[0].slice(11) : parts[i];
        const iframe = doc.querySelector(sel);
        if (!iframe || !iframe.contentDocument) return document;
        doc = iframe.contentDocument;
      }
      return doc;
    }
    // Name-attribute lookup
    const safe = frameId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const iframe = document.querySelector('iframe[name="' + safe + '"]');
    if (iframe && iframe.contentDocument) return iframe.contentDocument;
    // Positional index lookup
    if (frameId.startsWith('__frame_')) {
      const idx = parseInt(frameId.slice(8), 10);
      if (!isNaN(idx) && window.frames[idx]) return window.frames[idx].document;
    }
    return document;
  }

  // ---- locator resolution ----

  // Resolve a steps array against a root NodeList scope, returning matched elements.
  function resolveLocator(steps, scope, rootDoc) {
    rootDoc = rootDoc || document;
    let nodes = scope ? Array.from(scope) : [rootDoc];

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
            const label = findLabelText(input, rootDoc);
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
              const text = el.textContent || '';
              const value = el.value || '';
              if (!text.includes(step.hasText) && !value.includes(step.hasText)) return false;
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

  function findLabelText(input, rootDoc) {
    rootDoc = rootDoc || document;
    const id = input.id;
    if (id) {
      const label = rootDoc.querySelector('label[for="' + id + '"]');
      if (label) return label.textContent || '';
    }
    const parent = input.closest('label');
    if (parent) return parent.textContent || '';
    return input.getAttribute('aria-label') || '';
  }

  // Resolves elements (steps-based or legacy selector), polling until at least
  // one element is found or timeout expires.
  function getEl(cmd, timeout, rootDoc) {
    rootDoc = rootDoc || document;
    if (cmd.steps) {
      const els = resolveLocator(cmd.steps, null, rootDoc);
      if (els.length > 0) return Promise.resolve(els[0]);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(new Error('Timeout (' + timeout + 'ms) waiting for locator'));
        }, timeout);

        const observer = new MutationObserver(() => {
          const found = resolveLocator(cmd.steps, null, rootDoc);
          if (found.length > 0) {
            clearTimeout(timer);
            observer.disconnect();
            resolve(found[0]);
          }
        });

        observer.observe(rootDoc.documentElement, { childList: true, subtree: true, attributes: true });
      });
    }

    return waitForElement(cmd.selector, timeout, rootDoc);
  }

  // ---- legacy waitForElement (CSS selector) ----

  function waitForElement(selector, timeout, rootDoc) {
    rootDoc = rootDoc || document;
    const el = rootDoc.querySelector(selector);
    if (el) return Promise.resolve(el);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timeout (' + timeout + 'ms) waiting for: ' + selector));
      }, timeout);

      const observer = new MutationObserver(() => {
        const found = rootDoc.querySelector(selector);
        if (found) {
          clearTimeout(timer);
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(rootDoc.documentElement, {
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

  function dispatchKeyEvent(type, keyDef, target) {
    target = target || document.activeElement || document.body;
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

  function insertCharIntoActive(ch, el) {
    el = el || document.activeElement;
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
  // el: the currently-focused element (defaults to document.activeElement)
  function handleKeyEffect(mainKey, el) {
    const keyDef = resolveKey(mainKey);
    const ch = keyDef.key;
    el = el || document.activeElement;

    if (mainKey === 'Enter') {
      if (el && el.tagName === 'TEXTAREA') {
        insertCharIntoActive('\n', el);
      } else if (el && el.form) {
        const submitBtn = el.form.querySelector('[type="submit"]');
        if (submitBtn) submitBtn.click();
        else if (el.form.requestSubmit) el.form.requestSubmit();
        else el.form.submit();
      }
    } else if (mainKey === 'Backspace') {
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
      insertCharIntoActive(actualChar, el);
    }
  }

  async function handleCommand(cmd) {
    let result = { id: cmd.id, success: true };
    const timeout = cmd.timeout ?? 30000;
    const frameDoc = getFrameDoc(cmd.frameId);
    const frameWin = frameDoc.defaultView || window;

    try {
      switch (cmd.type) {
        case 'navigate':
          window.location.href = cmd.url;
          return; // page navigates away — no response expected

        case 'fill': {
          const el = await getEl(cmd, timeout, frameDoc);
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
          const el = await getEl(cmd, timeout, frameDoc);
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true }));
          // Use the native .click() so the event is trusted — untrusted synthetic
          // click events don't trigger browser default actions like form submission.
          el.click();
          // Explicitly focus the element after clicking
          el.focus();
          break;
        }

        case 'evaluate': {
          // Use the frame's eval so expressions reference the correct window/document.
          // Try wrapped in () first so object literals like { k: v } work as expressions;
          // if that raises SyntaxError (e.g. const/let declarations), eval bare.
          let evalResult;
          try {
            evalResult = frameWin.eval('(' + cmd.expression + ')');
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
            evalResult = frameWin.eval(cmd.expression);
          }
          result.result = await Promise.resolve(evalResult);
          break;
        }

        case 'innerText': {
          const el = await getEl(cmd, timeout, frameDoc);
          result.result = el.innerText;
          break;
        }

        case 'inputValue': {
          const el = await getEl(cmd, timeout, frameDoc);
          result.result = el.value;
          break;
        }

        case 'isVisible': {
          const els = cmd.steps ? resolveLocator(cmd.steps, null, frameDoc) : (frameDoc.querySelector(cmd.selector) ? [frameDoc.querySelector(cmd.selector)] : []);
          if (els.length === 0) { result.result = false; break; }
          const rect = els[0].getBoundingClientRect();
          result.result = rect.width > 0 && rect.height > 0 && getComputedStyle(els[0]).visibility !== 'hidden';
          break;
        }

        case 'count': {
          const els = cmd.steps ? resolveLocator(cmd.steps, null, frameDoc) : Array.from(frameDoc.querySelectorAll(cmd.selector));
          result.result = els.length;
          break;
        }

        case 'waitForSelector': {
          await waitForElement(cmd.selector, timeout, frameDoc);
          break;
        }

        case 'waitForLocator': {
          await getEl(cmd, timeout, frameDoc);
          break;
        }

        // ---- DOM queries ----

        case 'allInnerTexts': {
          const aitEls = cmd.steps ? resolveLocator(cmd.steps, null, frameDoc) : Array.from(frameDoc.querySelectorAll(cmd.selector));
          result.result = aitEls.map(el => el.innerText);
          break;
        }

        case 'allTextContents': {
          const atcEls = cmd.steps ? resolveLocator(cmd.steps, null, frameDoc) : Array.from(frameDoc.querySelectorAll(cmd.selector));
          result.result = atcEls.map(el => el.textContent || '');
          break;
        }

        case 'getAttribute': {
          const el = await getEl(cmd, timeout, frameDoc);
          result.result = el.getAttribute(cmd.name);
          break;
        }

        case 'textContent': {
          const el = await getEl(cmd, timeout, frameDoc);
          result.result = el.textContent;
          break;
        }

        case 'innerHTML': {
          const el = await getEl(cmd, timeout, frameDoc);
          result.result = el.innerHTML;
          break;
        }

        case 'boundingBox': {
          const el = await getEl(cmd, timeout, frameDoc);
          const bbr = el.getBoundingClientRect();
          result.result = bbr.width === 0 && bbr.height === 0 ? null : { x: bbr.x, y: bbr.y, width: bbr.width, height: bbr.height };
          break;
        }

        // ---- state queries ----

        case 'isChecked': {
          const el = await getEl(cmd, timeout, frameDoc);
          result.result = !!el.checked;
          break;
        }

        case 'isEnabled': {
          const el = await getEl(cmd, timeout, frameDoc);
          result.result = !el.disabled;
          break;
        }

        case 'isDisabled': {
          const el = await getEl(cmd, timeout, frameDoc);
          result.result = !!el.disabled;
          break;
        }

        case 'isEditable': {
          const el = await getEl(cmd, timeout, frameDoc);
          result.result = !el.readOnly && !el.disabled;
          break;
        }

        case 'isHidden': {
          const hidEls = cmd.steps ? resolveLocator(cmd.steps, null, frameDoc) : (frameDoc.querySelector(cmd.selector) ? [frameDoc.querySelector(cmd.selector)] : []);
          if (hidEls.length === 0) { result.result = true; break; }
          const hidr = hidEls[0].getBoundingClientRect();
          result.result = !(hidr.width > 0 && hidr.height > 0 && getComputedStyle(hidEls[0]).visibility !== 'hidden');
          break;
        }

        // ---- form actions ----

        case 'check': {
          const el = await getEl(cmd, timeout, frameDoc);
          if (!el.checked) el.click();
          break;
        }

        case 'uncheck': {
          const el = await getEl(cmd, timeout, frameDoc);
          if (el.checked) el.click();
          break;
        }

        case 'setChecked': {
          const el = await getEl(cmd, timeout, frameDoc);
          if (!!cmd.checked !== !!el.checked) el.click();
          break;
        }

        case 'selectOption': {
          const el = await getEl(cmd, timeout, frameDoc);
          const vals = Array.isArray(cmd.values) ? cmd.values : [cmd.values];
          const opts = Array.from(el.options);
          for (const opt of opts) {
            opt.selected = vals.some(function (v) {
              if (typeof v === 'string') return opt.value === v || opt.text === v;
              if (v && typeof v === 'object') {
                if (v.value !== undefined && opt.value !== v.value) return false;
                if (v.label !== undefined && opt.text !== v.label) return false;
                if (v.index !== undefined && opts.indexOf(opt) !== v.index) return false;
                return true;
              }
              return false;
            });
          }
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          result.result = Array.from(el.selectedOptions).map(function (o) { return o.value; });
          break;
        }

        // ---- element interaction ----

        case 'hover': {
          const el = await getEl(cmd, timeout, frameDoc);
          const hvr = el.getBoundingClientRect();
          const hx = Math.round(hvr.left + hvr.width / 2);
          const hy = Math.round(hvr.top  + hvr.height / 2);
          mouseX = hx; mouseY = hy;
          el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: false, clientX: hx, clientY: hy }));
          el.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true,  cancelable: true,  clientX: hx, clientY: hy }));
          el.dispatchEvent(new MouseEvent('mousemove',  { bubbles: true,  cancelable: true,  clientX: hx, clientY: hy, buttons: mouseButtons }));
          break;
        }

        case 'focus': {
          const el = await getEl(cmd, timeout, frameDoc);
          el.focus();
          break;
        }

        case 'blur': {
          const el = await getEl(cmd, timeout, frameDoc);
          el.blur();
          break;
        }

        case 'press': {
          const el = await getEl(cmd, timeout, frameDoc);
          el.focus();
          const activeEl = frameDoc.activeElement || el;
          const { modifiers: prMods, key: prMain } = parseCompoundKey(cmd.key);
          for (const mod of prMods) { setModifier(mod, true); dispatchKeyEvent('keydown', resolveKey(mod), activeEl); }
          const prKeyDef = resolveKey(prMain);
          dispatchKeyEvent('keydown', prKeyDef, activeEl);
          if (cmd.delay) await delay(cmd.delay);
          const prIsPrintable = prKeyDef.key.length === 1;
          if (prIsPrintable || prMain === 'Enter' || prMain === 'Backspace' || prMain === 'Delete') {
            if (prIsPrintable) dispatchKeyEvent('keypress', prKeyDef, activeEl);
            handleKeyEffect(prMain, activeEl);
          }
          dispatchKeyEvent('keyup', prKeyDef, activeEl);
          for (let pi = prMods.length - 1; pi >= 0; pi--) { dispatchKeyEvent('keyup', resolveKey(prMods[pi]), activeEl); setModifier(prMods[pi], false); }
          break;
        }

        case 'pressSequentially': {
          const el = await getEl(cmd, timeout, frameDoc);
          el.focus();
          const seqActiveEl = frameDoc.activeElement || el;
          for (const ch of cmd.text) {
            const psKD = resolveKey(ch);
            dispatchKeyEvent('keydown', psKD, seqActiveEl);
            dispatchKeyEvent('keypress', psKD, seqActiveEl);
            insertCharIntoActive(ch, seqActiveEl);
            dispatchKeyEvent('keyup', psKD, seqActiveEl);
            if (cmd.delay) await delay(cmd.delay);
          }
          break;
        }

        case 'dispatchEvent': {
          const el = await getEl(cmd, timeout, frameDoc);
          el.dispatchEvent(new Event(cmd.eventType, { bubbles: true, cancelable: true }));
          break;
        }

        // ---- waiting ----

        case 'waitForFunction': {
          const wfStart = Date.now();
          while (true) {
            const wfVal = await Promise.resolve(frameWin.eval('(' + cmd.expression + ')'));
            if (wfVal) { result.result = wfVal; break; }
            if (Date.now() - wfStart > timeout) throw new Error('waitForFunction timed out after ' + timeout + 'ms');
            await delay(cmd.polling || 100);
          }
          break;
        }

        case 'waitForURL': {
          const wuStart = Date.now();
          while (true) {
            const wuUrl = frameWin.__pw_url || frameDoc.URL;
            let wuMatch = false;
            if (cmd.matcherType === 'string') wuMatch = wuUrl.includes(cmd.matcherValue);
            else if (cmd.matcherType === 'regexp') wuMatch = new RegExp(cmd.matcherValue, cmd.matcherFlags || '').test(wuUrl);
            if (wuMatch) break;
            if (Date.now() - wuStart > timeout) throw new Error('waitForURL timed out — URL: ' + wuUrl);
            await delay(100);
          }
          break;
        }

        // ---- frames ----

        case 'queryFrames': {
          const iframes = Array.from(document.querySelectorAll('iframe'));
          result.result = iframes.map(function (iframe, i) {
            return {
              name: iframe.getAttribute('name') || '',
              url: (iframe.contentDocument && iframe.contentDocument.URL) || iframe.src || '',
              index: i,
            };
          });
          break;
        }

        // ---- drag & drop ----

        case 'dragAndDrop': {
          const srcEl = await waitForElement(cmd.source, timeout, frameDoc);
          const tgtEl = await waitForElement(cmd.target, timeout, frameDoc);
          const dsr = srcEl.getBoundingClientRect();
          const dtr = tgtEl.getBoundingClientRect();
          const dsx = Math.round(dsr.left + dsr.width  / 2), dsy = Math.round(dsr.top + dsr.height / 2);
          const dtx = Math.round(dtr.left + dtr.width  / 2), dty = Math.round(dtr.top + dtr.height / 2);
          mouseX = dsx; mouseY = dsy;
          srcEl.dispatchEvent(new MouseEvent('mousemove',  { bubbles: true, cancelable: true, clientX: dsx, clientY: dsy }));
          mouseButtons |= 1;
          srcEl.dispatchEvent(new MouseEvent('mousedown',  { bubbles: true, cancelable: true, clientX: dsx, clientY: dsy, button: 0, buttons: mouseButtons }));
          srcEl.dispatchEvent(new DragEvent('dragstart',   { bubbles: true, cancelable: true, clientX: dsx, clientY: dsy }));
          const ddSteps = cmd.steps || 5;
          for (let di = 1; di <= ddSteps; di++) {
            const dx = Math.round(dsx + (dtx - dsx) * di / ddSteps);
            const dy = Math.round(dsy + (dty - dsy) * di / ddSteps);
            const midEl = document.elementFromPoint(dx, dy) || document.body;
            mouseX = dx; mouseY = dy;
            midEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: dx, clientY: dy, buttons: mouseButtons }));
            midEl.dispatchEvent(new DragEvent('drag',     { bubbles: true, cancelable: true, clientX: dx, clientY: dy }));
            midEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: dx, clientY: dy }));
          }
          mouseX = dtx; mouseY = dty;
          mouseButtons &= ~1;
          tgtEl.dispatchEvent(new DragEvent('drop',    { bubbles: true, cancelable: true, clientX: dtx, clientY: dty }));
          tgtEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: dtx, clientY: dty, button: 0, buttons: mouseButtons }));
          tgtEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, clientX: dtx, clientY: dty }));
          break;
        }

        // ---- dialog control ----

        case 'setDialogResponse': {
          _nextDialogResponse = { accept: !!cmd.accept, promptText: cmd.promptText !== undefined ? String(cmd.promptText) : null };
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
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'exposedFunctionResult') {
          // Handle exposed function result
          const callId = msg.callId;
          const promise = window.__pw_exposed_functions && window.__pw_exposed_functions[callId];
          if (promise) {
            delete window.__pw_exposed_functions[callId];
            if (msg.success) {
              promise.resolve(msg.result);
            } else {
              promise.reject(new Error(msg.error));
            }
          }
        } else {
          // Handle regular command
          handleCommand(msg);
        }
      }
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