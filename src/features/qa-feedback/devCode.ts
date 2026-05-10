/**
 * Maintainer dev-code handling for QA feedback submissions.
 *
 * The maintainer opens the calculator with `?dev=<code>` once per browser tab.
 * The code is moved into sessionStorage and stripped from the URL so it doesn't
 * leak via bookmarks or shared share-URLs. On submit, `workerSubmit.ts` reads
 * it back and includes it in the POST payload; the Worker validates the code
 * server-side against `MAINTAINER_DEV_CODE` (Wrangler secret) and applies the
 * `from-maintainer` GitHub label on match.
 *
 * The dev-code never appears in the issue body or any public surface — only
 * the resulting label is visible. Spoof surface is bounded by Turnstile + the
 * dual-LLM PR review on any auto-promoted issue.
 *
 * Session-scoped (sessionStorage) to mirror the QA-mode flag's discipline —
 * the code does not survive across browser sessions.
 */

export const QA_DEV_CODE_KEY = 'qa-dev-code'

/**
 * Read `?dev=<code>` from the current URL, persist to sessionStorage, and
 * strip the param from the URL. Idempotent — safe to call multiple times.
 *
 * No-op when `?dev=` is absent, when sessionStorage is unavailable, or when
 * called outside a browser context.
 */
export function readDevCodeFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    const dev = url.searchParams.get('dev')
    if (!dev) return
    try {
      sessionStorage.setItem(QA_DEV_CODE_KEY, dev)
    } catch {
      /* ignore — fall through to URL strip */
    }
    url.searchParams.delete('dev')
    window.history.replaceState({}, '', url.toString())
  } catch {
    /* ignore — URL parsing or history API failure */
  }
}

/**
 * Read the persisted dev-code from sessionStorage. Returns `null` when no
 * code is present or sessionStorage is unavailable.
 */
export function getDevCode(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    return sessionStorage.getItem(QA_DEV_CODE_KEY)
  } catch {
    return null
  }
}
