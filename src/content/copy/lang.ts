/**
 * UI language resolution for the runtime language pilot (Slice 6).
 *
 * German is the default/source language. English is opt-in via `?lang=en`.
 * Anything else resolves to German — the explicit, safe fallback.
 *
 * Scope note: this only selects which catalog text the *display* shows. It does
 * NOT translate exports (PDF/CSV stay German) and is not encoded into share
 * URLs — those decisions are intentionally out of scope for the pilot.
 */
import type { CopyLang } from './types'

/** Languages the UI can render. */
export const UI_LANGS = ['de', 'en'] as const

/** The default / source language. */
export const DEFAULT_LANG: CopyLang = 'de'

/**
 * Resolve the UI language from a URL query string (e.g. `?lang=en`).
 * `URLSearchParams` strips a leading `?`, so both `?lang=en` and `lang=en` work.
 */
export function resolveLang(search: string): CopyLang {
  const value = new URLSearchParams(search).get('lang')
  return value === 'en' ? 'en' : DEFAULT_LANG
}
