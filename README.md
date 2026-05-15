# playwright-safari

A Playwright-compatible automation API for real Safari via safaridriver, backed by an HTTP/WebSocket reverse proxy. Tests run against an actual Safari window — no browser emulation.

## How it works

Every page navigation is routed through a local proxy (`/__proxy/fetch?url=…`). The proxy rewrites HTML, CSS, and URLs on the fly, then injects a WebSocket client script into each page. Automation commands (fill, click, evaluate, keyboard, mouse, …) travel over that WebSocket channel, so the test runner controls Safari without touching WebDriver for every individual action. Screenshots and page navigation use the W3C WebDriver session via safaridriver.

## Requirements

- macOS with Safari
- Safari › Develop › Allow Remote Automation enabled
- Node.js 18+

## API status

### Page

| Method | Status | Notes |
|---|---|---|
| `goto(url)` | ✅ | |
| `fill(selector, value)` | ✅ | |
| `click(selector)` | ✅ | |
| `waitForSelector(selector)` | ✅ | |
| `evaluate(expression)` | ✅ | expression string; no fn+arg form yet |
| `screenshot()` | ✅ | |
| `route()` / `unroute()` | ✅ | |
| `waitForRequest()` / `waitForResponse()` | ✅ | |
| `locator()` + `getBy*()` | ✅ | |
| `keyboard` / `mouse` | ✅ | |
| `title()` | ✅ | |
| `url()` | ✅ | tracks SPA pushState; real URL, not proxy URL |
| `content()` | ✅ | |
| `waitForURL(url)` | ✅ | string / RegExp |
| `waitForLoadState(state)` | ✅ | `'load'` / `'domcontentloaded'` / `'networkidle'` |
| `waitForFunction(expression)` | ✅ | polls until truthy |
| `focus(selector)` | ✅ | |
| `hover(selector)` | ✅ | |
| `dispatchEvent(selector, type)` | ✅ | |
| `check(selector)` / `uncheck(selector)` | ✅ | |
| `selectOption(selector, values)` | ✅ | string / label / index |
| `getAttribute(selector, name)` | ✅ | |
| `innerHTML(selector)` | ✅ | |
| `textContent(selector)` | ✅ | |
| `isChecked(selector)` | ✅ | |
| `isEnabled(selector)` | ✅ | |
| `addInitScript(script)` | ✅ | injected before page scripts on every load |
| `dragAndDrop(source, target)` | ✅ | DragEvent + MouseEvent sequence |
| `on('dialog', handler)` | ✅ | alert/confirm/prompt — confirm/prompt return value must be pre-set via `dialog.accept()` before triggering |
| `on('console', handler)` | ✅ | captures `console.log/warn/error/info/debug` |
| `isVisible(selector)` | ❌ | shortcut (locator covers it) |
| `innerText(selector)` | ❌ | shortcut (locator covers it) |
| `reload()` | ❌ | WS navigate to same URL |
| `goBack()` / `goForward()` | ❌ | `history.back/forward` via evaluate |
| `addScriptTag()` / `addStyleTag()` | ❌ | inject assets into live page |
| `setViewportSize()` / `viewportSize()` | ❌ | via WebDriver session |
| `exposeFunction(name, fn)` | ❌ | bridge browser→Node function calls |
| `setExtraHTTPHeaders()` | ❌ | add headers to proxied fetches |
| `frames()` / `mainFrame()` / `frame()` | ✅ | same-origin iframes via main-frame WS; named or positional |
| `frameLocator(selector)` | ✅ | CSS-selector-based; supports nested chains |

### Locator

| Method | Status | Notes |
|---|---|---|
| `fill()` / `click()` | ✅ | |
| `innerText()` / `inputValue()` | ✅ | |
| `isVisible()` / `count()` / `waitFor()` | ✅ | |
| `first()` / `last()` / `nth()` / `filter()` | ✅ | |
| `locator()` + `getBy*()` chain | ✅ | |
| `all()` | ✅ | snapshot of matched elements as `Locator[]` |
| `allInnerTexts()` | ✅ | `string[]` |
| `allTextContents()` | ✅ | `string[]` |
| `isChecked()` | ✅ | |
| `isEnabled()` / `isDisabled()` | ✅ | |
| `isEditable()` | ✅ | |
| `isHidden()` | ✅ | |
| `check()` / `uncheck()` / `setChecked()` | ✅ | |
| `selectOption(values)` | ✅ | string / label / index |
| `hover()` | ✅ | |
| `focus()` / `blur()` | ✅ | |
| `press(key)` | ✅ | focuses element first |
| `pressSequentially(text)` | ✅ | char-by-char with key events |
| `getAttribute(name)` | ✅ | |
| `innerHTML()` | ✅ | |
| `textContent()` | ✅ | |
| `boundingBox()` | ✅ | |
| `dispatchEvent(type)` | ✅ | |
| `evaluate(fn, arg?)` | ❌ | fn+arg form (expression string works via `page.evaluate`) |
| `evaluateAll(fn)` | ❌ | |
| `screenshot()` | ❌ | crop page screenshot to element bbox |
| `scrollIntoViewIfNeeded()` | ❌ | `el.scrollIntoView()` |
| `setInputFiles()` | ❌ | file upload (WebDriver required) |
| `tap()` | ❌ | touch event sequence |

### Keyboard

| Method | Status |
|---|---|
| `down(key)` / `up(key)` | ✅ |
| `press(key, { delay? })` | ✅ |
| `type(text, { delay? })` | ✅ |
| `insertText(text)` | ✅ |

### Mouse

| Method | Status |
|---|---|
| `move(x, y, { steps? })` | ✅ |
| `down({ button?, clickCount? })` / `up(…)` | ✅ |
| `click(x, y, { button?, clickCount?, delay? })` | ✅ |
| `dblclick(x, y, { button?, delay? })` | ✅ |
| `wheel(deltaX, deltaY)` | ✅ |

### Browser

| Method | Status | Notes |
|---|---|---|
| `launch()` / `close()` | ✅ | |
| `newPage()` | ✅ | |
| `newContext()` | ❌ | Safari has one session; would need separate proxy ports |
| `BrowserContext` (cookies, storage, routes) | ❌ | depends on `newContext()` |
