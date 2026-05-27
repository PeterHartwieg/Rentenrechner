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
import { readUrlState, buildShareUrl, toBase64Url } from './urlShare'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { buildStateJson } from '../storage'
import {
  COMPACT_SHARE_DEFAULTS_BY_VERSION,
  COMPACT_STATE_DEFAULTS_VERSION,
} from './urlShareDefaults'

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
    expect(result).toEqual({ kind: 'invalid' })
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

  it('still reads legacy full-payload share URLs', () => {
    const fullPayload = buildStateJson(
      { ...defaultProfile, age: 43 },
      defaultAssumptions,
    )
    setSearch(`/?s=${toBase64Url(fullPayload)}`)

    const result = readUrlState()
    expect(result.kind).toBe('valid')
    if (result.kind === 'valid') {
      expect(result.state.profile.age).toBe(43)
      expect(result.state.assumptions).toEqual(defaultAssumptions)
    }
  })

  it('omits default values from newly built share URLs', () => {
    const compactUrl = buildShareUrl(defaultProfile, defaultAssumptions)
    const fullPayload = buildStateJson(defaultProfile, defaultAssumptions)
    const compactEncoded = new URL(compactUrl).searchParams.get('s')

    expect(compactEncoded).not.toBeNull()
    // buildShareUrl should stay meaningfully smaller than buildStateJson for
    // defaultProfile/defaultAssumptions. Use the canonical toBase64Url length
    // on both sides so UTF-8 payload growth is measured the same way.
    expect(compactEncoded!.length).toBeLessThan(toBase64Url(fullPayload).length / 2)

    const search = compactUrl.slice(compactUrl.indexOf('?'))
    setSearch(`/${search}`)
    const result = readUrlState()
    expect(result.kind).toBe('valid')
    if (result.kind === 'valid') {
      expect(result.state.profile).toEqual(defaultProfile)
      expect(result.state.assumptions).toEqual(defaultAssumptions)
    }
  })

  it('hydrates sparse payloads from their versioned default snapshot', () => {
    const payload = JSON.stringify({
      version: 1,
      encoding: 'sparse-defaults-v1',
      defaultsVersion: COMPACT_STATE_DEFAULTS_VERSION,
      profile: { age: 44 },
      assumptions: { bav: { monthlyGrossConversion: 321 } },
    })
    setSearch(`/?s=${toBase64Url(payload)}`)

    const result = readUrlState()
    expect(result.kind).toBe('valid')
    if (result.kind === 'valid') {
      expect(result.state.profile).toEqual({ ...defaultProfile, age: 44 })
      expect(result.state.assumptions.bav.monthlyGrossConversion).toBe(321)
      expect(result.state.assumptions.etf).toEqual(defaultAssumptions.etf)
    }
  })

  it('rejects compact links with an unknown default snapshot', () => {
    const payload = JSON.stringify({
      version: 1,
      encoding: 'sparse-defaults-v1',
      defaultsVersion: 'missing-default-snapshot',
      profile: {},
      assumptions: {},
    })
    setSearch(`/?s=${toBase64Url(payload)}`)

    expect(readUrlState()).toEqual({ kind: 'invalid' })
  })

  it('keeps the compact-share default snapshot aligned with current defaults', () => {
    expect(COMPACT_SHARE_DEFAULTS_BY_VERSION[COMPACT_STATE_DEFAULTS_VERSION]).toEqual({
      profile: defaultProfile,
      assumptions: defaultAssumptions,
    })
  })
})
