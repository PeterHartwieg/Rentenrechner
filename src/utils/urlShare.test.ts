// @vitest-environment jsdom
/**
 * Tests for the discriminated-union return value of readUrlState (issue #74).
 *
 * readUrlState now returns:
 *   { kind: 'absent' }  — no ?s= param
 *   { kind: 'invalid' } — ?s= present but corrupt / parse failure
 *   { kind: 'valid', state } — ?s= present and valid
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readUrlState, buildShareUrl } from './urlShare'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'

function setSearch(search: string) {
  // jsdom does not support directly assigning window.location.search,
  // so we use replaceState to update the URL.
  window.history.replaceState(null, '', search || '/')
}

beforeEach(() => {
  setSearch('/')
})

afterEach(() => {
  setSearch('/')
  vi.restoreAllMocks()
})

describe('readUrlState — absent', () => {
  it('returns { kind: "absent" } when no ?s= param is present', () => {
    setSearch('/')
    expect(readUrlState()).toEqual({ kind: 'absent' })
  })

  it('returns { kind: "absent" } when only unrelated params are present', () => {
    setSearch('/?view=vergleich')
    expect(readUrlState()).toEqual({ kind: 'absent' })
  })
})

describe('readUrlState — invalid', () => {
  it('returns { kind: "invalid" } for a truncated/garbled ?s= value', () => {
    setSearch('/?s=truncated!!!!')
    expect(readUrlState()).toEqual({ kind: 'invalid' })
  })

  it('returns { kind: "invalid" } for base64url that decodes to non-JSON', () => {
    // 'not json at all' in base64url
    const notJson = btoa('not json at all').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    setSearch(`/?s=${notJson}`)
    expect(readUrlState()).toEqual({ kind: 'invalid' })
  })

  it('returns { kind: "invalid" } for well-formed base64 but invalid schema JSON', () => {
    // JSON object that won't pass schema validation
    const badJson = btoa('{"totally":"wrong","schema":true}')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    setSearch(`/?s=${badJson}`)
    const result = readUrlState()
    // Must not be valid — either absent (empty encoded) or invalid
    expect(result.kind).not.toBe('valid')
  })
})

describe('readUrlState — valid', () => {
  it('returns { kind: "valid", state } for a correctly encoded share URL', () => {
    const url = buildShareUrl(defaultProfile, defaultAssumptions)
    const search = url.slice(url.indexOf('?'))
    setSearch(`/${search}`)

    const result = readUrlState()
    expect(result.kind).toBe('valid')
    if (result.kind === 'valid') {
      expect(result.state.profile).toBeDefined()
      expect(result.state.assumptions).toBeDefined()
    }
  })

  it('valid state round-trips profile age correctly', () => {
    const profile = { ...defaultProfile, age: 42 }
    const url = buildShareUrl(profile, defaultAssumptions)
    const search = url.slice(url.indexOf('?'))
    setSearch(`/${search}`)

    const result = readUrlState()
    expect(result.kind).toBe('valid')
    if (result.kind === 'valid') {
      expect(result.state.profile.age).toBe(42)
    }
  })
})
