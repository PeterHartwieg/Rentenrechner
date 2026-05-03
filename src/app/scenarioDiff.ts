/**
 * scenarioDiff — structural diff between two Scenario objects (Group G issue 07).
 *
 * Returns a list of `DiffEntry` describing every field that differs between
 * scenario `a` (old / snapshot) and scenario `b` (new / current).
 *
 * Scope:
 *   - Compares `assumptions` (all product instance arrays + scalar fields).
 *   - Compares `profile` fields.
 *   - Does NOT compare `id`, `createdAt`, `lastEditedAt` — these are metadata,
 *     not user-authored deltas.
 *   - Does NOT compare `label` or `origin`.
 *
 * Used by:
 *   - `rebaseWhatIf` in `portfolioState.ts` — compute the what-if's deltas
 *     against its stale snapshot, then re-apply them on top of the new baseline.
 *   - (Issue 12) result-panel "what changed" view.
 *
 * Design note: the diff is "flat-path" — each changed leaf node becomes one
 * DiffEntry with a dot-path key (e.g. "assumptions.bav[0].monthlyGrossConversion").
 * Array entries are matched by index position (not by instanceId) — sufficient
 * for the re-apply use-case where both sides have the same structure. A future
 * version can add instanceId-aware diffing if needed.
 *
 * Pure, no side effects. No React imports.
 */

export interface DiffEntry {
  /** Dot-notation path to the changed field (e.g. "profile.age", "assumptions.bav[0].monthlyGrossConversion"). */
  fieldPath: string
  oldValue: unknown
  newValue: unknown
}

// ---------------------------------------------------------------------------
// Core recursive traversal
// ---------------------------------------------------------------------------

function diffAny(
  oldVal: unknown,
  newVal: unknown,
  path: string,
  out: DiffEntry[],
): void {
  // Both null/undefined
  if (oldVal === undefined && newVal === undefined) return
  if (oldVal === null && newVal === null) return

  // Primitive or null/undefined mismatch
  if (oldVal === null || oldVal === undefined || newVal === null || newVal === undefined) {
    out.push({ fieldPath: path, oldValue: oldVal, newValue: newVal })
    return
  }

  // Arrays — compare by index position
  if (Array.isArray(oldVal) || Array.isArray(newVal)) {
    const oldArr = Array.isArray(oldVal) ? oldVal : []
    const newArr = Array.isArray(newVal) ? newVal : []
    const len = Math.max(oldArr.length, newArr.length)
    for (let i = 0; i < len; i++) {
      diffAny(oldArr[i], newArr[i], `${path}[${i}]`, out)
    }
    return
  }

  // Plain objects — recurse over union of keys
  if (typeof oldVal === 'object' && typeof newVal === 'object') {
    const allKeys = new Set([...Object.keys(oldVal as object), ...Object.keys(newVal as object)])
    for (const key of allKeys) {
      const child = path ? `${path}.${key}` : key
      diffAny(
        (oldVal as Record<string, unknown>)[key],
        (newVal as Record<string, unknown>)[key],
        child,
        out,
      )
    }
    return
  }

  // Primitives — value comparison
  if (oldVal !== newVal) {
    out.push({ fieldPath: path, oldValue: oldVal, newValue: newVal })
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

import type { Scenario } from '../domain/workspace'

/**
 * Compute the structural diff between scenario `a` (baseline/snapshot) and
 * scenario `b` (current/what-if).
 *
 * Only `profile` and `assumptions` are compared. Metadata fields (`id`,
 * `createdAt`, `lastEditedAt`, `label`, `origin`) are intentionally excluded
 * because they are not user-authored content.
 *
 * Returns an empty array when the scenarios are semantically identical.
 */
export function scenarioDiff(a: Scenario, b: Scenario): DiffEntry[] {
  const out: DiffEntry[] = []
  diffAny(a.profile, b.profile, 'profile', out)
  diffAny(a.assumptions, b.assumptions, 'assumptions', out)
  return out
}

/**
 * Apply a list of DiffEntry patches (produced by `scenarioDiff`) onto a
 * target Scenario. Returns a new deeply-cloned scenario with the patches
 * applied. Patches that reference paths that don't exist in the target are
 * silently skipped.
 *
 * Used by `rebaseWhatIf` to re-apply the what-if's user deltas onto a new
 * baseline clone.
 */
export function applyDiff(target: Scenario, diff: DiffEntry[]): Scenario {
  if (diff.length === 0) return target

  // Deep clone first so we never mutate the input.
  const clone: Scenario =
    typeof structuredClone === 'function'
      ? structuredClone(target)
      : (JSON.parse(JSON.stringify(target)) as Scenario)

  for (const entry of diff) {
    setAtPath(clone as unknown as Record<string, unknown>, entry.fieldPath, entry.newValue)
  }
  return clone
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Parse a dot-path with optional array indices into a list of keys/indices.
 * "assumptions.bav[0].monthlyGrossConversion" →
 *   ["assumptions", "bav", 0, "monthlyGrossConversion"]
 */
function parsePath(path: string): Array<string | number> {
  const parts: Array<string | number> = []
  // Split on '.' then handle inline [...] segments.
  for (const segment of path.split('.')) {
    // Match something like "bav[0]" or just "bav".
    const arrayMatch = /^([^[]*)\[(\d+)\]$/.exec(segment)
    if (arrayMatch) {
      if (arrayMatch[1]) parts.push(arrayMatch[1])
      parts.push(parseInt(arrayMatch[2], 10))
    } else {
      parts.push(segment)
    }
  }
  return parts
}

function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = parsePath(path)
  let current: unknown = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (current === null || current === undefined || typeof current !== 'object') return
    current = (current as Record<string | number, unknown>)[key]
  }
  if (current === null || current === undefined || typeof current !== 'object') return
  const lastKey = keys[keys.length - 1]
  ;(current as Record<string | number, unknown>)[lastKey] = value
}
