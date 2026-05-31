import { describe, it, expect } from 'vitest'
import { buildTranslationReport, formatTranslationReport } from './bilingual'
import { loadRawCopyEntries } from './sources'
import type { CopySource } from './sources'
import type { CopyEntry } from './types'

const src = (entries: CopyEntry[]): CopySource[] => [{ file: 'test/fixture.copy.json', entries }]

describe('bilingual — German is the required source language', () => {
  it('every catalog key has non-empty German text', () => {
    for (const entry of loadRawCopyEntries()) {
      expect(entry.de.trim().length, `de missing for "${entry.key}"`).toBeGreaterThan(0)
    }
  })

  it('de coverage of the real catalog is 100%', () => {
    const report = buildTranslationReport('de')
    expect(report.translated).toBe(report.total)
    expect(report.coverage).toBe(1)
    expect(report.missing).toEqual([])
  })
})

describe('bilingual — English coverage is measurable and partial', () => {
  it('reports en progress without requiring completeness', () => {
    const report = buildTranslationReport('en')
    expect(report.total).toBeGreaterThan(0)
    expect(report.translated).toBeGreaterThan(0) // some en exists (Slice 5)
    expect(report.translated).toBeLessThan(report.total) // but not all
    expect(report.coverage).toBeGreaterThan(0)
    expect(report.coverage).toBeLessThan(1)
    expect(report.missing.length).toBe(report.total - report.translated)
  })

  it('a translated label is counted; an untranslated body is listed as missing', () => {
    const report = buildTranslationReport('en')
    const missingKeys = report.missing.map((m) => m.key)
    expect(missingKeys).toContain('landing.step.beschreiben.body') // intentionally untranslated
    expect(missingKeys).not.toContain('landing.cta.combine') // has en
  })
})

describe('buildTranslationReport — crafted sources', () => {
  it('counts translated vs missing for a given language', () => {
    const report = buildTranslationReport(
      'en',
      src([
        { key: 'a.one', de: 'eins', en: 'one', surface: 'a', risk: 'normal' },
        { key: 'a.two', de: 'zwei', surface: 'a', risk: 'normal' },
        { key: 'a.three', de: 'drei', en: '   ', surface: 'a', risk: 'normal' }, // blank → missing
      ]),
    )
    expect(report.total).toBe(3)
    expect(report.translated).toBe(1)
    expect(report.missing.map((m) => m.key).sort()).toEqual(['a.three', 'a.two'])
  })

  it('does not crash on malformed sources/entries (skips them)', () => {
    const report = buildTranslationReport('de', [
      { file: 'test/bad.copy.json', entries: { not: 'array' } as unknown as CopyEntry[] },
      { file: 'test/ok.copy.json', entries: [null, 7, { key: 'a.one', de: 'eins', surface: 'a', risk: 'normal' }] as unknown as CopyEntry[] },
    ])
    expect(report.total).toBe(1) // only the one valid entry is counted
    expect(report.translated).toBe(1)
    expect(report.missing).toEqual([])
  })
})

describe('formatTranslationReport', () => {
  it('renders a coverage line and the missing list', () => {
    const text = formatTranslationReport(buildTranslationReport('en'))
    expect(text).toMatch(/EN coverage: \d+\/\d+ \(\d+%\)/)
    expect(text).toContain('Missing en')
  })

  it('renders a clean line when nothing is missing (de)', () => {
    const text = formatTranslationReport(buildTranslationReport('de'))
    expect(text).toContain('All entries have de.')
  })
})
