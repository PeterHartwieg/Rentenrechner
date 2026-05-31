/**
 * Raw catalog sources — the list of JSON entry files that make up the catalog.
 *
 * Deliberately separate from `catalog.ts`: this module has NO side effects (it
 * does not build the fail-loud singleton), so tooling — the inventory CLI, the
 * local editor, bilingual reports — can read the raw entries and *report* on a
 * broken catalog instead of crashing at import time. `catalog.ts` builds the
 * validated `copy` accessor on top of these same sources, so the app and the
 * tooling never drift.
 *
 * Add a new surface by dropping `entries/<surface>.copy.json` and registering
 * it here.
 */
import type { CopyEntry } from './types'
import landingEntries from './entries/landing.copy.json'

export interface CopySource {
  /** Path of the JSON file relative to the repo root — used in CLI / messages. */
  file: string
  /** Entries declared in that file. */
  entries: readonly CopyEntry[]
}

export const COPY_SOURCES: readonly CopySource[] = [
  {
    file: 'src/content/copy/entries/landing.copy.json',
    entries: landingEntries as unknown as CopyEntry[],
  },
]

/** All entries across all sources, flattened in source order. */
export function loadRawCopyEntries(): CopyEntry[] {
  return COPY_SOURCES.flatMap((source) => source.entries as CopyEntry[])
}

/** Map of key → source file, for "where is this text?" tooling. */
export function copyKeyToFile(): Map<string, string> {
  const map = new Map<string, string>()
  for (const source of COPY_SOURCES) {
    for (const entry of source.entries) {
      if (typeof entry?.key === 'string' && !map.has(entry.key)) {
        map.set(entry.key, source.file)
      }
    }
  }
  return map
}
