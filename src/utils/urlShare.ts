import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { parseStateFromJson } from '../storage'

const URL_PARAM = 's'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    return a.every((item, index) => valuesEqual(item, b[index]))
  }
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(b, key) && valuesEqual(a[key], b[key])
    )
  }
  return false
}

function omitDefaults(value: unknown, defaults: unknown): unknown {
  if (valuesEqual(value, defaults)) return undefined
  if (isPlainObject(value) && isPlainObject(defaults)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      const compact = omitDefaults(value[key], defaults[key])
      if (compact !== undefined) result[key] = compact
    }
    return Object.keys(result).length > 0 ? result : undefined
  }
  return value
}

function buildCompactStateJson(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
): string {
  return JSON.stringify({
    version: 1,
    profile: omitDefaults(profile, defaultProfile) ?? {},
    assumptions: omitDefaults(assumptions, defaultAssumptions) ?? {},
  })
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(encoded: string): string {
  const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

export type UrlStateResult =
  | { kind: 'valid'; state: { profile: PersonalProfile; assumptions: ScenarioAssumptions } }
  | { kind: 'invalid' }
  | { kind: 'absent' }

export function readUrlState(): UrlStateResult {
  try {
    const encoded = new URLSearchParams(window.location.search).get(URL_PARAM)
    if (!encoded) return { kind: 'absent' }
    const state = parseStateFromJson(fromBase64Url(encoded))
    if (!state) return { kind: 'invalid' }
    return { kind: 'valid', state }
  } catch {
    return { kind: 'invalid' }
  }
}

export function buildShareUrl(profile: PersonalProfile, assumptions: ScenarioAssumptions): string {
  const url = new URL(window.location.href)
  url.search = `?${URL_PARAM}=${toBase64Url(buildCompactStateJson(profile, assumptions))}`
  url.hash = ''
  return url.toString()
}
