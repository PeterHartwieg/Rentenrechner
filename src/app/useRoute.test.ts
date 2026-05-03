import { describe, expect, it } from 'vitest'
import { normalizeRoute } from './useRoute'

describe('normalizeRoute', () => {
  it('returns "/" for the root path', () => {
    expect(normalizeRoute('/')).toBe('/')
  })

  it('recognises /impressum and /datenschutz', () => {
    expect(normalizeRoute('/impressum')).toBe('/impressum')
    expect(normalizeRoute('/datenschutz')).toBe('/datenschutz')
  })

  it('strips a trailing slash on legal routes', () => {
    expect(normalizeRoute('/impressum/')).toBe('/impressum')
    expect(normalizeRoute('/datenschutz/')).toBe('/datenschutz')
  })

  it('falls back to "/" for unknown paths', () => {
    expect(normalizeRoute('/something-else')).toBe('/')
    expect(normalizeRoute('/admin')).toBe('/')
    expect(normalizeRoute('')).toBe('/')
  })
})
