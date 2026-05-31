import { describe, it, expect } from 'vitest'
import { buildInventoryReport, formatInventoryTable } from './inventory'
import { policyIssues } from './validate'
import type { CopySource } from './sources'
import type { CopyEntry } from './types'

const src = (entries: CopyEntry[], file = 'test/fixture.copy.json'): CopySource[] => [
  { file, entries },
]

describe('buildInventoryReport — over the real catalog', () => {
  it('reports a healthy catalog (no structural errors)', () => {
    const report = buildInventoryReport()
    expect(report.summary.errors).toBe(0)
    expect(report.summary.total).toBeGreaterThanOrEqual(10)
    expect(report.rows.length).toBe(report.summary.total)
  })

  it('counts missing-en as partial coverage (Slice 5 added some en)', () => {
    const report = buildInventoryReport()
    expect(report.summary.missingEn).toBeGreaterThan(0)
    expect(report.summary.missingEn).toBeLessThan(report.summary.total)
    // Each missing-en is a (non-fatal) warning.
    expect(report.summary.warnings).toBeGreaterThanOrEqual(report.summary.missingEn)
  })

  it('attaches the source file to each row', () => {
    const report = buildInventoryReport()
    for (const row of report.rows) {
      expect(row.file).toMatch(/\.copy\.json$/)
    }
  })
})

describe('buildInventoryReport — filtering', () => {
  const sources = src([
    { key: 'a.one', de: 'Hallo Welt', surface: 'a', risk: 'normal' },
    { key: 'b.two', de: 'Tschüss', surface: 'b', risk: 'legal', description: 'ctx' },
  ])

  it('search narrows rows but keeps catalog-wide summary', () => {
    const report = buildInventoryReport(sources, { search: 'hallo' })
    expect(report.rows.map((r) => r.key)).toEqual(['a.one'])
    expect(report.matched).toBe(1)
    expect(report.summary.total).toBe(2) // summary is filter-independent
  })

  it('filters by surface', () => {
    const report = buildInventoryReport(sources, { surface: 'b' })
    expect(report.rows.map((r) => r.key)).toEqual(['b.two'])
  })

  it('filters by risk tier', () => {
    const report = buildInventoryReport(sources, { risk: 'legal' })
    expect(report.rows.map((r) => r.key)).toEqual(['b.two'])
    expect(report.summary.byRisk).toEqual({ normal: 1, legal: 1 })
  })
})

describe('buildInventoryReport — issue surfacing', () => {
  it('flags brand drift as a blocking error (the brand guardrail is merge-blocking)', () => {
    const report = buildInventoryReport(
      src([{ key: 'a.one', de: 'Der Rentenrechner zeigt …', surface: 'a', risk: 'normal' }]),
    )
    expect(report.summary.errors).toBeGreaterThan(0)
    const drift = report.issues.find((i) => i.code === 'brand-drift')
    expect(drift?.level).toBe('error')
  })

  it('flags duplicate keys as a hard error', () => {
    const report = buildInventoryReport(
      src([
        { key: 'a.one', de: 'eins', surface: 'a', risk: 'normal' },
        { key: 'a.one', de: 'zwei', surface: 'a', risk: 'normal' },
      ]),
    )
    expect(report.summary.errors).toBeGreaterThan(0)
    expect(report.issues.some((i) => i.code === 'duplicate-key')).toBe(true)
  })

  it('does not crash on null / primitive array elements; flags invalid-entry and skips them', () => {
    const report = buildInventoryReport(
      src([null, 42, { key: 'a.one', de: 'eins', surface: 'a', risk: 'normal' }] as unknown as CopyEntry[]),
    )
    expect(report.summary.errors).toBeGreaterThan(0)
    expect(report.issues.some((i) => i.code === 'invalid-entry')).toBe(true)
    expect(report.rows.map((r) => r.key)).toEqual(['a.one']) // malformed elements skipped
  })

  it('does not crash on a non-array source; flags non-array-source', () => {
    const report = buildInventoryReport([
      { file: 'test/bad.copy.json', entries: { not: 'an array' } as unknown as CopyEntry[] },
    ])
    expect(report.issues.some((i) => i.code === 'non-array-source')).toBe(true)
    expect(report.summary.errors).toBeGreaterThan(0)
  })
})

describe('policyIssues', () => {
  it('warns on missing en; flags brand drift as a blocking error', () => {
    const issues = policyIssues([
      { key: 'a.one', de: 'eins', surface: 'a', risk: 'normal' },
      { key: 'a.two', de: 'zwei', en: 'two', surface: 'a', risk: 'normal' },
      { key: 'a.three', de: 'Rentenrechner', en: 'Rentenrechner', surface: 'a', risk: 'normal' },
    ])
    const codes = issues.map((i) => i.code)
    expect(codes.filter((c) => c === 'missing-en')).toHaveLength(1) // only a.one (a.three has en)
    expect(codes.filter((c) => c === 'brand-drift')).toHaveLength(2) // de + en of a.three
    // missing-en is a soft warning; brand-drift is a blocking error.
    expect(issues.filter((i) => i.code === 'missing-en').every((i) => i.level === 'warning')).toBe(true)
    expect(issues.filter((i) => i.code === 'brand-drift').every((i) => i.level === 'error')).toBe(true)
  })
})

describe('high-risk classification (Slice 4)', () => {
  it('warns when legal/disclaimer/export copy lacks a description', () => {
    const issues = policyIssues([
      { key: 'a.legal', de: 'x', surface: 'a', risk: 'legal' },
      { key: 'a.disc', de: 'x', surface: 'a', risk: 'disclaimer', description: 'why' },
      { key: 'a.exp', de: 'x', surface: 'a', risk: 'export', description: '   ' },
      { key: 'a.norm', de: 'x', surface: 'a', risk: 'normal' },
    ])
    const flagged = issues
      .filter((i) => i.code === 'high-risk-needs-context')
      .map((i) => i.key)
    // legal (no desc) + export (blank desc); NOT disclaimer (has desc), NOT normal.
    expect(flagged.sort()).toEqual(['a.exp', 'a.legal'])
  })

  it('--high-risk filter surfaces only legal/disclaimer/export', () => {
    const report = buildInventoryReport(
      src([
        { key: 'a.norm', de: 'x', surface: 'a', risk: 'normal' },
        { key: 'a.brand', de: 'x', surface: 'a', risk: 'brand' },
        { key: 'a.legal', de: 'x', surface: 'a', risk: 'legal', description: 'd' },
        { key: 'a.exp', de: 'x', surface: 'a', risk: 'export', description: 'd' },
      ]),
      { highRisk: true },
    )
    expect(report.rows.map((r) => r.key).sort()).toEqual(['a.exp', 'a.legal'])
  })

  it('the real catalog carries the brand-classified about kicker', () => {
    const report = buildInventoryReport()
    const brandRows = report.rows.filter((r) => r.risk === 'brand')
    expect(brandRows.map((r) => r.key)).toContain('landing.about.kicker')
    expect(report.summary.byRisk.brand).toBe(1)
    expect(report.summary.errors).toBe(0)
  })
})

describe('formatInventoryTable', () => {
  it('renders a header, a known key, and the summary line', () => {
    const text = formatInventoryTable(buildInventoryReport())
    expect(text).toContain('KEY')
    expect(text).toContain('landing.cta.combine')
    expect(text).toMatch(/entries ·/)
    expect(text).toMatch(/risk tiers:.*normal/)
  })

  it('shows an empty-result notice when the filter matches nothing', () => {
    const text = formatInventoryTable(buildInventoryReport(undefined, { search: 'zzz-no-match' }))
    expect(text).toContain('(no entries match the filter)')
  })
})
