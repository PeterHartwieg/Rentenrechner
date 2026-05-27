import type { PersonalProfile, ScenarioAssumptions } from '../domain'
import { parseStateFromJson } from '../storage'
import {
  COMPACT_SHARE_DEFAULTS_BY_VERSION,
  COMPACT_STATE_DEFAULTS_VERSION,
} from './urlShareDefaults'

const URL_PARAM = 's'
const COMPACT_STATE_ENCODING = 'sparse-defaults-v1'

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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function mergeSparse<T>(sparse: unknown, defaults: T): T {
  if (Array.isArray(defaults)) {
    return cloneJson(Array.isArray(sparse) ? sparse : defaults) as T
  }
  if (!isPlainObject(defaults)) {
    return cloneJson(sparse === undefined ? defaults : sparse) as T
  }

  const result = cloneJson(defaults) as Record<string, unknown>
  if (!isPlainObject(sparse)) return result as T

  for (const key of Object.keys(sparse)) {
    const sparseValue = sparse[key]
    if (sparseValue === undefined) continue
    const defaultValue = (defaults as Record<string, unknown>)[key]
    result[key] = defaultValue === undefined
      ? cloneJson(sparseValue)
      : mergeSparse(sparseValue, defaultValue)
  }

  return result as T
}

function expandCompactStateJson(raw: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isPlainObject(parsed)) return raw
  if (parsed.encoding !== COMPACT_STATE_ENCODING) return raw
  if (typeof parsed.defaultsVersion !== 'string') return null

  const defaults = COMPACT_SHARE_DEFAULTS_BY_VERSION[parsed.defaultsVersion]
  if (!defaults) return null

  return JSON.stringify({
    version: 1,
    profile: mergeSparse(parsed.profile, defaults.profile),
    assumptions: mergeSparse(parsed.assumptions, defaults.assumptions),
  })
}

function buildCompactStateJson(
  profile: PersonalProfile,
  assumptions: ScenarioAssumptions,
): string {
  const defaults = COMPACT_SHARE_DEFAULTS_BY_VERSION[COMPACT_STATE_DEFAULTS_VERSION]
  return JSON.stringify({
    version: 1,
    encoding: COMPACT_STATE_ENCODING,
    defaultsVersion: COMPACT_STATE_DEFAULTS_VERSION,
    profile: omitDefaults(profile, defaults.profile) ?? {},
    assumptions: omitDefaults(assumptions, defaults.assumptions) ?? {},
  })
}

export function toBase64Url(json: string): string {
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
    const json = expandCompactStateJson(fromBase64Url(encoded))
    if (!json) return { kind: 'invalid' }
    const state = parseStateFromJson(json)
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
