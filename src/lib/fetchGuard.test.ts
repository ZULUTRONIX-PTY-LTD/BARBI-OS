import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureWritableFetchDescriptor,
  installExtensionFetchErrorGuard,
  isThirdPartyExtensionFetchError,
} from './fetchGuard';

test('ensureWritableFetchDescriptor leaves normal writable fetch untouched', () => {
  const original = async () => new Response('ok');
  const mockWin: { fetch: typeof original } = { fetch: original };

  const patched = ensureWritableFetchDescriptor(mockWin);
  assert.equal(patched, false);
  assert.equal(mockWin.fetch, original);
});

test('ensureWritableFetchDescriptor adds safe setter to getter-only configurable fetch while preserving original getter', () => {
  const calls: string[] = [];
  const hostFetch = (url: string) => {
    calls.push(`host:${url}`);
    return url;
  };
  const mockWin: Record<string, unknown> = {};
  Object.defineProperty(mockWin, 'fetch', {
    configurable: true,
    enumerable: true,
    get() {
      return hostFetch;
    },
  });

  // Before guard, direct assignment throws TypeError
  assert.throws(() => {
    mockWin.fetch = () => 'wrapped';
  }, TypeError);

  const patched = ensureWritableFetchDescriptor(mockWin);
  assert.equal(patched, true);

  // Reading before any assignment still delegates to host getter
  const beforeOverride = mockWin.fetch as (u: string) => string;
  assert.equal(beforeOverride('/api/health'), '/api/health');
  assert.deepEqual(calls, ['host:/api/health']);

  // Assigning a wrapper (like a browser extension) succeeds and delegates cleanly
  const wrapped = (u: string) => {
    calls.push(`ext:${u}`);
    return beforeOverride(u);
  };
  mockWin.fetch = wrapped;
  assert.equal(mockWin.fetch, wrapped);
  (mockWin.fetch as (u: string) => string)('/api/test');
  assert.deepEqual(calls, ['host:/api/health', 'ext:/api/test', 'host:/api/test']);

  // Ignoring non-function assignments preserves working fetch
  mockWin.fetch = null;
  assert.equal(mockWin.fetch, wrapped);
});

test('ensureWritableFetchDescriptor patches getter-only fetch inherited from Window.prototype', () => {
  const proto: Record<string, unknown> = {};
  const protoFetch = () => 'from-proto';
  Object.defineProperty(proto, 'fetch', {
    configurable: false,
    enumerable: true,
    get() {
      return protoFetch;
    },
  });

  const mockWin = Object.create(proto) as Record<string, unknown>;
  assert.throws(() => {
    mockWin.fetch = () => 'override';
  }, TypeError);

  assert.equal(ensureWritableFetchDescriptor(mockWin), true);
  assert.equal((mockWin.fetch as () => string)(), 'from-proto');

  const extFetch = () => 'from-ext';
  mockWin.fetch = extFetch;
  assert.equal(mockWin.fetch, extFetch);
});

test('ensureWritableFetchDescriptor patches configurable read-only data fetch descriptor', () => {
  const mockWin: Record<string, unknown> = {};
  const lockedFetch = () => 'readonly';
  Object.defineProperty(mockWin, 'fetch', {
    configurable: true,
    enumerable: true,
    writable: false,
    value: lockedFetch,
  });

  assert.equal(ensureWritableFetchDescriptor(mockWin), true);
  assert.equal(mockWin.fetch, lockedFetch);
  const next = () => 'writable-now';
  mockWin.fetch = next;
  assert.equal(mockWin.fetch, next);
});

test('ensureWritableFetchDescriptor safely returns false for non-configurable own getter-only fetch', () => {
  const mockWin: Record<string, unknown> = {};
  Object.defineProperty(mockWin, 'fetch', {
    configurable: false,
    enumerable: true,
    get() {
      return () => 'locked';
    },
  });

  assert.equal(ensureWritableFetchDescriptor(mockWin), false);
});

test('isThirdPartyExtensionFetchError matches only browser-extension fetch setter TypeErrors', () => {
  assert.equal(
    isThirdPartyExtensionFetchError({
      message: 'Uncaught TypeError: Cannot set property fetch of #<Window> which has only a getter',
      filename: 'chrome-extension://hoklmmgfnpapgjgcpechhaamimifchmp/frame_ant/frame_ant.js',
    }),
    true
  );

  assert.equal(
    isThirdPartyExtensionFetchError({
      error: {
        message: 'Cannot set property fetch of #<Window> which has only a getter',
        stack:
          'TypeError: Cannot set property fetch of #<Window> which has only a getter\n    at n.value (chrome-extension://hoklmmgfnpapgjgcpechhaamimifchmp/frame_ant/frame_ant.js:2:17820)',
      },
    }),
    true
  );

  // First-party app errors must NEVER be suppressed
  assert.equal(
    isThirdPartyExtensionFetchError({
      message: 'Cannot set property fetch of #<Window> which has only a getter',
      filename: 'http://localhost:3000/src/main.tsx',
    }),
    false
  );

  // Unrelated extension errors must NOT be matched
  assert.equal(
    isThirdPartyExtensionFetchError({
      message: 'TypeError: Cannot read properties of undefined',
      filename: 'chrome-extension://hoklmmgfnpapgjgcpechhaamimifchmp/frame_ant/frame_ant.js',
    }),
    false
  );
});

test('installExtensionFetchErrorGuard prevents propagation only for matching extension fetch errors', () => {
  const listeners = new Map<string, Array<(ev: Event) => void>>();
  const mockTarget = {
    addEventListener(type: string, fn: (ev: Event) => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
  } as unknown as EventTarget & Record<string, unknown>;

  assert.equal(installExtensionFetchErrorGuard(mockTarget), true);
  // Idempotent second call
  assert.equal(installExtensionFetchErrorGuard(mockTarget), false);

  const errorHandlers = listeners.get('error') ?? [];
  assert.equal(errorHandlers.length, 1);

  let prevented = false;
  let stopped = false;
  errorHandlers[0]({
    message: 'TypeError: Cannot set property fetch of #<Window> which has only a getter',
    filename: 'chrome-extension://hoklmmgfnpapgjgcpechhaamimifchmp/frame_ant/frame_ant.js',
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {
      stopped = true;
    },
  } as unknown as Event);
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  // App error should pass through untouched
  let appPrevented = false;
  errorHandlers[0]({
    message: 'ReferenceError: foo is not defined',
    filename: 'http://localhost:3000/src/App.tsx',
    preventDefault() {
      appPrevented = true;
    },
    stopImmediatePropagation() {
      appPrevented = true;
    },
  } as unknown as Event);
  assert.equal(appPrevented, false);
});
