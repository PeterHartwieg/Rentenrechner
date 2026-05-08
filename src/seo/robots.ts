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
 * Cloudflare's managed `robots.txt` preamble emits a Content-Signal line on
 * its own `User-agent: *` block, but as of 2026-05 Cloudflare's default
 * variant ships `search=yes,ai-train=no` only — `ai-input=yes` is silent.
 * Cloudflare's variant cannot be changed via API (dashboard-only, and the
 * exposed variants only differ in Disallow phrasing, not Content-Signal
 * flags). So we emit the full triple from our origin `User-agent: *` block.
 *
 * Per RFC 9309 §2.2.1, duplicate User-agent records are merged into one
 * group, so signal-aware parsers see both Cloudflare's partial signal and
 * our explicit triple. Our line communicates the documented policy intent
 * even if Cloudflare's preamble lags.
 */
export const ORIGIN_CONTENT_SIGNAL = 'search=yes,ai-input=yes,ai-train=no'

/**
 * Generate `robots.txt` content. Pure function — deterministic byte-for-byte
 * output for the same input. Tests assert structure and content.
 *
 * Format:
 *   1. `Sitemap:` reference at top (allowed by RFC; common convention).
 *   2. One allow block per allowed bot.
 *   3. One disallow block per disallowed bot.
 *   4. Wildcard `User-agent: *` block at the end with the documented
 *      Content-Signal triple and `Allow: /` so that unrecognised search
 *      crawlers are not blocked by default. The site is a public publication.
 *
 * The Cloudflare zone-level managed preamble (issue #09) is prepended to the
 * served `/robots.txt` and emits its own Content-Signal — see the comment on
 * `ORIGIN_CONTENT_SIGNAL` above for why we duplicate the signal here.
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
  // The Content-Signal line declares the documented policy triple
  // (search=yes,ai-input=yes,ai-train=no); see ORIGIN_CONTENT_SIGNAL above for
  // why we emit this in addition to Cloudflare's managed preamble.
  lines.push('User-agent: *')
  lines.push(`Content-Signal: ${ORIGIN_CONTENT_SIGNAL}`)
  lines.push('Allow: /')
  lines.push('')

  return lines.join('\n')
}
