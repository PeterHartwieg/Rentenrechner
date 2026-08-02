import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')

function parseHeaderBlock(path: string): Record<string, string> {
  const lines = headers.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === path)

  if (start < 0) throw new Error(`Missing ${path} header block`)

  const entries: Array<[string, string]> = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue
    if (!/^\s/.test(line)) break

    const separator = line.indexOf(':')
    if (separator < 0) throw new Error(`Malformed header in ${path}: ${line.trim()}`)
    entries.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()])
  }

  return Object.fromEntries(entries)
}

function parseContentSecurityPolicy(value: string): Record<string, string[]> {
  return Object.fromEntries(
    value.split(';').map((rawDirective) => {
      const [name, ...sources] = rawDirective.trim().split(/\s+/)
      return [name, sources]
    }),
  )
}

const baselineHeaders = parseHeaderBlock('/*')

describe('production security headers', () => {
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
