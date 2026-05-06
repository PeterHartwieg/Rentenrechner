// ---------------------------------------------------------------------------
// publicRouteRegistry — single source of truth for every prerendered public
// route on rentenwiki.de. Drives:
//   - vite-plugin SSG prerender pass (one HTML file per registry entry)
//   - sitemap.xml generation
//   - <head> metadata: <title>, meta description, canonical, Open Graph,
//     Twitter, JSON-LD WebApplication
//
// Mirrors the architectural pattern of `src/engine/productRegistry.ts`:
// typed entry shape; the union of legal route paths (`PublicRouteId`) is
// derived from the registry keys, not hardcoded — adding a new public route
// is a registry edit only.
//
// The in-app router (`src/app/useRoute.ts`) serves a strict subset of these
// (`/`, `/impressum`, `/datenschutz`, plus `/rentenluecke-rechner` and `/404`
// as of issue #02). Legal routes are intentionally NOT in this registry: the
// PRD's "out of scope" list (line 152) excludes them, and `Article` /
// `WebApplication` JSON-LD on Impressum/Datenschutz adds no SEO value.
// ---------------------------------------------------------------------------

/**
 * Allow / disallow values for a route's `<meta name="robots">` tag.
 *
 * `index,follow` — default for canonical public pages.
 * `noindex,follow` — used at runtime via `injectShareStateNoindex` when the
 *   user has loaded a share-URL (URL state in `?s=`); never the static value.
 */
export type RobotsPolicy = 'index,follow' | 'noindex,follow'

/**
 * Subset of schema.org @type values we currently emit. Kept intentionally
 * narrow — adding a new value here forces a JSON-LD generator update.
 */
export type JsonLdType = 'WebApplication' | 'WebSite'

export interface CalculatorCta {
  /** Visible button label (German). */
  readonly label: string
  /**
   * Destination path relative to origin. For #02 every CTA is `/`.
   * The `?topic=<slug>` preselection mechanism is deferred to issue #13.
   */
  readonly href: string
}

export interface PublicRoute {
  /**
   * Path component of the canonical URL (always begins with `/`, never carries
   * query string, never carries fragment, never trailing slash except `/`).
   */
  readonly canonical: string
  /** Page title rendered as `<title>` and used for `og:title` + `twitter:title`. */
  readonly title: string
  /** `<meta name="description">` and `og:description` content. */
  readonly metaDescription: string
  /** Visible H1 — must match the rendered page body for AI/SEO compliance. */
  readonly h1: string
  /** One-paragraph summary used for breadcrumb hints + JSON-LD `description`. */
  readonly summary: string
  /** ISO-8601 date the page was last reviewed for statutory accuracy. */
  readonly dateModified: string
  /** Static robots policy. Share-state injects `noindex,follow` at runtime. */
  readonly robots: RobotsPolicy
  /** Whether this route appears in `sitemap.xml`. The `/404` route is excluded. */
  readonly inSitemap: boolean
  /** schema.org @type for the route's JSON-LD block. */
  readonly jsonLdType: JsonLdType
  /** Sibling slugs for internal-link compliance and breadcrumb hints. */
  readonly relatedRoutes: readonly string[]
  /** Calculator deep-link CTA. Plain `/` until issue #13 lands `?topic=`. */
  readonly calculatorCta: CalculatorCta
}

// ---------------------------------------------------------------------------
// Site-wide constants
// ---------------------------------------------------------------------------

/**
 * Production origin. Used to build absolute canonical URLs (sitemap + meta tags
 * require them) and `og:url`. Must be kept in sync with the deployment target.
 */
export const SITE_ORIGIN = 'https://rentenwiki.de'

/**
 * Single shared brand-only OG placeholder. Per-route OG cards are issue #08;
 * this lone path is referenced from every route's `og:image`/`twitter:image`.
 */
export const OG_DEFAULT_IMAGE_PATH = '/og/default.png'

// ---------------------------------------------------------------------------
// Registry — keyed by canonical path. Adding a new public route is a single
// entry here plus the page wrapper component. PublicRouteId is derived from
// these keys (mirrors `ProductId = ProductManifestEntry['id']`).
// ---------------------------------------------------------------------------

export const publicRouteRegistry = {
  '/': {
    canonical: '/',
    title: 'RentenWiki.de — Altersvorsorge-Rechner Deutschland 2026',
    metaDescription:
      'Kostenloser Modellrechner für Altersvorsorge in Deutschland: ETF, bAV, private Rentenversicherung, Basisrente, AVD und Riester vergleichen. Stand 2026. Keine Anlage-, Steuer- oder Rechtsberatung.',
    h1: 'Deine Altersvorsorge im Blick',
    summary:
      'Modellrechner zur Altersvorsorge in Deutschland mit gesetzlichen Werten Stand 2026. ' +
      'Vergleicht ETF, bAV, private Rentenversicherung, Basisrente, Altersvorsorgedepot und Riester.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'WebApplication',
    relatedRoutes: ['/rentenluecke-rechner'],
    calculatorCta: {
      label: 'Rechner öffnen',
      href: '/',
    },
  },
  '/rentenluecke-rechner': {
    canonical: '/rentenluecke-rechner',
    title: 'Rentenlücke berechnen — Rechner für die Versorgungslücke 2026 | RentenWiki.de',
    metaDescription:
      'Rentenlücke (Versorgungslücke) berechnen: Differenz zwischen erwarteter gesetzlicher ' +
      'Rente und gewünschtem Nettoeinkommen im Ruhestand. Modellrechnung mit Werten Stand 2026.',
    h1: 'Rentenlücke berechnen — Versorgungslücke in Deutschland 2026',
    summary:
      'Erklärt, was die Rentenlücke (Versorgungslücke) ist, wie sie modellhaft aus erwarteter ' +
      'gesetzlicher Rente und gewünschtem Nettoeinkommen ermittelt wird, welche Eingaben der ' +
      'Rechner verwendet und welche Annahmen die Schätzung beeinflussen. Stand 2026, keine Beratung.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'WebApplication',
    relatedRoutes: ['/'],
    calculatorCta: {
      label: 'Rentenlücke jetzt berechnen',
      href: '/',
    },
  },
  '/404': {
    canonical: '/404',
    title: 'Seite nicht gefunden — RentenWiki.de',
    metaDescription:
      'Die angeforderte Seite ist auf RentenWiki.de nicht verfügbar. Zurück zum Altersvorsorge-Rechner.',
    h1: 'Seite nicht gefunden',
    summary:
      'Die angeforderte URL existiert auf RentenWiki.de nicht. Über den Link unten gelangst du zurück zum Rechner.',
    dateModified: '2026-05-06',
    robots: 'noindex,follow',
    inSitemap: false,
    jsonLdType: 'WebSite',
    relatedRoutes: ['/', '/rentenluecke-rechner'],
    calculatorCta: {
      label: 'Zurück zum Rechner',
      href: '/',
    },
  },
} as const satisfies Record<string, PublicRoute>

/**
 * Discriminated union of every legal public-route path. Derived from the
 * `publicRouteRegistry` keys so the type cannot drift from the data.
 */
export type PublicRouteId = keyof typeof publicRouteRegistry

/**
 * Ordered list of all public routes. Iteration order matches the registry's
 * source order, which is the authoring order (homepage first, topic pages, 404).
 */
export const PUBLIC_ROUTE_ENTRIES: readonly PublicRoute[] = Object.values(publicRouteRegistry)

/**
 * Ordered list of public route paths. Used by the SSG prerender pass + by
 * `sitemap.xml` (filtered by `inSitemap`).
 */
export const PUBLIC_ROUTE_IDS = Object.keys(publicRouteRegistry) as readonly PublicRouteId[]

/**
 * Look up a registry entry by canonical path. Returns undefined for unknown
 * paths so callers can render a 404 fallback.
 */
export function getPublicRoute(path: string): PublicRoute | undefined {
  return (publicRouteRegistry as Record<string, PublicRoute>)[path]
}

/**
 * Build an absolute canonical URL for a route. Used by sitemap generation,
 * `<link rel="canonical">`, and `og:url`. Ensures we never emit the share-state
 * query string (`?s=`) into canonical surfaces — the canonical for any route
 * is derived from the registry, not from `window.location.href`.
 */
export function buildCanonicalUrl(routeId: PublicRouteId): string {
  const entry = publicRouteRegistry[routeId]
  // Root path collapses to bare origin to avoid double-slash variants.
  if (entry.canonical === '/') return SITE_ORIGIN + '/'
  return SITE_ORIGIN + entry.canonical
}

/**
 * Strip share-state and tracking query parameters from a URL, returning the
 * canonical form. Used by tests + the dynamic noindex injector to confirm a
 * URL is canonical.
 *
 * Stripped keys:
 *   - `s` (share-state encoded by `urlShare.ts`)
 *   - `topic` (deferred preselection mechanism — issue #13)
 *   - `utm_*` (defensive — we never emit these but inbound traffic might)
 *
 * Hash fragments are also dropped.
 */
export function stripShareStateFromUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return input
  }
  const stripKeys: string[] = []
  for (const key of url.searchParams.keys()) {
    if (key === 's' || key === 'topic' || key.startsWith('utm_')) {
      stripKeys.push(key)
    }
  }
  for (const key of stripKeys) url.searchParams.delete(key)
  url.hash = ''
  // URLSearchParams emits "?" even when empty; collapse to no query string.
  if ([...url.searchParams.keys()].length === 0) url.search = ''
  return url.toString()
}
