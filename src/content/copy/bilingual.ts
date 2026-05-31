/**
 * Bilingual-readiness helpers — measure de/en translation coverage.
 *
 * German is the source / default language and is always required. English is
 * added incrementally; a missing English string is expected and never blocks.
 * No runtime language switching is wired yet — that is Slice 6 (HITL).
 *
 * Powers `npm run copy:missing` and the bilingual tests.
 */
import type { CopyLang } from './types'
import { COPY_SOURCES } from './sources'
import type { CopySource } from './sources'

export interface MissingTranslation {
  key: string
  surface: string
  /** Source JSON file (relative to repo root). */
  file: string
  /** German source text — the thing to translate. */
  de: string
}

export interface TranslationReport {
  lang: CopyLang
  total: number
  translated: number
  missing: MissingTranslation[]
  /** Fraction translated, 0..1. */
  coverage: number
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Coverage of `lang` across the catalog. For `de` this is effectively a
 * completeness check (de is required); for `en` it is translation progress.
 */
export function buildTranslationReport(
  lang: CopyLang,
  sources: readonly CopySource[] = COPY_SOURCES,
): TranslationReport {
  const missing: MissingTranslation[] = []
  let total = 0
  let translated = 0

  for (const source of sources) {
    // Skip malformed sources/entries (non-array file, null/primitive element)
    // so a broken catalog doesn't crash the coverage report; copy:inventory is
    // the surface that reports those as hard errors.
    if (!Array.isArray(source.entries)) continue
    for (const entry of source.entries) {
      if (entry === null || typeof entry !== 'object') continue
      total += 1
      const value = lang === 'de' ? entry.de : entry.en
      if (hasText(value)) {
        translated += 1
      } else {
        // Coerce to safe strings: JSON is cast to `CopyEntry`, so a record
        // missing `de`/`key`/`surface` must not crash the formatter (which calls
        // `truncate(m.de, ...)`), especially for the `--lang de` completeness check.
        missing.push({
          key: typeof entry.key === 'string' ? entry.key : '<no-key>',
          surface: typeof entry.surface === 'string' ? entry.surface : '',
          file: source.file,
          de: typeof entry.de === 'string' ? entry.de : '',
        })
      }
    }
  }

  return {
    lang,
    total,
    translated,
    missing,
    coverage: total === 0 ? 1 : translated / total,
  }
}

function truncate(value: string, max: number): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

/** Render a translation report as a human-readable progress summary. */
export function formatTranslationReport(report: TranslationReport): string {
  const lines: string[] = []
  const pct = Math.round(report.coverage * 100)
  lines.push(`${report.lang.toUpperCase()} coverage: ${report.translated}/${report.total} (${pct}%)`)

  if (report.missing.length === 0) {
    lines.push(`All entries have ${report.lang}.`)
    return lines.join('\n')
  }

  lines.push('')
  lines.push(`Missing ${report.lang} (${report.missing.length}):`)
  const keyW = Math.max(...report.missing.map((m) => m.key.length))
  for (const m of report.missing) {
    lines.push(`  ${m.key.padEnd(keyW)}  ${truncate(m.de, 50)}`)
  }
  return lines.join('\n')
}
