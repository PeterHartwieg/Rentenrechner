#!/usr/bin/env node
// ---------------------------------------------------------------------------
// apply-cloudflare-policy.mjs — issue #09 operational script.
//
// Applies the locked crawler policy to the rentenwiki.de Cloudflare zone via
// the public REST API and (optionally) verifies live bot behavior via curl.
//
// Locked policy (from issue #01 + #09):
//   - search=yes        → search/answer crawlers reach the site
//   - ai-input=yes      → AI assistants may quote/cite (HTTP-level)
//   - ai-train=no       → training crawlers (GPTBot, ClaudeBot, …) blocked
//
// What this script does:
//
//   1. apply    — PUT /zones/<zone_id>/bot_management with
//                   { ai_bots_protection: "block",
//                     crawler_protection: "enabled" }
//                 This is the API equivalent of the Cloudflare dashboard's
//                 "AI Audit / Bot Management → Block AI bots" toggle. The
//                 dashboard's "Managed robots.txt / Content Signals" feature
//                 is dashboard-only (no API endpoint as of Cloudflare's
//                 documentation); flip that manually after this script runs.
//
//   2. verify   — curl representative bot user-agents against the live
//                 domain to confirm the policy is reflected in HTTP
//                 responses.
//
//   3. status   — GET the current bot_management settings (read-only).
//
// Usage:
//   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ZONE_ID=<zone_id> \
//     node scripts/apply-cloudflare-policy.mjs <apply|verify|status>
//
// Required env (apply / status):
//   - CLOUDFLARE_API_TOKEN  Token with Zone:Bot Management Write scope.
//                           Create at: https://dash.cloudflare.com/profile/api-tokens
//                           Template: "Edit zone DNS" + add Bot Management:Edit.
//   - CLOUDFLARE_ZONE_ID    The zone ID for rentenwiki.de.
//                           Find at: dash.cloudflare.com → rentenwiki.de →
//                           Overview → API (right rail) → Zone ID.
//
// Verify-only mode runs against the public domain and needs no credentials.
//
// This script is a value-only API call — it does NOT modify the codebase,
// does NOT add frontend telemetry, and does NOT collect PII. Cloudflare
// settings are infrastructure, not user-facing analytics. Per the PRD,
// frontend analytics remain forbidden.
// ---------------------------------------------------------------------------

const POLICY_BODY = {
  ai_bots_protection: 'block',
  crawler_protection: 'enabled',
}

const ALLOWED_BOT_USER_AGENTS = [
  // Mirror src/seo/robots.ts ALLOWED_BOTS — must reach the site.
  'Googlebot/2.1 (+http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  'Mozilla/5.0 AppleWebKit/537.36 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
]

const DISALLOWED_BOT_USER_AGENTS = [
  // Mirror src/seo/robots.ts DISALLOWED_BOTS — must hit a disallow.
  'Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'CCBot/2.0 (https://commoncrawl.org/faq/)',
]

const PUBLIC_DOMAIN = 'https://rentenwiki.de'
const VERIFY_PATHS = ['/', '/rentenluecke-rechner', '/bav-rechner', '/robots.txt']

// ---------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    console.error(`error: ${name} is required (see header for token-creation steps).`)
    process.exit(2)
  }
  return value.trim()
}

function cloudflareApi(method, zoneId, path, body, token) {
  const url = `https://api.cloudflare.com/client/v4/zones/${zoneId}${path}`
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  return fetch(url, init).then(async (res) => {
    const text = await res.text()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { raw: text }
    }
    return { status: res.status, body: parsed }
  })
}

async function modeStatus() {
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID')
  console.log(`[status] GET /zones/${zoneId}/bot_management`)
  const res = await cloudflareApi('GET', zoneId, '/bot_management', undefined, token)
  if (res.status !== 200 || !res.body?.success) {
    console.error(`[status] FAILED — HTTP ${res.status}`)
    console.error(JSON.stringify(res.body, null, 2))
    process.exit(1)
  }
  console.log('[status] OK')
  console.log(JSON.stringify(res.body.result, null, 2))
}

async function modeApply() {
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const zoneId = requireEnv('CLOUDFLARE_ZONE_ID')
  console.log(`[apply] PUT /zones/${zoneId}/bot_management`)
  console.log(`[apply] body: ${JSON.stringify(POLICY_BODY)}`)
  const res = await cloudflareApi('PUT', zoneId, '/bot_management', POLICY_BODY, token)
  if (res.status !== 200 || !res.body?.success) {
    console.error(`[apply] FAILED — HTTP ${res.status}`)
    console.error(JSON.stringify(res.body, null, 2))
    if (res.status === 403) {
      console.error('[apply] hint: token may be missing Zone:Bot Management Write.')
    }
    if (res.status === 400) {
      console.error('[apply] hint: this zone may not have Bot Management enabled (paid feature on Pro/Business/Ent).')
    }
    process.exit(1)
  }
  console.log('[apply] OK — policy applied')
  console.log(JSON.stringify(res.body.result, null, 2))
  console.log('')
  console.log('[next] manually toggle "Content Signals / Managed robots.txt"')
  console.log('       in the Cloudflare dashboard:')
  console.log('       Security → Bots → "Instruct AI bot traffic with robots.txt"')
  console.log('       (no API endpoint exists for this setting as of 2026-05).')
  console.log('')
  console.log('[next] run: node scripts/apply-cloudflare-policy.mjs verify')
}

async function probe(userAgent, path) {
  const url = PUBLIC_DOMAIN + path
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': userAgent, Accept: 'text/html,*/*' },
      redirect: 'manual',
    })
    return { status: res.status, ok: res.ok || (res.status >= 300 && res.status < 400) }
  } catch (err) {
    return { status: 0, ok: false, error: err?.message ?? String(err) }
  }
}

async function modeVerify() {
  console.log(`[verify] probing ${PUBLIC_DOMAIN} with allowed and disallowed bot UAs`)
  console.log('')

  let failures = 0

  console.log('[verify] ALLOWED bots — must return 2xx/3xx on each path:')
  for (const ua of ALLOWED_BOT_USER_AGENTS) {
    const short = ua.split('/')[0].slice(0, 24)
    for (const path of VERIFY_PATHS) {
      const r = await probe(ua, path)
      const tag = r.ok ? 'PASS' : 'FAIL'
      if (!r.ok) failures++
      console.log(`  [${tag}] ${short.padEnd(26)} ${path.padEnd(28)} → HTTP ${r.status}${r.error ? ` (${r.error})` : ''}`)
    }
  }
  console.log('')

  console.log('[verify] DISALLOWED bots — robots.txt must list Disallow: /')
  console.log('         (Cloudflare bot_management.ai_bots_protection=block layers on top)')
  // Verify robots.txt returns the expected disallow lines for each disallowed bot.
  // We don't expect HTTP-level blocking on / itself unless Cloudflare bot_management
  // is also blocking. We DO expect disallow entries in robots.txt.
  const robotsRes = await fetch(`${PUBLIC_DOMAIN}/robots.txt`, {
    headers: { 'User-Agent': 'curl/8.0', Accept: 'text/plain' },
  })
  const robotsText = robotsRes.ok ? await robotsRes.text() : ''
  for (const ua of DISALLOWED_BOT_USER_AGENTS) {
    const botName = ua.split('/')[0].split(';').pop().trim() // best-effort name extract
    const expectedDisallow = ['GPTBot', 'ClaudeBot', 'CCBot'].find((n) => ua.includes(n))
    if (!expectedDisallow) continue
    const pattern = new RegExp(`User-agent:\\s*${expectedDisallow}\\s*\\nDisallow:\\s*/`, 'i')
    const present = pattern.test(robotsText)
    const tag = present ? 'PASS' : 'FAIL'
    if (!present) failures++
    console.log(`  [${tag}] robots.txt has Disallow: / for ${expectedDisallow}`)
  }

  console.log('')
  if (failures > 0) {
    console.error(`[verify] FAILED — ${failures} check(s) did not pass.`)
    process.exit(1)
  }
  console.log('[verify] OK — crawler policy reflected in live responses.')
}

// ---------------------------------------------------------------------------

const mode = (process.argv[2] || '').toLowerCase()
const validModes = ['apply', 'verify', 'status']
if (!validModes.includes(mode)) {
  console.error('usage: node scripts/apply-cloudflare-policy.mjs <apply|verify|status>')
  console.error('')
  console.error('  apply   — PUT bot_management settings (requires API token + zone ID)')
  console.error('  status  — GET current bot_management settings (requires API token + zone ID)')
  console.error('  verify  — curl live domain with bot UAs (no credentials needed)')
  process.exit(2)
}

const handlers = { apply: modeApply, status: modeStatus, verify: modeVerify }
handlers[mode]().catch((err) => {
  console.error(`[error] ${err?.stack ?? err?.message ?? err}`)
  process.exit(1)
})
