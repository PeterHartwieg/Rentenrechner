/**
 * Copy-inventory report — the pure core behind `npm run copy:inventory`.
 *
 * Kept here (typed, linted, unit-tested) rather than in the CLI script so the
 * "where is this text?" logic has tests and can be reused by the local editor
 * and the bilingual report. The script (`scripts/copy-inventory.ts`) is a thin
 * shell that prints the output and sets the exit code.
 */
import type { CopyEntry, CopyRisk } from './types'
import { structuralIssues, policyIssues, isHighRiskTier, COPY_RISKS } from './validate'
import type { CopyIssue } from './validate'
import { COPY_SOURCES } from './sources'
import type { CopySource } from './sources'

export interface CopyInventoryRow {
  key: string
  de: string
  en: string | null
  hasEn: boolean
  surface: string
  risk: CopyRisk
  /** Source JSON file (relative to repo root). */
  file: string
}

export interface CopyInventorySummary {
  total: number
  surfaces: number
  missingEn: number
  errors: number
  warnings: number
  byRisk: Record<string, number>
}

export interface CopyInventoryReport {
  /** Rows after applying the filter (the rows the user asked to see). */
  rows: CopyInventoryRow[]
  /** Total rows before filtering. */
  matched: number
  /** Validation issues over the WHOLE catalog (filter-independent). */
  issues: CopyIssue[]
  /** Health summary over the WHOLE catalog (filter-independent). */
  summary: CopyInventorySummary
}

export interface InventoryFilter {
  /** Case-insensitive substring match across key / de / en / surface. */
  search?: string
  /** Restrict to one surface. */
  surface?: string
  /** Restrict to one risk tier. */
  risk?: CopyRisk
  /** Restrict to the high-risk tiers (legal / disclaimer / export). */
  highRisk?: boolean
}

function toRows(sources: readonly CopySource[]): CopyInventoryRow[] {
  const rows: CopyInventoryRow[] = []
  for (const source of sources) {
    // A `*.copy.json` accidentally changed to a non-array would make `for…of`
    // throw; skip it here (buildInventoryReport surfaces it as a hard error).
    if (!Array.isArray(source.entries)) continue
    for (const entry of source.entries) {
      // A null / primitive array element would throw on the field reads below;
      // skip it here (structuralIssues still reports it as `invalid-entry`).
      if (entry === null || typeof entry !== 'object') continue
      const hasEn = typeof entry.en === 'string' && entry.en.trim().length > 0
      // Coerce malformed values to safe strings so the CLI prints its
      // hard-failure report (structuralIssues still flags them) instead of
      // crashing on `row.key.length` / `truncate(row.de, ...)`.
      rows.push({
        key: typeof entry.key === 'string' ? entry.key : '<no-key>',
        de: typeof entry.de === 'string' ? entry.de : '',
        en: hasEn ? (entry.en as string) : null,
        hasEn,
        surface: typeof entry.surface === 'string' ? entry.surface : '',
        risk: (typeof entry.risk === 'string' ? entry.risk : 'normal') as CopyRisk,
        file: source.file,
      })
    }
  }
  return rows
}

function matchesFilter(row: CopyInventoryRow, filter: InventoryFilter): boolean {
  if (filter.surface && row.surface !== filter.surface) return false
  if (filter.risk && row.risk !== filter.risk) return false
  if (filter.highRisk && !isHighRiskTier(row.risk)) return false
  if (filter.search) {
    const needle = filter.search.toLowerCase()
    const haystack = `${row.key}\n${row.de}\n${row.en ?? ''}\n${row.surface}`.toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

export function buildInventoryReport(
  sources: readonly CopySource[] = COPY_SOURCES,
  filter: InventoryFilter = {},
): CopyInventoryReport {
  // Surface non-array source files as a hard error (and exclude them from the
  // entry scan) so a malformed `*.copy.json` is reported, not crashed on.
  const sourceIssues: CopyIssue[] = sources
    .filter((s) => !Array.isArray(s.entries))
    .map((s) => ({
      level: 'error' as const,
      code: 'non-array-source',
      message: `Source "${s.file}" is not a JSON array of entries.`,
    }))
  const allRows = toRows(sources)
  const allEntries: CopyEntry[] = sources.flatMap((s) =>
    Array.isArray(s.entries) ? (s.entries as CopyEntry[]) : [],
  )

  const issues = [...sourceIssues, ...structuralIssues(allEntries), ...policyIssues(allEntries)]
  const byRisk: Record<string, number> = {}
  for (const row of allRows) {
    byRisk[row.risk] = (byRisk[row.risk] ?? 0) + 1
  }

  const summary: CopyInventorySummary = {
    total: allRows.length,
    surfaces: new Set(allRows.map((r) => r.surface)).size,
    missingEn: allRows.filter((r) => !r.hasEn).length,
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warning').length,
    byRisk,
  }

  const rows = allRows.filter((row) => matchesFilter(row, filter))
  return { rows, matched: rows.length, issues, summary }
}

// ── Plain-text rendering ────────────────────────────────────────────────────

function truncate(value: string, max: number): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

/** Render the report as an aligned, human-readable table + summary + issues. */
export function formatInventoryTable(report: CopyInventoryReport): string {
  const { rows, summary, issues } = report
  const lines: string[] = []

  if (rows.length === 0) {
    lines.push('(no entries match the filter)')
  } else {
    const headers = { key: 'KEY', risk: 'RISK', en: 'EN', surface: 'SURFACE', de: 'GERMAN' }
    const keyW = Math.max(headers.key.length, ...rows.map((r) => r.key.length))
    const riskW = Math.max(headers.risk.length, ...rows.map((r) => r.risk.length))
    const surfaceW = Math.max(headers.surface.length, ...rows.map((r) => r.surface.length))
    const enW = 2

    const header = `${pad(headers.key, keyW)}  ${pad(headers.risk, riskW)}  ${pad(headers.en, enW)}  ${pad(headers.surface, surfaceW)}  ${headers.de}`
    lines.push(header)
    lines.push('-'.repeat(header.length))
    for (const row of rows) {
      lines.push(
        `${pad(row.key, keyW)}  ${pad(row.risk, riskW)}  ${pad(row.hasEn ? 'EN' : '--', enW)}  ${pad(row.surface, surfaceW)}  ${truncate(row.de, 60)}`,
      )
    }
  }

  lines.push('')
  const filtered = report.matched !== summary.total ? `${report.matched} shown of ` : ''
  lines.push(
    `${filtered}${summary.total} entries · ${summary.surfaces} surface(s) · ` +
      `${summary.missingEn} missing en · ${summary.errors} error(s) · ${summary.warnings} warning(s)`,
  )
  const riskBreakdown = COPY_RISKS.filter((tier) => summary.byRisk[tier]).map(
    (tier) => `${tier} ${summary.byRisk[tier]}`,
  )
  if (riskBreakdown.length > 0) {
    lines.push(`risk tiers: ${riskBreakdown.join(', ')}`)
  }

  if (issues.length > 0) {
    lines.push('')
    lines.push('Issues:')
    const byCode = new Map<string, CopyIssue[]>()
    for (const issue of issues) {
      const list = byCode.get(issue.code) ?? []
      list.push(issue)
      byCode.set(issue.code, list)
    }
    for (const [code, list] of byCode) {
      const level = list[0].level.toUpperCase()
      lines.push(`  [${level}] ${code} (${list.length})`)
      const examples = list.slice(0, 8)
      for (const issue of examples) {
        lines.push(`      - ${issue.key ?? '?'}`)
      }
      if (list.length > examples.length) {
        lines.push(`      …and ${list.length - examples.length} more`)
      }
    }
  }

  return lines.join('\n')
}
