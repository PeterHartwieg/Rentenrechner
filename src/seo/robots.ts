import { SITE_ORIGIN } from './publicRouteRegistry'

/**
 * Crawler allow-list — pinned in issue #01 (locked decisions).
 *
 * Allowed bots get a per-bot block with `Allow: /` so the policy is explicit
 * (some hosts apply default-deny to unrecognised bots). The order is
 * deterministic so byte-for-byte tests are stable.
 */
export const ALLOWED_BOTS: readonly string[] = [
  'Googlebot',
  'Bingbot',
  'Applebot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
]

/**
 * Crawler disallow-list — pinned in issue #01 (locked decisions).
 *
 * These are training/scraping crawlers we explicitly want excluded. The set
 * matches the project's source-available, non-commercial license posture: we
 * publish openly for humans and search/answer crawlers, but do not consent to
 * model-training scraping.
 */
export const DISALLOWED_BOTS: readonly string[] = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'CCBot',
]

/**
 * Generate `robots.txt` content. Pure function — deterministic byte-for-byte
 * output for the same input. Tests assert structure and content.
 *
 * Format:
 *   1. `Sitemap:` reference at top (allowed by RFC; common convention).
 *   2. One allow block per allowed bot.
 *   3. One disallow block per disallowed bot.
 *   4. Wildcard `User-agent: *` block at the end with `Allow: /` so that
 *      unrecognised search crawlers are not blocked by default. The site is
 *      a public publication.
 *
 * Cloudflare zone-level Content Signals (`search=yes, ai-input=yes,
 * ai-train=no`) are handled separately in issue #09 and do not appear here.
 */
export function generateRobots(): string {
  const lines: string[] = []
  // Standard convention: sitemap line first so simple parsers find it
  // without scanning the full file.
  lines.push(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)
  lines.push('')

  for (const bot of ALLOWED_BOTS) {
    lines.push(`User-agent: ${bot}`)
    lines.push('Allow: /')
    lines.push('')
  }

  for (const bot of DISALLOWED_BOTS) {
    lines.push(`User-agent: ${bot}`)
    lines.push('Disallow: /')
    lines.push('')
  }

  // Default for everything else — explicit allow keeps unrecognised but
  // legitimate search crawlers (e.g., Yandex, DuckDuckBot) included. The
  // license posture is enforced by per-bot disallow above, not by default-deny.
  lines.push('User-agent: *')
  lines.push('Allow: /')
  lines.push('')

  return lines.join('\n')
}
