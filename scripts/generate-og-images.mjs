#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Open Graph card generator (issue #08).
//
// For every in-sitemap, non-/404 route in `publicRouteRegistry`, this script
// generates a deterministic 1200×630 PNG card and writes it to
// `public/og/<slug>.png`. The homepage canonical `/` writes to
// `public/og/home.png`.
//
// The head-metadata emitter (`src/seo/routeHead.ts`) computes the per-route
// image path from the same convention (`routeOgImagePath`), so adding a new
// public route in the registry automatically:
//
//   1. Triggers a new card generation here (script picks it up from the
//      registry via Vite SSR module loader, mirroring `scripts/prerender.mjs`).
//   2. Emits the matching `og:image` / `twitter:image` meta from the head
//      pipeline at build time.
//
// Determinism guarantees:
//   - SVG is generated from registry strings (`title` and `h1`) only — no
//     timestamps, no random IDs.
//   - System / generic font stack — no external font files. resvg falls back
//     to the platform's default sans-serif which is identical across CI runs
//     for a fixed resvg version. Different OS family fonts could shift glyph
//     metrics; CI image diff (`git diff --stat public/og/`) catches drift.
//   - resvg defaults are pinned by the package version.
//
// Why a separate script (not folded into prerender.mjs):
//   - Runs as `prebuild` so cards exist before vite copies `public/` into
//     `dist/`. Folding into prerender would emit cards AFTER the asset copy,
//     leaving the build with stale images on the first run.
//   - Card generation has different cadence: rarely changes, while prerender
//     runs on every code change. Keeping it separate avoids paying the resvg
//     cost on every dev-build cycle.
// ---------------------------------------------------------------------------

import { createServer } from 'vite'
import { Resvg } from '@resvg/resvg-js'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const ogOutDir = join(projectRoot, 'public', 'og')

// 1200×630 is the Open Graph / Twitter `summary_large_image` recommended size.
const CARD_WIDTH = 1200
const CARD_HEIGHT = 630

// Brand palette. Kept inline so the script has zero source-tree imports
// beyond the registry — the registry is the only single source of truth.
const COLOR_BG = '#0F172A' // slate-900
const COLOR_ACCENT = '#38BDF8' // sky-400
const COLOR_TEXT = '#F8FAFC' // slate-50
const COLOR_MUTED = '#94A3B8' // slate-400

// Layout constants (px in 1200×630 viewBox).
const PADDING = 64
const WORDMARK_Y = PADDING + 24
const TITLE_MAX_LINES = 4
const TITLE_LINE_HEIGHT = 68
const TITLE_FONT_SIZE = 56
// Approx character width for the chosen font size on a generic sans stack.
// We use this only to break long titles into lines that fit the card —
// resvg measures text glyphs from the platform font, but we don't have access
// to those metrics, so this approximation is safe given the 4-line max.
const TITLE_CHAR_WIDTH = 28
const TITLE_MAX_CHARS_PER_LINE = Math.floor((CARD_WIDTH - PADDING * 2) / TITLE_CHAR_WIDTH)

/**
 * Soft-wrap a title onto up to TITLE_MAX_LINES, truncating with an ellipsis if
 * the title is longer than what fits. The wrap is greedy by word; a single word
 * longer than the line cap is hard-broken. This is good enough for the page
 * titles in the registry — none exceed two lines today.
 */
function wrapTitle(input) {
  const words = input.split(/\s+/)
  const lines = []
  let current = ''
  for (const word of words) {
    if (current.length === 0) {
      current = word
      continue
    }
    if (current.length + 1 + word.length <= TITLE_MAX_CHARS_PER_LINE) {
      current = current + ' ' + word
    } else {
      lines.push(current)
      current = word
      if (lines.length === TITLE_MAX_LINES) break
    }
  }
  if (current.length > 0 && lines.length < TITLE_MAX_LINES) {
    lines.push(current)
  }
  if (lines.length === TITLE_MAX_LINES && words.join(' ').length > lines.join(' ').length) {
    // Truncate last line with ellipsis to signal more text.
    const last = lines[TITLE_MAX_LINES - 1]
    if (last.length > 3) {
      lines[TITLE_MAX_LINES - 1] = last.slice(0, last.length - 1) + '…'
    }
  }
  return lines
}

/** Escape XML-special characters in user-provided strings. */
function escapeXml(input) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Strip the brand suffix (" | RentenWiki.de" or em-dash variants) from the
 * registry title so the card body shows the page-specific topic. The brand
 * is rendered separately as the wordmark.
 */
function stripBrandSuffix(title) {
  return title.replace(/\s*\|\s*RentenWiki\.de\s*$/, '').trim()
}

/** Build the SVG string for a route's OG card. */
function buildSvg(route) {
  // Card body: prefer the H1 over the title because H1 is the topic-focused
  // copy users actually land on. For the homepage where H1 is "Deine
  // Altersvorsorge im Blick", the title-stripped variant carries more SEO
  // signal — but H1 is closer to the visible page, which Google's
  // structured-data guidelines prefer. Use H1 across the board.
  const headline = route.h1
  const lines = wrapTitle(headline)
  const totalHeight = lines.length * TITLE_LINE_HEIGHT
  // Vertically center the title block in the card body, between the wordmark
  // (top) and the "Stand 2026" footer.
  const startY = (CARD_HEIGHT - totalHeight) / 2 + TITLE_FONT_SIZE * 0.7
  const titleSpans = lines
    .map((line, i) => {
      const y = startY + i * TITLE_LINE_HEIGHT
      return `<text x="${PADDING}" y="${y}" font-size="${TITLE_FONT_SIZE}" fill="${COLOR_TEXT}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="700">${escapeXml(line)}</text>`
    })
    .join('\n  ')

  const wordmark = `<text x="${PADDING}" y="${WORDMARK_Y}" font-size="32" fill="${COLOR_ACCENT}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="700">RentenWiki.de</text>`
  const stand = `<text x="${CARD_WIDTH - PADDING}" y="${CARD_HEIGHT - PADDING}" font-size="24" fill="${COLOR_MUTED}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="500" text-anchor="end">Stand 2026</text>`
  const accentBar = `<rect x="${PADDING}" y="${WORDMARK_Y + 16}" width="80" height="4" fill="${COLOR_ACCENT}" />`

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR_BG}" />
  ${wordmark}
  ${accentBar}
  ${titleSpans}
  ${stand}
</svg>`
}

/**
 * Compute the slug from the canonical path. Mirrors `routeOgImagePath` in
 * `src/seo/routeHead.ts` — keep both in sync.
 */
function slugForRoute(canonical) {
  return canonical === '/' ? 'home' : canonical.slice(1)
}

async function loadRegistry() {
  const server = await createServer({
    root: projectRoot,
    server: {
      middlewareMode: true,
      hmr: false,
      // Disable file watching: the script writes PNGs into `public/og/` which
      // sits inside the project root. With watching enabled, vite's chokidar
      // emits add/unlink events after server.close() resolves, producing
      // confusing "server closed" stack traces in build logs.
      watch: null,
    },
    appType: 'custom',
    logLevel: 'warn',
    ssr: { external: ['react', 'react-dom', 'react-dom/server'] },
  })
  try {
    const seoMod = await server.ssrLoadModule('/src/seo/publicRouteRegistry.ts')
    return { server, seoMod }
  } catch (err) {
    await server.close()
    throw err
  }
}

async function main() {
  const { server, seoMod } = await loadRegistry()
  try {
    const { PUBLIC_ROUTE_IDS, publicRouteRegistry } = seoMod

    await mkdir(ogOutDir, { recursive: true })

    let count = 0
    for (const routeId of PUBLIC_ROUTE_IDS) {
      const entry = publicRouteRegistry[routeId]
      // /404 reuses OG_DEFAULT_IMAGE_PATH (the brand-only placeholder); skip.
      if (!entry.inSitemap || entry.canonical === '/404') {
        continue
      }
      const svg = buildSvg(entry)
      // Pin resvg options for determinism.
      const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: CARD_WIDTH },
        background: COLOR_BG,
        font: {
          // Allow system fonts (no external loading) and fall back deterministically.
          loadSystemFonts: true,
          defaultFontFamily: 'Arial',
        },
      })
      const png = resvg.render().asPng()
      const slug = slugForRoute(entry.canonical)
      const outPath = join(ogOutDir, `${slug}.png`)
      // Some canonical paths contain a slash (e.g. `/vergleich/details`) so
      // `slugForRoute` returns `vergleich/details`. The resulting outPath
      // lives in a subdirectory of `og/`; ensure that directory exists before
      // writing or `writeFile` throws ENOENT on Windows + POSIX alike.
      await mkdir(dirname(outPath), { recursive: true })
      await writeFile(outPath, png)
      count += 1
      console.log(`[og] ${routeId.padEnd(40)} -> public/og/${slug}.png (${png.byteLength} bytes)`)
    }

    console.log(`[og] generated ${count} OG card(s) in public/og/`)
  } finally {
    await server.close()
  }
}

main().catch((err) => {
  console.error('[og] failed:', err)
  process.exit(1)
})
