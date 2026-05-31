import { describe, it, expect, vi } from 'vitest'
import { copy, createCopyAccessor, allCopyEntries } from './catalog'
import { COPY_KEY_PATTERN, COPY_RISKS, structuralIssues } from './validate'
import type { CopyEntry } from './types'

/**
 * Slice 1 acceptance:
 * - keys are stable and NOT derived from German text,
 * - missing-key access fails loudly (dev / test),
 * - the catalog loads and is internally consistent.
 */

describe('copy catalog — loaded entries', () => {
  it('exposes the migrated landing strings by stable key', () => {
    expect(copy.de('landing.cta.combine')).toBe('Mein Plan erstellen')
    expect(copy.de('landing.cta.compare')).toBe('Vergleich starten')
    expect(copy.de('landing.hero.kicker')).toContain('Eine offene Auskunft')
  })

  it('has at least 10 representative entries (spike target: 10–20)', () => {
    expect(allCopyEntries().length).toBeGreaterThanOrEqual(10)
  })

  it('every entry has non-empty German text', () => {
    for (const entry of allCopyEntries()) {
      expect(entry.de.trim().length, `de empty for "${entry.key}"`).toBeGreaterThan(0)
    }
  })

  it('every key is stable: lowercase dotted ASCII, never the German text', () => {
    for (const entry of allCopyEntries()) {
      expect(entry.key, `bad key "${entry.key}"`).toMatch(COPY_KEY_PATTERN)
      expect(entry.key).not.toMatch(/\s/) // no spaces → not a sentence
      expect(entry.key).toBe(entry.key.toLowerCase())
    }
  })

  it('keys are unique', () => {
    const keys = allCopyEntries().map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every entry carries a known risk tier', () => {
    for (const entry of allCopyEntries()) {
      expect(COPY_RISKS as readonly string[]).toContain(entry.risk)
    }
  })

  it('the loaded catalog has no structural issues', () => {
    expect(structuralIssues(allCopyEntries())).toEqual([])
  })
})

describe('copy catalog — fail-loud on missing key', () => {
  it('throws for an unknown key (strict, the default in dev/test)', () => {
    expect(() => copy.de('landing.does.not.exist')).toThrow(/missing key/)
  })

  it('en() returns the translation when present, undefined when not (no throw)', () => {
    // Slice 5 adds en to the short labels; step bodies stay untranslated.
    expect(copy.en('landing.cta.combine')).toBe('Create my plan')
    expect(copy.en('landing.step.beschreiben.body')).toBeUndefined()
  })

  it('en() of an unknown key fails loudly', () => {
    expect(() => copy.en('landing.nope')).toThrow(/missing key/)
  })

  it('has() distinguishes known from unknown keys', () => {
    expect(copy.has('landing.cta.combine')).toBe(true)
    expect(copy.has('landing.nope')).toBe(false)
  })
})

describe('createCopyAccessor — strict validation', () => {
  const valid: CopyEntry[] = [
    { key: 'a.one', de: 'eins', surface: 'a', risk: 'normal' },
    { key: 'a.two', de: 'zwei', surface: 'a', risk: 'normal', en: 'two' },
  ]

  it('serves both German and English when present', () => {
    const c = createCopyAccessor(valid, { strict: true })
    expect(c.de('a.one')).toBe('eins')
    expect(c.en('a.two')).toBe('two')
    expect(c.en('a.one')).toBeUndefined()
  })

  it('throws on duplicate keys', () => {
    const dup: CopyEntry[] = [
      { key: 'a.one', de: 'eins', surface: 'a', risk: 'normal' },
      { key: 'a.one', de: 'noch eins', surface: 'a', risk: 'normal' },
    ]
    expect(() => createCopyAccessor(dup, { strict: true })).toThrow(/duplicate-key/)
  })

  it('throws on a missing German value', () => {
    const bad = [{ key: 'a.one', de: '', surface: 'a', risk: 'normal' }] as CopyEntry[]
    expect(() => createCopyAccessor(bad, { strict: true })).toThrow(/missing-de/)
  })

  it('throws on a key derived from prose (spaces / uppercase)', () => {
    const bad = [
      { key: 'Das ist Deutsch', de: 'x', surface: 'a', risk: 'normal' },
    ] as CopyEntry[]
    expect(() => createCopyAccessor(bad, { strict: true })).toThrow(/bad-key-format/)
  })
})

describe('createCopyAccessor — lenient (production) fallback', () => {
  it('returns the key and logs instead of throwing when not strict', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const c = createCopyAccessor(
        [{ key: 'a.one', de: 'eins', surface: 'a', risk: 'normal' }],
        { strict: false },
      )
      expect(c.de('a.missing')).toBe('a.missing')
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })
})
