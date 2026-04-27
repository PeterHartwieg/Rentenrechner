import type { PersonalProfile, ScenarioAssumptions } from '../domain/types'
import { buildStateJson, parseStateFromJson } from '../storage'

const URL_PARAM = 's'

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

export function readUrlState(): { profile: PersonalProfile; assumptions: ScenarioAssumptions } | null {
  try {
    const encoded = new URLSearchParams(window.location.search).get(URL_PARAM)
    if (!encoded) return null
    return parseStateFromJson(fromBase64Url(encoded))
  } catch {
    return null
  }
}

export function buildShareUrl(profile: PersonalProfile, assumptions: ScenarioAssumptions): string {
  const url = new URL(window.location.href)
  url.search = `?${URL_PARAM}=${toBase64Url(buildStateJson(profile, assumptions))}`
  url.hash = ''
  return url.toString()
}
