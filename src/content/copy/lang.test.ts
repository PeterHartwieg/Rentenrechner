import { describe, it, expect } from 'vitest'
import { resolveLang, DEFAULT_LANG, UI_LANGS } from './lang'

describe('resolveLang', () => {
  it('defaults to German', () => {
    expect(DEFAULT_LANG).toBe('de')
    expect(resolveLang('')).toBe('de')
    expect(resolveLang('?foo=bar')).toBe('de')
    expect(resolveLang('?lang=fr')).toBe('de') // unknown → safe German fallback
    expect(resolveLang('?lang=de')).toBe('de')
  })

  it('resolves English from ?lang=en (with or without the leading ?)', () => {
    expect(resolveLang('?lang=en')).toBe('en')
    expect(resolveLang('lang=en')).toBe('en')
    expect(resolveLang('?topic=x&lang=en')).toBe('en')
  })

  it('exposes the supported languages', () => {
    expect([...UI_LANGS]).toEqual(['de', 'en'])
  })
})
