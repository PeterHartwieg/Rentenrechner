import { buildRouteHead } from './routeHead'
import type { PublicRouteId } from './publicRouteRegistry'

/**
 * Serialise the head tags for a route into a raw HTML string.
 *
 * Used by the SSG prerender pipeline. The output is dropped into the static
 * `index.html` via the `<!--SSG_HEAD-->` marker. We do NOT use ReactDOMServer
 * here: the head fragment is not React (no hydration boundary), and the JSON-LD
 * inline `<script>` is easier to verify as a plain string.
 */
export function renderRouteHeadHtml(routeId: PublicRouteId): string {
  const head = buildRouteHead(routeId)
  const lines: string[] = []
  lines.push(`<title>${escapeHtml(head.title)}</title>`)
  lines.push(`<meta name="description" content="${escapeAttr(head.metaDescription)}" />`)
  lines.push(`<meta name="robots" content="${head.robots}" />`)
  lines.push(`<link rel="canonical" href="${escapeAttr(head.canonical)}" />`)

  // Open Graph
  lines.push(`<meta property="og:title" content="${escapeAttr(head.ogTitle)}" />`)
  lines.push(`<meta property="og:description" content="${escapeAttr(head.ogDescription)}" />`)
  lines.push(`<meta property="og:url" content="${escapeAttr(head.ogUrl)}" />`)
  lines.push(`<meta property="og:image" content="${escapeAttr(head.ogImage)}" />`)
  lines.push(`<meta property="og:type" content="${head.ogType}" />`)
  lines.push(`<meta property="og:site_name" content="${escapeAttr(head.ogSiteName)}" />`)
  lines.push(`<meta property="og:locale" content="de_DE" />`)

  // Twitter
  lines.push(`<meta name="twitter:card" content="${head.twitterCard}" />`)
  lines.push(`<meta name="twitter:title" content="${escapeAttr(head.twitterTitle)}" />`)
  lines.push(`<meta name="twitter:description" content="${escapeAttr(head.twitterDescription)}" />`)
  lines.push(`<meta name="twitter:image" content="${escapeAttr(head.twitterImage)}" />`)

  // JSON-LD: one block per route in head, EXCEPT for `/` which emits three
  // blocks (WebSite + Organization + WebApplication) inline in the LandingPage
  // body via the `<JsonLd>` React component (issue #03). The route-head pipeline
  // returns `null` for `/` to avoid duplication.
  if (head.jsonLd !== null) {
    const jsonLdSerialised = JSON.stringify(head.jsonLd, null, 2).replace(/<\/(?=script)/gi, '<\\/')
    lines.push(`<script type="application/ld+json">\n${jsonLdSerialised}\n</script>`)
  }

  return lines.join('\n    ')
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
