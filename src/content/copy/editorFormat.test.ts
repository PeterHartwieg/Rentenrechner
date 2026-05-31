import { describe, it, expect } from 'vitest'
import {
  orderEntryFields,
  serializeEntries,
  parseEntriesFile,
  isAllowedEntryFile,
} from './editorFormat'
import type { CopyEntry } from './types'

describe('orderEntryFields', () => {
  it('uses the canonical on-disk field order and omits empty optionals', () => {
    const e: CopyEntry = {
      key: 'a.one', de: 'D', en: '', surface: 'a', risk: 'normal', description: '   ',
    }
    expect(Object.keys(orderEntryFields(e))).toEqual(['key', 'de', 'surface', 'risk'])
  })

  it('keeps en + description in order when present', () => {
    const e: CopyEntry = {
      key: 'a.one', de: 'D', en: 'E', surface: 'a', risk: 'legal', description: 'ctx',
    }
    expect(Object.keys(orderEntryFields(e))).toEqual([
      'key', 'de', 'en', 'surface', 'risk', 'description',
    ])
  })
})

describe('serializeEntries / parseEntriesFile', () => {
  const entries: CopyEntry[] = [{ key: 'a.one', de: 'D', surface: 'a', risk: 'normal' }]

  it('emits 2-space JSON with a trailing newline', () => {
    const out = serializeEntries(entries)
    expect(out.startsWith('[\n  {\n    "key": "a.one"')).toBe(true)
    expect(out.endsWith('}\n]\n')).toBe(true)
  })

  it('round-trips through parse without drift (no-op save = no diff)', () => {
    const out = serializeEntries(entries)
    expect(parseEntriesFile(out)).toEqual(entries)
    // Re-serializing the parsed result is a fixed point.
    expect(serializeEntries(parseEntriesFile(out))).toBe(out)
  })

  it('parseEntriesFile rejects non-array JSON', () => {
    expect(() => parseEntriesFile('{}')).toThrow()
    expect(() => parseEntriesFile('not json')).toThrow()
  })
})

describe('isAllowedEntryFile — path safety', () => {
  const allowed = ['src/content/copy/entries/landing.copy.json']

  it('accepts an exact allowed file', () => {
    expect(isAllowedEntryFile(allowed[0], allowed)).toBe(true)
  })

  it('rejects traversal and arbitrary paths', () => {
    expect(isAllowedEntryFile('src/content/copy/entries/../../../../etc/passwd', allowed)).toBe(false)
    expect(isAllowedEntryFile('package.json', allowed)).toBe(false)
    expect(isAllowedEntryFile('', allowed)).toBe(false)
  })
})
