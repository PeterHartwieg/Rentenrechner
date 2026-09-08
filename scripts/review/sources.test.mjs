import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// Vitest resolves the TS import; this is the drift guard that keeps the
// review catalog honest about what it reuses.
import { validationSources } from '../../src/test/externalGoldenFixtures'

import { GOLDEN_SOURCE_AREAS, RESEARCH_DOCS } from './sourceCatalog.mjs'
import {
  DEFAULT_POLICY,
  assessFreshness,
  buildCatalog,
  parseResearchDocHeaders,
  renderFreshnessReport,
} from './lib/sources.mjs'
import { REVIEW_DOMAINS } from './lib/impactMap.mjs'

const NOW = new Date('2026-09-08T12:00:00Z')

describe('research doc header parsing', () => {
  it('separates capture activity from review activity', () => {
    const headers = parseResearchDocHeaders(
      [
        '# Doc',
        'Last researched: 2026-04-28',
        'Last reviewed: 2026-05-06',
        'Targeted update: 2026-05-06 — something specific.',
      ].join('\n'),
    )
    expect(headers).toEqual({ lastCaptured: '2026-05-06', lastReviewed: '2026-05-06' })
  })

  it('counts audited and structured-review headers as review records', () => {
    expect(parseResearchDocHeaders('Last audited: 2026-04-28')).toEqual({
      lastCaptured: null,
      lastReviewed: '2026-04-28',
    })
    expect(parseResearchDocHeaders('Last structured review: 2026-04-27')).toEqual({
      lastCaptured: null,
      lastReviewed: '2026-04-27',
    })
  })

  it('keeps unknown review dates null instead of borrowing the capture date', () => {
    expect(parseResearchDocHeaders('Last researched: 2026-04-28')).toEqual({
      lastCaptured: '2026-04-28',
      lastReviewed: null,
    })
  })

  it('takes the latest date when several headers exist', () => {
    const headers = parseResearchDocHeaders('Last reviewed: 2026-01-01\nLast audited: 2026-02-01')
    expect(headers.lastReviewed).toBe('2026-02-01')
  })
})

describe('catalog <-> validationSources reuse', () => {
  it('maps every validationSources id and nothing else (drift guard)', () => {
    const fixtureIds = validationSources.map((s) => s.id).sort()
    const catalogIds = Object.keys(GOLDEN_SOURCE_AREAS).sort()
    expect(catalogIds).toEqual(fixtureIds)
  })

  it('golden source capture dates come from the fixtures, never duplicated here', () => {
    const catalog = buildCatalog({
      goldenSources: validationSources,
      researchDocEntries: [],
      goldenAreas: GOLDEN_SOURCE_AREAS,
    })
    for (const entry of catalog.filter((e) => e.kind === 'golden-source')) {
      const fixture = validationSources.find((s) => s.id === entry.id)
      expect(entry.lastCaptured).toBe(fixture.capturedAt)
      expect(entry.location).toBe(fixture.url)
      // Review records for golden sources do not exist yet — they must stay
      // null rather than inheriting the capture date.
      expect(entry.lastReviewed).toBeNull()
    }
  })

  it('every research doc in the catalog exists in the repo with valid areas', () => {
    for (const doc of RESEARCH_DOCS) {
      expect(existsSync(doc.path), doc.path).toBe(true)
      expect(doc.areas.length).toBeGreaterThan(0)
      for (const area of doc.areas) expect(REVIEW_DOMAINS).toContain(area)
      readFileSync(doc.path, 'utf8') // must be readable
    }
  })

  it('every golden source area set references known domains', () => {
    for (const areas of Object.values(GOLDEN_SOURCE_AREAS)) {
      for (const area of areas) expect(REVIEW_DOMAINS).toContain(area)
    }
  })
})

describe('assessFreshness', () => {
  const entries = [
    { id: 'fresh', label: 'Fresh source', areas: ['tax-payroll'], location: 'u', lastCaptured: '2026-06-01', lastReviewed: '2026-06-01' },
    { id: 'stale-capture', label: 'Old capture', areas: [], location: 'u', lastCaptured: '2025-01-01', lastReviewed: '2026-06-01' },
    { id: 'never-reviewed', label: 'Never reviewed', areas: [], location: 'u', lastCaptured: '2026-06-01', lastReviewed: null },
    { id: 'stale-review', label: 'Stale review', areas: [], location: 'u', lastCaptured: '2026-06-01', lastReviewed: '2025-01-01' },
  ]

  it('classifies capture and review staleness independently', () => {
    const [fresh, staleCapture, neverReviewed, staleReview] = assessFreshness(entries, { now: NOW })
    expect(fresh.captureStatus).toBe('fresh')
    expect(fresh.reviewStatus).toBe('fresh')

    expect(staleCapture.captureStatus).toBe('stale')
    expect(staleCapture.reviewStatus).toBe('fresh')

    expect(neverReviewed.reviewStatus).toBe('never-reviewed')
    expect(neverReviewed.lastReviewed).toBeNull()

    expect(staleReview.reviewStatus).toBe('stale')
  })

  it('marks every non-fresh combination as needing attention', () => {
    const assessment = assessFreshness(entries, { now: NOW })
    expect(assessment.map((e) => e.needsAttention)).toEqual([false, true, true, true])
  })

  it('uses the policy months (approximated as 30.44 days) around the boundary', () => {
    const policy = { captureStaleAfterMonths: 6, reviewStaleAfterMonths: 6 }
    const fiveMonths = assessFreshness(
      [{ id: 'x', label: 'X', areas: [], location: 'u', lastCaptured: '2026-04-01', lastReviewed: null }],
      { now: NOW, policy },
    )
    expect(fiveMonths[0].captureStatus).toBe('fresh')

    const sevenMonths = assessFreshness(
      [{ id: 'x', label: 'X', areas: [], location: 'u', lastCaptured: '2026-02-01', lastReviewed: null }],
      { now: NOW, policy },
    )
    expect(sevenMonths[0].captureStatus).toBe('stale')
  })

  it('refuses to run without a concrete clock (determinism)', () => {
    expect(() => assessFreshness(entries, { now: undefined })).toThrow(/concrete now Date/)
    expect(() => assessFreshness(entries, { now: new Date('not-a-date') })).toThrow(/concrete now Date/)
  })
})

describe('renderFreshnessReport', () => {
  it('lists stale/unreviewed items with links, areas, and both dates', () => {
    const entries = [
      { id: 'g', kind: 'golden-source', label: 'BMF tariff', areas: ['tax-payroll'], location: 'https://example.de/tariff', lastCaptured: '2026-05-02', lastReviewed: null },
      { id: 'd', kind: 'research-doc', label: 'AVD research', areas: ['funding-eligibility'], location: 'ALTERSVORSORGEDEPOT_2027_RESEARCH.md', lastCaptured: '2026-04-28', lastReviewed: null },
    ]
    const assessment = assessFreshness(entries, { now: NOW })
    const report = renderFreshnessReport(assessment, { now: NOW })

    expect(report).toContain('# Source freshness report')
    expect(report).toContain('## Needs attention')
    expect(report).toContain('https://example.de/tariff')
    expect(report).toContain('ALTERSVORSORGEDEPOT_2027_RESEARCH.md')
    expect(report).toContain('null (no record)')
    expect(report).toContain('review never-reviewed')
    expect(report).toContain('tax/payroll')
  })

  it('never frames freshness as legal approval', () => {
    const report = renderFreshnessReport([], { now: NOW })
    expect(report).toMatch(/never approves an interpretation/)
  })

  it('renders identically for the same inputs (deterministic)', () => {
    const entries = [
      { id: 'g', kind: 'golden-source', label: 'BMF tariff', areas: ['tax-payroll'], location: 'https://example.de', lastCaptured: '2026-05-02', lastReviewed: null },
    ]
    const a = renderFreshnessReport(assessFreshness(entries, { now: NOW }), { now: NOW })
    const b = renderFreshnessReport(assessFreshness(entries, { now: NOW }), { now: NOW })
    expect(a).toBe(b)
  })
})

describe('default policy', () => {
  it('is explicit and bounded', () => {
    expect(DEFAULT_POLICY).toEqual({ captureStaleAfterMonths: 6, reviewStaleAfterMonths: 6 })
  })
})
