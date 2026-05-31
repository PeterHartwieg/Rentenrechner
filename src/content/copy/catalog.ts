/**
 * Copy catalog loader + accessor.
 *
 * Imports the JSON entry files, validates them, indexes by key, and exposes the
 * typed `copy` accessor used across the UI:
 *
 *     copy.de('landing.hero.kicker')   // → German text (throws if key missing)
 *     copy.en('landing.hero.kicker')   // → English text or undefined
 *
 * Fail-loud policy: in dev, tests, and the CLI (anything that is not a
 * production build) a missing key or a structural error throws immediately, so
 * typos surface at the call site. A production build degrades gracefully —
 * it logs and returns the key — so a stray bug can never white-screen the live
 * site. Every shipped key is covered by tests + the build, so the lenient path
 * is a safety net, not a routine.
 */
import type { CopyEntry, CopyLang } from './types'
import { structuralIssues } from './validate'
import { loadRawCopyEntries } from './sources'

/**
 * Whether to fail loudly. True everywhere except a production build, so dev,
 * tests, and the CLI surface catalog problems immediately. `import.meta.env.PROD`
 * is the build-time flag Vite statically replaces.
 */
const STRICT = import.meta.env?.PROD !== true

export interface CopyAccessor {
  /** German text for `key`. Throws (strict) or returns the key (prod) if missing. */
  de(key: string): string
  /** English text for `key`, or `undefined` if not yet translated. */
  en(key: string): string | undefined
  /**
   * Text for `key` in `lang`, with an explicit fallback to German when the
   * English translation is absent. Used by the runtime language pilot (Slice 6).
   */
  text(key: string, lang: CopyLang): string
  /** Whether `key` exists in the catalog. */
  has(key: string): boolean
  /** Full entry for `key`. Always throws if missing (no sensible fallback). */
  entry(key: string): CopyEntry
  /** All entries, in source order. */
  all(): readonly CopyEntry[]
  /** All known keys. */
  keys(): string[]
}

export interface CreateCopyAccessorOptions {
  /** Throw on structural errors and missing-key lookups. Defaults to `STRICT`. */
  strict?: boolean
}

/**
 * Build a copy accessor over a set of entries. Exported (not just the singleton
 * `copy`) so tests can exercise the strict failure paths with crafted entries.
 */
export function createCopyAccessor(
  entries: readonly CopyEntry[],
  options: CreateCopyAccessorOptions = {},
): CopyAccessor {
  const strict = options.strict ?? STRICT

  const errors = structuralIssues(entries).filter((issue) => issue.level === 'error')
  if (errors.length > 0) {
    const summary = errors.map((e) => `  - [${e.code}] ${e.message}`).join('\n')
    const message = `Copy catalog has ${errors.length} structural error(s):\n${summary}`
    if (strict) throw new Error(message)
    console.error(`[copy] ${message}`)
  }

  const index = new Map<string, CopyEntry>()
  for (const entry of entries) {
    // Only index structurally usable entries (string key + non-empty de) so
    // `de()` always honours its `string` return contract; a malformed record
    // falls through to the missing-key path instead of yielding `undefined`.
    if (
      typeof entry?.key === 'string' &&
      typeof entry?.de === 'string' &&
      entry.de.trim().length > 0 &&
      !index.has(entry.key)
    ) {
      index.set(entry.key, entry)
    }
  }

  /**
   * Handle a lookup for a key not in the catalog: throw in strict mode (dev /
   * test / CLI) so typos surface; log and return the key as a visible fallback
   * in a production build so a stray miss can never white-screen the site.
   */
  function onMissing(key: string): string {
    const message = `[copy] missing key "${key}"`
    if (strict) throw new Error(message)
    console.error(message)
    return key
  }

  return {
    de(key) {
      const entry = index.get(key)
      return entry ? entry.de : onMissing(key)
    },
    en(key) {
      const entry = index.get(key)
      if (!entry) {
        onMissing(key)
        return undefined
      }
      return entry.en
    },
    text(key, lang) {
      const entry = index.get(key)
      if (!entry) return onMissing(key)
      if (lang === 'en' && typeof entry.en === 'string' && entry.en.trim().length > 0) {
        return entry.en
      }
      return entry.de
    },
    has(key) {
      return index.has(key)
    },
    entry(key) {
      const entry = index.get(key)
      if (!entry) throw new Error(`[copy] missing key "${key}"`)
      return entry
    },
    all() {
      return entries
    },
    keys() {
      return [...index.keys()]
    },
  }
}

/** The application copy catalog. */
export const copy: CopyAccessor = createCopyAccessor(loadRawCopyEntries())

/** All entries — for tooling (inventory CLI, editor, bilingual reports). */
export function allCopyEntries(): readonly CopyEntry[] {
  return loadRawCopyEntries()
}
