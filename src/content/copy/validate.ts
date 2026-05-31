/**
 * Pure, framework-free validation for the copy catalog. Shared by the runtime
 * loader (`catalog.ts`) and the local tooling (inventory CLI, editor) so the
 * app and the scripts apply exactly the same rules.
 *
 * Two tiers:
 * - `structuralIssues` — hard errors. A catalog with any is broken; the loader
 *   throws in strict (dev / test / CLI) mode.
 * - (later slices) policy warnings — soft signals surfaced by the CLI but not
 *   fatal: missing English, brand drift, high-risk copy lacking context.
 */
import type { CopyEntry, CopyRisk } from './types'

/** All known risk tiers, in increasing review-sensitivity order. */
export const COPY_RISKS = ['normal', 'brand', 'legal', 'disclaimer', 'export'] as const

/**
 * Stable-key shape: lowercase ASCII segments separated by dots, e.g.
 * `landing.step.beschreiben.heading`. At least two segments so every key names
 * both a surface and a slot. Digits and hyphens are allowed inside a segment.
 * This pattern is what enforces "keys are not derived from German text".
 */
export const COPY_KEY_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z0-9-]+)+$/

export type CopyIssueLevel = 'error' | 'warning'

export interface CopyIssue {
  level: CopyIssueLevel
  /** Machine-readable issue code, e.g. `duplicate-key`. */
  code: string
  /** Key the issue relates to, when applicable. */
  key?: string
  message: string
}

/** Type guard: whether `value` is one of the known {@link CopyRisk} tiers. */
function isCopyRisk(value: unknown): value is CopyRisk {
  return typeof value === 'string' && (COPY_RISKS as readonly string[]).includes(value)
}

/**
 * Structural ("hard") validation: shape, key format, duplicate keys, required
 * `de`, valid `surface` / `risk`. Everything returned here is an error.
 */
export function structuralIssues(entries: readonly CopyEntry[]): CopyIssue[] {
  const issues: CopyIssue[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    // Guard non-object entries first: JSON is cast to `CopyEntry`, so a `null`
    // or primitive could slip in and throw on the field reads below before this
    // function can return its error list (it must stay the fail-loud boundary).
    if (entry === null || typeof entry !== 'object') {
      issues.push({
        level: 'error',
        code: 'invalid-entry',
        message: `Entry is not a valid object: ${JSON.stringify(entry)}`,
      })
      continue
    }
    const key = entry.key
    if (typeof key !== 'string' || key.length === 0) {
      issues.push({
        level: 'error',
        code: 'missing-key',
        message: `Entry without a key: ${JSON.stringify(entry)}`,
      })
      continue
    }
    if (!COPY_KEY_PATTERN.test(key)) {
      issues.push({
        level: 'error',
        code: 'bad-key-format',
        key,
        message: `Key "${key}" is not a stable dot-separated lowercase key.`,
      })
    }
    if (seen.has(key)) {
      issues.push({
        level: 'error',
        code: 'duplicate-key',
        key,
        message: `Duplicate key "${key}".`,
      })
    }
    seen.add(key)

    if (typeof entry.de !== 'string' || entry.de.trim().length === 0) {
      issues.push({
        level: 'error',
        code: 'missing-de',
        key,
        message: `Key "${key}" has no German (de) text.`,
      })
    }
    if (typeof entry.surface !== 'string' || entry.surface.length === 0) {
      issues.push({
        level: 'error',
        code: 'missing-surface',
        key,
        message: `Key "${key}" has no surface.`,
      })
    }
    if (!isCopyRisk(entry.risk)) {
      issues.push({
        level: 'error',
        code: 'bad-risk',
        key,
        message: `Key "${key}" has an invalid risk "${String(entry.risk)}".`,
      })
    }
  }

  return issues
}
