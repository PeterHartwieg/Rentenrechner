import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')

function parseHeaderBlock(path: string, source = headers): Record<string, string> {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === path)

  if (start < 0) throw new Error(`Missing ${path} header block`)

  const entries: Array<[string, string]> = []
  const seenNames = new Set<string>()
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue
    if (!/^\s/.test(line)) break

    const separator = line.indexOf(':')
    if (separator < 0) throw new Error(`Malformed header in ${path}: ${line.trim()}`)
    const name = line.slice(0, separator).trim()
    const normalizedName = name.toLowerCase()
    if (seenNames.has(normalizedName)) {
      throw new Error(`Duplicate header in ${path}: ${name}`)
    }
    seenNames.add(normalizedName)
    entries.push([name, line.slice(separator + 1).trim()])
  }

  return Object.fromEntries(entries)
}

function parseContentSecurityPolicy(value: string): Record<string, string[]> {
  const directives = new Map<string, string[]>()
  for (const rawDirective of value.split(';')) {
    const [rawName, ...sources] = rawDirective.trim().split(/\s+/)
    const name = rawName.toLowerCase()
    if (directives.has(name)) {
      throw new Error(`Duplicate CSP directive: ${rawName}`)
    }
    directives.set(name, sources)
  }
  return Object.fromEntries(directives)
}

const baselineHeaders = parseHeaderBlock('/*')

describe('production security headers', () => {
  it('rejects duplicate header names and CSP directives case-insensitively', () => {
    expect(() => parseHeaderBlock('/*', '/*\n  X-Test: strict\n  x-test: permissive')).toThrow(
      /Duplicate header/,
    )
    expect(() => parseContentSecurityPolicy(
      "script-src 'self'; SCRIPT-SRC 'unsafe-inline'",
    )).toThrow(/Duplicate CSP directive/)
  })

  it('prevents framing, MIME sniffing, and unnecessary browser capabilities', () => {
    expect(baselineHeaders).toEqual({
      'Content-Security-Policy': expect.any(String),
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
  })

  it('keeps the calculator same-origin except for the sanctioned QA services', () => {
    expect(parseContentSecurityPolicy(baselineHeaders['Content-Security-Policy'])).toEqual({
      'base-uri': ["'none'"],
      'connect-src': [
        "'self'",
        'https://qa.rentenwiki.de',
        'https://challenges.cloudflare.com',
      ],
      'default-src': ["'self'"],
      'font-src': ["'self'"],
      'form-action': ["'none'"],
      'frame-ancestors': ["'none'"],
      'frame-src': ['https://challenges.cloudflare.com'],
      'img-src': ["'self'", 'data:', 'blob:'],
      'object-src': ["'none'"],
      'script-src': ["'self'", 'https://challenges.cloudflare.com'],
      'style-src': ["'self'", "'unsafe-inline'"],
    })
  })
})
