/**
 * Pure helpers for the dev-only copy editor's file I/O.
 *
 * Kept in src/ (typed + unit-tested) and free of Node APIs so they can be
 * tested in isolation; the dev-only Vite plugin wraps them with `fs`. The
 * single goal here is that editor saves produce *minimal, normal repo diffs* —
 * same field order and formatting as the hand-authored JSON.
 */
import type { CopyEntry } from './types'

/**
 * Re-emit an entry with the canonical on-disk field order
 * (key, de, en?, surface, risk, description?) and empty optionals omitted, so a
 * save touches only the fields the user actually changed.
 */
export function orderEntryFields(entry: CopyEntry): Record<string, string> {
  const ordered: Record<string, string> = { key: entry.key, de: entry.de }
  if (typeof entry.en === 'string' && entry.en.trim().length > 0) ordered.en = entry.en
  ordered.surface = entry.surface
  ordered.risk = entry.risk
  if (typeof entry.description === 'string' && entry.description.trim().length > 0) {
    ordered.description = entry.description
  }
  return ordered
}

/** Serialize entries to the exact on-disk JSON shape (2-space indent + LF + trailing newline). */
export function serializeEntries(entries: readonly CopyEntry[]): string {
  return `${JSON.stringify(entries.map(orderEntryFields), null, 2)}\n`
}

/** Parse an entries file's text into entries. Throws on invalid JSON / non-array. */
export function parseEntriesFile(text: string): CopyEntry[] {
  const data: unknown = JSON.parse(text)
  if (!Array.isArray(data)) {
    throw new Error('Entries file must contain a JSON array.')
  }
  return data as CopyEntry[]
}

/**
 * Path-safety guard for the editor's save endpoint: only files the catalog
 * actually loads may be written. Exact-membership check — no traversal, no
 * arbitrary writes.
 */
export function isAllowedEntryFile(file: string, allowedFiles: readonly string[]): boolean {
  return allowedFiles.includes(file)
}
