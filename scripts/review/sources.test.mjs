import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

// Vitest resolves the TS import; this is the drift guard that keeps the
// review catalog honest about what it reuses.
import { validationSources } from '../../src/test/externalGoldenFixtures'

import { GOLDEN_SOURCE_AREAS, GOLDEN_SOURCE_REVIEWS, RESEARCH_DOCS } from './sourceCatalog.mjs'
import { classifyPath } from './lib/impactMap.mjs'
import {
  DEFAULT_POLICY,
  assessFreshness,
  buildCatalog,
  isRealCalendarDate,
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

  it('treats an impossible header date as no date at all (typo != evidence)', () => {
    // Parsed prose degrades to "no record"; curated review records fail loudly.
    expect(parseResearchDocHeaders('Last researched: 2026-02-31\nLast reviewed: 2026-04-31')).toEqual({
      lastCaptured: null,
      lastReviewed: null,
    })
    // A valid header alongside a broken one still counts.
    expect(parseResearchDocHeaders('Last reviewed: 2026-02-31\nLast audited: 2026-02-28').lastReviewed).toBe('2026-02-28')
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

  it('every root statutory doc in the repo IS catalogued (reverse drift guard)', () => {
    // The impact map derives its statutory-source list from this catalog, so
    // an uncatalogued root research/legal doc would be classified by the .md
    // extension allowlist — i.e. cosmetic — and skip calculation review.
    const catalogued = new Set(RESEARCH_DOCS.map((doc) => doc.path))
    const onDisk = readdirSync(process.cwd()).filter(
      (name) => /_RESEARCH\.md$/.test(name) || /^LEGAL_.*\.md$/.test(name),
    )
    expect(onDisk.length).toBeGreaterThan(0)
    for (const name of onDisk) {
      expect(catalogued.has(name), `${name} is not in RESEARCH_DOCS`).toBe(true)
      expect(classifyPath(name), name).toBe('meaningful')
    }
  })

  it('every golden source area set references known domains', () => {
    for (const areas of Object.values(GOLDEN_SOURCE_AREAS)) {
      for (const area of areas) expect(REVIEW_DOMAINS).toContain(area)
    }
  })
})

describe('explicit golden source review records', () => {
  const goldenSources = [
    { id: 'src-a', label: 'Source A', url: 'https://example.de/a', capturedAt: '2026-05-02' },
    { id: 'src-b', label: 'Source B', url: 'https://example.de/b', capturedAt: '2026-05-02' },
  ]
  const build = (goldenReviews) =>
    buildCatalog({
      goldenSources,
      researchDocEntries: [],
      goldenAreas: { 'src-a': ['tax-payroll'], 'src-b': [] },
      goldenReviews,
    })

  it('carries a valid review record onto the entry and into the assessment', () => {
    const [a, b] = build({
      'src-a': { lastReviewed: '2026-08-20', note: 'checked against golden fixture bmf-est-2026-tariff @ abc1234' },
    })
    expect(a.lastReviewed).toBe('2026-08-20')
    expect(a.reviewNote).toBe('checked against golden fixture bmf-est-2026-tariff @ abc1234')
    // A record for one source never spills onto its neighbours.
    expect(b.lastReviewed).toBeNull()
    expect(b.reviewNote).toBeNull()

    const [assessedA, assessedB] = assessFreshness([a, b], { now: NOW })
    expect(assessedA.reviewStatus).toBe('fresh')
    expect(assessedB.reviewStatus).toBe('never-reviewed')
  })

  it('accepts a record without a note but rejects a non-string note', () => {
    expect(build({ 'src-a': { lastReviewed: '2026-08-20' } })[0].reviewNote).toBeNull()
    expect(() => build({ 'src-a': { lastReviewed: '2026-08-20', note: 42 } })).toThrow(/non-string note/)
  })

  it('rejects a record for an unknown golden source id (silent typo = silent gap)', () => {
    expect(() => build({ 'src-typo': { lastReviewed: '2026-08-20' } })).toThrow(
      /unknown golden source id "src-typo"/,
    )
  })

  it('rejects malformed review dates instead of rendering them', () => {
    for (const bad of ['2026-8-20', '20.08.2026', 'yesterday', '', '2026-08-20T00:00:00Z']) {
      expect(() => build({ 'src-a': { lastReviewed: bad } }), bad).toThrow(/invalid lastReviewed date/)
    }
    expect(() => build({ 'src-a': { lastReviewed: undefined } })).toThrow(/invalid lastReviewed date/)
    expect(() => build({ 'src-a': {} })).toThrow(/invalid lastReviewed date/)
  })

  it('rejects impossible calendar dates that merely LOOK well-formed', () => {
    // `new Date('2026-02-31')` rolls over to 2026-03-03: a shape check alone
    // would measure — and could label fresh — a day that never existed.
    for (const impossible of ['2026-02-31', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-10', '2026-06-00', '2025-02-29']) {
      expect(() => build({ 'src-a': { lastReviewed: impossible } }), impossible).toThrow(
        /invalid lastReviewed date .* use a real calendar date/,
      )
    }
  })

  it('accepts real leap days and month ends', () => {
    for (const good of ['2024-02-29', '2026-02-28', '2026-01-31', '2026-12-31']) {
      expect(build({ 'src-a': { lastReviewed: good } })[0].lastReviewed, good).toBe(good)
    }
  })

  it('rejects records that are not objects carrying lastReviewed', () => {
    expect(() => build({ 'src-a': '2026-08-20' })).toThrow(/must be an object with lastReviewed/)
    expect(() => build({ 'src-a': ['2026-08-20'] })).toThrow(/must be an object with lastReviewed/)
    expect(() => build({ 'src-a': null })).toThrow(/must be an object with lastReviewed/)
  })

  it('never fabricates a review date from the capture date', () => {
    const [a] = build({})
    expect(a.lastCaptured).toBe('2026-05-02')
    expect(a.lastReviewed).toBeNull()
  })

  it('the shipped catalog only contains records a real audit could have written', () => {
    // Records are added by the monthly audit procedure
    // (docs/automation/calculation-review-toolchain.md), never generated.
    // Whatever is present must reference a real fixture id and a real date;
    // an empty record set is the honest initial state.
    const catalog = buildCatalog({
      goldenSources: validationSources,
      researchDocEntries: [],
      goldenAreas: GOLDEN_SOURCE_AREAS,
      goldenReviews: GOLDEN_SOURCE_REVIEWS,
    })
    for (const [id, record] of Object.entries(GOLDEN_SOURCE_REVIEWS)) {
      const fixture = validationSources.find((s) => s.id === id)
      expect(fixture, id).toBeDefined()
      expect(record.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // A review is an act on a date, not a copy of the capture date.
      expect(record.note, id).toEqual(expect.any(String))
    }
    for (const entry of catalog) {
      const record = GOLDEN_SOURCE_REVIEWS[entry.id]
      expect(entry.lastReviewed).toBe(record ? record.lastReviewed : null)
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

  it('never labels a future date fresh', () => {
    // Nobody captured or reviewed anything on a day that has not happened.
    const assessment = assessFreshness(
      [
        { id: 'ahead', label: 'Ahead of the clock', areas: [], location: 'u', lastCaptured: '2027-01-01', lastReviewed: '2026-12-24' },
        { id: 'today', label: 'Captured today', areas: [], location: 'u', lastCaptured: '2026-09-08', lastReviewed: null },
      ],
      { now: NOW },
    )
    expect(assessment[0].captureStatus).toBe('future-dated')
    expect(assessment[0].reviewStatus).toBe('future-dated')
    expect(assessment[0].needsAttention).toBe(true)
    // The report shows the offending date rather than hiding it.
    expect(renderFreshnessReport(assessment, { now: NOW })).toContain('capture future-dated; review future-dated')

    // The clock's own day is not the future.
    expect(assessment[1].captureStatus).toBe('fresh')
  })

  it('never labels an impossible date fresh either', () => {
    const [entry] = assessFreshness(
      [{ id: 'x', label: 'Typo', areas: [], location: 'u', lastCaptured: '2026-02-31', lastReviewed: null }],
      { now: NOW },
    )
    expect(entry.captureStatus).toBe('invalid-date')
    expect(entry.needsAttention).toBe(true)
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

describe('isRealCalendarDate', () => {
  it('accepts only real, ISO-shaped calendar dates', () => {
    for (const good of ['2026-09-09', '2024-02-29', '2000-02-29', '1999-12-31']) {
      expect(isRealCalendarDate(good), good).toBe(true)
    }
    for (const bad of ['2026-02-31', '2025-02-29', '1900-02-29', '2026-13-01', '2026-00-01', '2026-06-00', '2026-6-9', '2026/06/09', '', null, undefined, 20260609]) {
      expect(isRealCalendarDate(bad), String(bad)).toBe(false)
    }
  })
})
