import { describe, expect, it } from 'vitest'
import { ALLOWED_BOTS, DISALLOWED_BOTS, ORIGIN_CONTENT_SIGNAL, generateRobots } from './robots'
import { SITE_ORIGIN } from './publicRouteRegistry'

describe('generateRobots — locked policy from issue #01', () => {
  const robots = generateRobots()

  it('starts with a Sitemap reference at the top', () => {
    expect(robots.startsWith(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)).toBe(true)
  })

  it('explicitly allows every bot in the locked allow-list', () => {
    // Pinned: Googlebot, Bingbot, Applebot, OAI-SearchBot, ChatGPT-User, PerplexityBot.
    expect(ALLOWED_BOTS).toEqual([
      'Googlebot',
      'Bingbot',
      'Applebot',
      'OAI-SearchBot',
      'ChatGPT-User',
      'PerplexityBot',
    ])
    for (const bot of ALLOWED_BOTS) {
      expect(robots).toContain(`User-agent: ${bot}\nAllow: /`)
    }
  })

  it('explicitly disallows every bot in the locked disallow-list', () => {
    // Pinned: GPTBot, ClaudeBot, anthropic-ai, Google-Extended, CCBot.
    expect(DISALLOWED_BOTS).toEqual([
      'GPTBot',
      'ClaudeBot',
      'anthropic-ai',
      'Google-Extended',
      'CCBot',
    ])
    for (const bot of DISALLOWED_BOTS) {
      expect(robots).toContain(`User-agent: ${bot}\nDisallow: /`)
    }
  })

  it('contains a wildcard User-agent: * fallback with Content-Signal and Allow: /', () => {
    // The wildcard block carries:
    //   - Content-Signal: search=yes,ai-input=yes,ai-train=no
    //     (origin layer — see ORIGIN_CONTENT_SIGNAL doc comment for why we
    //     duplicate the triple even though Cloudflare's managed preamble
    //     emits its own partial signal)
    //   - Allow: / (so unrecognised legit crawlers reach the site)
    expect(robots).toContain(
      `User-agent: *\nContent-Signal: ${ORIGIN_CONTENT_SIGNAL}\nAllow: /`,
    )
  })

  it('declares the locked Content-Signal triple (issue #01 + crawler-policy.md)', () => {
    // Locked policy: search=yes, ai-input=yes, ai-train=no. The full triple
    // must appear in the served output even when Cloudflare's managed
    // preamble emits only a subset (search+ai-train).
    expect(ORIGIN_CONTENT_SIGNAL).toBe('search=yes,ai-input=yes,ai-train=no')
    expect(robots).toContain(`Content-Signal: ${ORIGIN_CONTENT_SIGNAL}`)
  })

  it('does not block the wildcard User-agent', () => {
    // PRD US-39: ChatGPT Search crawler access must remain available.
    // PRD US-40: Cloudflare robots/AI crawler settings audited.
    // A wildcard `Disallow: /` would block legitimate generic search crawlers
    // we haven't enumerated explicitly (e.g. DuckDuckBot, Yandex). Assert
    // we do not regress to that.
    expect(robots).not.toMatch(/User-agent: \*\n(?:[^\n]+\n)?Disallow: \//)
  })

  it('is deterministic — same call returns byte-identical output', () => {
    expect(generateRobots()).toBe(robots)
  })
})
