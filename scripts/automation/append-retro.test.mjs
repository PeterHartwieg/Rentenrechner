import { describe, expect, it } from 'vitest'
import { normalizeRetroEntry } from './append-retro.mjs'

describe('normalizeRetroEntry', () => {
  it('surrounds a retro entry with archive separators', () => {
    expect(normalizeRetroEntry('---\nstage: implement\n---\n')).toBe(
      '\n\n---\nstage: implement\n---\n',
    )
  })

  it('rejects empty entries', () => {
    expect(() => normalizeRetroEntry('  \n')).toThrow(/empty/)
  })
})
