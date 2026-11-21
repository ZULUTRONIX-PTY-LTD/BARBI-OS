/**
 * Defensive compatibility guard for environments where `window.fetch` is
 * defined as a getter-only (or read-only) property — either directly on
 * `window` or inherited from `Window.prototype` — and third-party browser
 * extensions attempt `window.fetch = ...`.
 *
 * 1. If `fetch` is configurable (or inherited from a prototype without an own
 *    non-configurable property), installs a safe getter/setter that preserves
 *    the host getter until a valid function override is assigned.
 * 2. If the host environment locked `window.fetch` as non-configurable,
 *    isolates uncaught `TypeError: Cannot set property fetch` errors that
 *    originate strictly from browser extensions (`chrome-extension://`, etc.)
 *    so they cannot crash or pollute the application's error boundary while
 *    leaving all first-party application errors untouched.
 */

const EXTENSION_URL_PATTERN =
  /(?:chrome-extension|moz-extension|safari-extension|safari-web-extension|ms-browser-extension):\/\//i;

const FETCH_GETTER_ERROR_PATTERN =
  /cannot set property fetch|setting getter-only property ["']?fetch["']?|only a getter/i;

function findPropertyDescriptor(
  target: object,
  prop: PropertyKey
): { owner: object; descriptor: PropertyDescriptor } | null {
  let current: object | null = target;
  while (current) {
    const desc = Object.getOwnPropertyDescriptor(current, prop);
    if (desc) {
      return { owner: current, descriptor: desc };
    }
    current = Object.getPrototypeOf(current);
  }
  return null;
}

export function ensureWritableFetchDescriptor(target: object | null | undefined): boolean {
  if (!target) return false;
  try {
    const ownDesc = Object.getOwnPropertyDescriptor(target, 'fetch');
    if (ownDesc && !ownDesc.configurable) {
      return false;
    }

    const found = findPropertyDescriptor(target, 'fetch');
    if (!found) return false;

    const { descriptor: desc } = found;
    const isGetterOnly = Boolean(desc.get && !desc.set);
    const isReadOnlyData = !desc.get && !desc.set && 'value' in desc && desc.writable === false;

    if (!isGetterOnly && !isReadOnlyData) {
      return false;
    }

    const originalGetter = desc.get;
    const originalValue = desc.value;
    let overrideFetch: unknown = null;

    Object.defineProperty(target, 'fetch', {
      configurable: true,
      enumerable: desc.enumerable !== false,
      get() {
        if (overrideFetch) return overrideFetch;
        return originalGetter ? originalGetter.call(this) : originalValue;
      },
      set(nextFetch: unknown) {
        if (typeof nextFetch === 'function') {
          overrideFetch = nextFetch;
        }
      },
    });
    return true;
  } catch {
    return false;
  }
}

export interface ErrorLikeEvent {
  message?: unknown;
  filename?: unknown;
  error?: unknown;
  reason?: unknown;
}

export function isThirdPartyExtensionFetchError(event: ErrorLikeEvent | null | undefined): boolean {
  if (!event) return false;

  const errorObj = (event.error ?? event.reason) as { message?: unknown; stack?: unknown } | undefined;
  const message = String(event.message ?? errorObj?.message ?? '');
  if (!FETCH_GETTER_ERROR_PATTERN.test(message)) {
    return false;
  }

  const filename = String(event.filename ?? '');
  const stack = String(errorObj?.stack ?? '');
  return EXTENSION_URL_PATTERN.test(filename) || EXTENSION_URL_PATTERN.test(stack);
}

const GUARD_INSTALLED_KEY = '__barbiExtensionFetchGuardInstalled__';

export function installExtensionFetchErrorGuard(
  target:
    | (EventTarget & Record<string, unknown>)
    | null
    | undefined
): boolean {
  if (!target || typeof target.addEventListener !== 'function') return false;
  if (target[GUARD_INSTALLED_KEY]) return false;

  const handleError = (event: Event) => {
    if (isThirdPartyExtensionFetchError(event as unknown as ErrorLikeEvent)) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }
  };

  target.addEventListener('error', handleError, true);
  target.addEventListener('unhandledrejection', handleError, true);
  target[GUARD_INSTALLED_KEY] = true;
  return true;
}
