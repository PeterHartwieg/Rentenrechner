/**
 * Safe localStorage wrapper.
 *
 * `localStorage.setItem` throws in private-browsing mode, quota-exhaustion
 * scenarios, and SSR/prerender environments where `localStorage` is undefined.
 * This helper silently absorbs those failures so callers never crash.
 */

/**
 * Write a value to localStorage.
 * Returns `true` on success, `false` if storage is unavailable or full.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
