import type { ExpectMatcherState, MatcherReturnType } from '@playwright/test';
import { Locator } from '../src/Locator';

const POLL_INTERVAL = 100;

// Poll fn() every POLL_INTERVAL ms until check(value) is true or timeout expires.
async function poll<T>(
  fn: () => Promise<T>,
  check: (val: T) => boolean,
  timeout: number,
): Promise<{ pass: boolean; actual: T | undefined }> {
  const deadline = Date.now() + timeout;
  let actual: T | undefined;
  do {
    try {
      actual = await fn();
      if (check(actual)) return { pass: true, actual };
    } catch {
      // swallow transient errors and retry
    }
    if (Date.now() < deadline) await new Promise(r => setTimeout(r, POLL_INTERVAL));
  } while (Date.now() < deadline);
  return { pass: false, actual };
}

function matchValue(actual: string, expected: string | RegExp, ignoreCase = false): boolean {
  if (expected instanceof RegExp) return expected.test(actual);
  return ignoreCase
    ? actual.toLowerCase() === expected.toLowerCase()
    : actual === expected;
}

function containsValue(actual: string, expected: string | RegExp, ignoreCase = false): boolean {
  if (expected instanceof RegExp) return expected.test(actual);
  return ignoreCase
    ? actual.toLowerCase().includes(expected.toLowerCase())
    : actual.includes(expected);
}

// Whether `actual` has all of the CSS classes listed in `expected` (space-separated).
function hasClasses(actual: string, expected: string | RegExp): boolean {
  if (expected instanceof RegExp) return expected.test(actual);
  const have = actual.split(/\s+/).filter(Boolean);
  return expected.trim().split(/\s+/).every(c => have.includes(c));
}

type PollingOptions = { timeout?: number };

export const matchers = {
  async toBeVisible(
    this: ExpectMatcherState,
    received: unknown,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toBeVisible expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass } = await poll(() => received.isVisible(), v => v, timeout);
    return {
      pass,
      message: () => this.isNot
        ? 'Expected element not to be visible'
        : `Expected element to be visible (timed out after ${timeout}ms)`,
    };
  },

  async toBeHidden(
    this: ExpectMatcherState,
    received: unknown,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toBeHidden expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass } = await poll(() => received.isHidden(), v => v, timeout);
    return {
      pass,
      message: () => this.isNot
        ? 'Expected element not to be hidden'
        : `Expected element to be hidden (timed out after ${timeout}ms)`,
    };
  },

  async toBeEnabled(
    this: ExpectMatcherState,
    received: unknown,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toBeEnabled expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass } = await poll(() => received.isEnabled(), v => v, timeout);
    return {
      pass,
      message: () => this.isNot
        ? 'Expected element not to be enabled'
        : `Expected element to be enabled (timed out after ${timeout}ms)`,
    };
  },

  async toBeDisabled(
    this: ExpectMatcherState,
    received: unknown,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toBeDisabled expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass } = await poll(() => received.isDisabled(), v => v, timeout);
    return {
      pass,
      message: () => this.isNot
        ? 'Expected element not to be disabled'
        : `Expected element to be disabled (timed out after ${timeout}ms)`,
    };
  },

  async toBeChecked(
    this: ExpectMatcherState,
    received: unknown,
    options: { checked?: boolean; timeout?: number } = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toBeChecked expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const want = options.checked ?? true;
    const { pass, actual } = await poll(() => received.isChecked(), v => v === want, timeout);
    return {
      pass,
      actual,
      expected: want,
      message: () => this.isNot
        ? `Expected element not to be ${want ? 'checked' : 'unchecked'}`
        : `Expected element to be ${want ? 'checked' : 'unchecked'}, got ${actual}`,
    };
  },

  async toBeEditable(
    this: ExpectMatcherState,
    received: unknown,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toBeEditable expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass } = await poll(() => received.isEditable(), v => v, timeout);
    return {
      pass,
      message: () => this.isNot
        ? 'Expected element not to be editable'
        : `Expected element to be editable (timed out after ${timeout}ms)`,
    };
  },

  async toBeFocused(
    this: ExpectMatcherState,
    received: unknown,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toBeFocused expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass } = await poll(
      () => received.evaluate<boolean>('el => el.ownerDocument.activeElement === el'),
      v => v,
      timeout,
    );
    return {
      pass,
      message: () => this.isNot
        ? 'Expected element not to be focused'
        : `Expected element to be focused (timed out after ${timeout}ms)`,
    };
  },

  async toHaveText(
    this: ExpectMatcherState,
    received: unknown,
    expected: string | RegExp | (string | RegExp)[],
    options: { timeout?: number; ignoreCase?: boolean } = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toHaveText expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const ignoreCase = options.ignoreCase ?? false;

    if (Array.isArray(expected)) {
      const { pass, actual } = await poll(
        () => received.allInnerTexts(),
        texts =>
          texts.length === expected.length &&
          expected.every((e, i) => matchValue(texts[i].trim(), e, ignoreCase)),
        timeout,
      );
      const trimmed = actual?.map(t => t.trim());
      return {
        pass,
        actual: trimmed,
        expected,
        message: () => this.isNot
          ? `Expected texts not to match ${JSON.stringify(expected)}`
          : `Expected texts ${JSON.stringify(trimmed)} to match ${JSON.stringify(expected)}`,
      };
    }

    const { pass, actual } = await poll(
      () => received.innerText(),
      text => matchValue(text.trim(), expected, ignoreCase),
      timeout,
    );
    return {
      pass,
      actual: actual?.trim(),
      expected,
      message: () => this.isNot
        ? `Expected text not to equal ${String(expected)}`
        : `Expected text "${actual?.trim()}" to equal ${String(expected)}`,
    };
  },

  async toContainText(
    this: ExpectMatcherState,
    received: unknown,
    expected: string | RegExp | (string | RegExp)[],
    options: { timeout?: number; ignoreCase?: boolean } = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toContainText expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const ignoreCase = options.ignoreCase ?? false;

    if (Array.isArray(expected)) {
      const { pass, actual } = await poll(
        () => received.allInnerTexts(),
        texts =>
          expected.every((e, i) => i < texts.length && containsValue(texts[i].trim(), e, ignoreCase)),
        timeout,
      );
      const trimmed = actual?.map(t => t.trim());
      return {
        pass,
        actual: trimmed,
        expected,
        message: () => this.isNot
          ? `Expected texts not to contain ${JSON.stringify(expected)}`
          : `Expected texts ${JSON.stringify(trimmed)} to contain ${JSON.stringify(expected)}`,
      };
    }

    const { pass, actual } = await poll(
      () => received.innerText(),
      text => containsValue(text.trim(), expected, ignoreCase),
      timeout,
    );
    return {
      pass,
      actual: actual?.trim(),
      expected,
      message: () => this.isNot
        ? `Expected text not to contain ${String(expected)}`
        : `Expected text "${actual?.trim()}" to contain ${String(expected)}`,
    };
  },

  async toHaveValue(
    this: ExpectMatcherState,
    received: unknown,
    expected: string | RegExp,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toHaveValue expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass, actual } = await poll(
      () => received.inputValue(),
      val => matchValue(val, expected),
      timeout,
    );
    return {
      pass,
      actual,
      expected,
      message: () => this.isNot
        ? `Expected input value not to equal ${String(expected)}`
        : `Expected input value "${actual}" to equal ${String(expected)}`,
    };
  },

  async toHaveAttribute(
    this: ExpectMatcherState,
    received: unknown,
    name: string,
    expected: string | RegExp,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toHaveAttribute expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass, actual } = await poll(
      () => received.getAttribute(name),
      val => val !== null && matchValue(val, expected),
      timeout,
    );
    return {
      pass,
      actual,
      expected,
      message: () => this.isNot
        ? `Expected attribute "${name}" not to equal ${String(expected)}`
        : `Expected attribute "${name}" "${actual}" to equal ${String(expected)}`,
    };
  },

  async toHaveCount(
    this: ExpectMatcherState,
    received: unknown,
    expected: number,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toHaveCount expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass, actual } = await poll(
      () => received.count(),
      n => n === expected,
      timeout,
    );
    return {
      pass,
      actual,
      expected,
      message: () => this.isNot
        ? `Expected count not to be ${expected}`
        : `Expected count ${actual} to equal ${expected}`,
    };
  },

  async toHaveClass(
    this: ExpectMatcherState,
    received: unknown,
    expected: string | RegExp,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toHaveClass expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass, actual } = await poll(
      () => received.getAttribute('class').then(v => v ?? ''),
      cls => hasClasses(cls, expected),
      timeout,
    );
    return {
      pass,
      actual,
      expected,
      message: () => this.isNot
        ? `Expected class not to match ${String(expected)}`
        : `Expected class "${actual}" to match ${String(expected)}`,
    };
  },

  async toHaveId(
    this: ExpectMatcherState,
    received: unknown,
    expected: string | RegExp,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toHaveId expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const { pass, actual } = await poll(
      () => received.getAttribute('id').then(v => v ?? ''),
      id => matchValue(id, expected),
      timeout,
    );
    return {
      pass,
      actual,
      expected,
      message: () => this.isNot
        ? `Expected id not to match ${String(expected)}`
        : `Expected id "${actual}" to match ${String(expected)}`,
    };
  },

  async toHaveJSProperty(
    this: ExpectMatcherState,
    received: unknown,
    name: string,
    expected: unknown,
    options: PollingOptions = {},
  ): Promise<MatcherReturnType> {
    if (!(received instanceof Locator))
      return { message: () => 'toHaveJSProperty expects a Locator', pass: false };
    const timeout = options.timeout ?? this.timeout;
    const serialized = JSON.stringify(expected);
    const { pass, actual } = await poll(
      () => received.evaluate<unknown>(`el => el[${JSON.stringify(name)}]`),
      val => JSON.stringify(val) === serialized,
      timeout,
    );
    return {
      pass,
      actual,
      expected,
      message: () => this.isNot
        ? `Expected JS property "${name}" not to equal ${serialized}`
        : `Expected JS property "${name}" to equal ${serialized}, got ${JSON.stringify(actual)}`,
    };
  },
};
