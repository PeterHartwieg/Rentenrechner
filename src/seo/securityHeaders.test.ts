import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')

describe('production security headers', () => {
  it('prevents framing, MIME sniffing, and unnecessary browser capabilities', () => {
    expect(headers).toContain('X-Frame-Options: DENY')
    expect(headers).toContain('X-Content-Type-Options: nosniff')
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin')
    expect(headers).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains')
    expect(headers).toContain('Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()')
  })

  it('keeps the calculator same-origin except for the sanctioned QA services', () => {
    expect(headers).toContain("default-src 'self'")
    expect(headers).toContain("frame-ancestors 'none'")
    expect(headers).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com")
    expect(headers).toContain('frame-src https://challenges.cloudflare.com')
    expect(headers).toContain(
      "connect-src 'self' https://qa.rentenwiki.de https://challenges.cloudflare.com",
    )
  })
})
