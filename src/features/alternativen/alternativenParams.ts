/**
 * Query-param parsing and scenario selection for `/alternativen`. Split out of
 * `AlternativenPage.tsx` so the page module exports components only
 * (react-refresh boundary).
 */

import type { Workspace } from '../../domain/workspace'

/**
 * Read `?id=<whatIfId>` from a search string. Returns `null` for an absent,
 * empty or unparseable value; whether the id still exists in the workspace is
 * the caller's business — a stale bookmark falls back to the list, never to an
 * error.
 */
export function resolveWhatIfParam(search: string): string | null {
  const trimmed = search.startsWith('?') ? search.slice(1) : search
  if (!trimmed) return null
  let value: string | null
  try {
    value = new URLSearchParams(trimmed).get('id')
  } catch {
    return null
  }
  return value && value.length > 0 ? value : null
}

/**
 * The return scenario both sides of every alternative comparison are read on.
 *
 * `returnScenarios[0]` is `konservativ`, not `basis` — indexing by position
 * picks a 3 % assumption where a 5 % one is meant, a 2 pp gap that compounds
 * over a whole projection (CLAUDE.md, "`returnScenarios[0]` is not necessarily
 * 'basis'"). The positional fallback only ever runs for a workspace whose
 * scenario list was hand-edited to drop `basis`.
 */
export function pickBasisScenarioId(workspace: Workspace): string {
  const scenarios = workspace.baseline.assumptions.returnScenarios
  return (scenarios.find((s) => s.id === 'basis') ?? scenarios[0])?.id ?? 'basis'
}
