// ---------------------------------------------------------------------------
// publicRouteRegistry — single source of truth for every prerendered public
// route on rentenwiki.de. Drives:
//   - vite-plugin SSG prerender pass (one HTML file per registry entry)
//   - sitemap.xml generation
//   - <head> metadata: <title>, meta description, canonical, Open Graph,
//     Twitter, JSON-LD WebApplication
//   - `?topic=<slug>` preselection deep-links (issue #13): each entry may
//     declare an optional `preselection` so SEO topic pages can hand the
//     calculator a starting compare/combine view + visibleProducts seed.
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

import type { ProductId } from '../engine/productRegistry'

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
 *
 * `Article` is used for comparison/explanatory pages (e.g.
 * `/riester-vs-altersvorsorgedepot`) per the locked decision in issue #05.
 */
export type JsonLdType = 'WebApplication' | 'WebSite' | 'Article'

export interface CalculatorCta {
  /** Visible button label (German). */
  readonly label: string
  /**
   * Destination path relative to origin. Topic pages may use the
   * `?topic=<slug>` deep-link form (issue #13) so `LandingPage` can preselect
   * the calculator's mode + visibleProducts on first-time landing.
   */
  readonly href: string
}

/**
 * Topic-page preselection seeds (issue #13).
 *
 * Each topic page may declare which calculator view to land on (`compare` or
 * `combine`) and, for compare-mode, the initial product comparison. The
 * resolver in `resolveTopicPreselection` reads `?topic=<slug>` from the URL
 * and, when the slug matches a registered route AND the user has no saved
 * state (`detectSavedMode()` returns null), `LandingPage` auto-fires the
 * matching `LandingChoice`.
 *
 * For combine-mode entries, `visibleProducts` is forwarded to
 * `InventoryWizard.initialEnabledProducts` so the wizard's product checklist
 * lands with the relevant rows pre-checked. GRV is universally checked and
 * cannot be unchecked, so it is implicit and does not need to appear in the
 * list — only non-GRV products are honoured by the wizard.
 *
 * Returning users are never overridden — saved state always wins (PRD US-18).
 */
export interface TopicPreselection {
  /** Which view the user lands on. */
  readonly mode: 'compare' | 'combine'
  /**
   * Optional product seed. In compare-mode this becomes the workspace's
   * `visibleProducts` selection. In combine-mode it is forwarded to the
   * InventoryWizard's `initialEnabledProducts` checklist.
   */
  readonly visibleProducts?: readonly ProductId[]
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
  /**
   * Calculator deep-link CTA. Topic pages may use `/?topic=<slug>` for
   * the issue #13 preselection mechanism; the homepage and 404 keep `/`.
   */
  readonly calculatorCta: CalculatorCta
  /**
   * Optional topic-preselection seeds (issue #13). When set on a topic page,
   * arriving via `/?topic=<this-route's-slug>` preselects the calculator
   * mode + visibleProducts for first-time visitors. Returning users (saved
   * state present) are not overridden.
   */
  readonly preselection?: TopicPreselection
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
      'Kostenloser Modellrechner für die Altersvorsorge in Deutschland: ETF, bAV, ' +
      'private Rentenversicherung, Basisrente, AVD und Riester gemeinsam vergleichen. ' +
      'Stand 2026. Keine Anlage-, Steuer- oder Rechtsberatung.',
    h1: 'Deine Altersvorsorge im Blick',
    summary:
      'RentenWiki.de ist ein kostenloser, quelloffener Modellrechner zur Altersvorsorge in ' +
      'Deutschland mit gesetzlichen Werten Stand 2026. Er vergleicht ETF, bAV, private ' +
      'Rentenversicherung, Basisrente, Altersvorsorgedepot und Riester unter denselben Annahmen ' +
      'und ermittelt Rentenlücke, Steuer- und Sozialversicherungsbelastung sowie ' +
      'erwartete Auszahlungen.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'WebApplication',
    // Issue #03: the homepage now hubs into all topic-page slugs from the
    // locked PRD page set. Most are not yet built (#04–#07 ship later); listing
    // them here keeps the registry as the single source of truth for the
    // homepage's outbound relations.
    relatedRoutes: [
      '/rentenluecke-rechner',
      '/rente-netto-berechnen',
      '/bav-rechner',
      '/etf-vs-bav',
      '/riester-rechner',
      '/altersvorsorgedepot-rechner',
      '/riester-vs-altersvorsorgedepot',
      '/basisrente-rechner',
      '/private-rentenversicherung-rechner',
      '/altersvorsorgeprodukte-vergleichen',
    ],
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
      href: '/?topic=rentenluecke-rechner',
    },
    // Topic-preselection: arrive at the calculator with ETF preselected as the
    // sole comparison product. GRV is always shown alongside the comparison
    // (it's universal and not a `ProductId` in the engine registry), so we do
    // not list it here — the existing always-on GRV display handles the
    // "Rentenlücke (GRV vs ETF)" framing the topic page promises.
    preselection: {
      mode: 'compare',
      visibleProducts: ['etf'],
    },
  },
  // ---------------------------------------------------------------------------
  // Issue #05 — Subsidized pension paths cluster (Riester + AVD)
  // ---------------------------------------------------------------------------
  '/riester-rechner': {
    canonical: '/riester-rechner',
    title: 'Riester-Rechner 2026 — Zulagen, Sonderausgabenabzug und Auszahlung | RentenWiki.de',
    metaDescription:
      'Riester-Rente berechnen: Grundzulage, Kinderzulage, Sonderausgabenabzug § 10a EStG, ' +
      'Günstigerprüfung und Auszahlungsbesteuerung § 22 Nr. 5 EStG. Modellrechnung Stand 2026.',
    h1: 'Riester-Rechner 2026 — Zulagen, Steuerförderung und Auszahlung berechnen',
    summary:
      'Erklärt die staatliche Förderung der Riester-Rente: Grundzulage (175 €/Jahr), Kinderzulage ' +
      '(300 €/Kind/Jahr für Kinder ab 2008), Sonderausgabenabzug nach § 10a EStG, Günstigerprüfung ' +
      'sowie die nachgelagerte Besteuerung der Auszahlung nach § 22 Nr. 5 EStG. Mit Beispielrechnung ' +
      'und Rechner-Einstieg. Stand 2026, keine Beratung.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'WebApplication',
    relatedRoutes: [
      '/',
      '/rentenluecke-rechner',
      '/altersvorsorgedepot-rechner',
      '/riester-vs-altersvorsorgedepot',
    ],
    calculatorCta: {
      label: 'Riester-Rente jetzt berechnen',
      href: '/?topic=riester-rechner',
    },
    preselection: {
      mode: 'compare',
      visibleProducts: ['etf', 'riester'],
    },
  },
  '/altersvorsorgedepot-rechner': {
    canonical: '/altersvorsorgedepot-rechner',
    title: 'Altersvorsorgedepot-Rechner 2026 — Neues Schicht-2-Produkt vergleichen | RentenWiki.de',
    metaDescription:
      'Altersvorsorgedepot (AVD) berechnen: Depot ohne Versicherungsmantel, Förderung § 10a EStG, ' +
      'Auszahlungsbesteuerung § 22 Nr. 5 EStG (Jahressteuergesetz 2024). Stand 2026.',
    h1: 'Altersvorsorgedepot-Rechner 2026 — Neues Schicht-2-Produkt vergleichen',
    summary:
      'Erklärt das Altersvorsorgedepot (AVD) als neues, durch das Jahressteuergesetz 2024 eingeführtes ' +
      'Schicht-2-Altersvorsorgeprodukt: depot-basierte Anlage ohne Versicherungsmantel, staatliche ' +
      'Förderung nach § 10a EStG und § 84 EStG (Grundzulage), nachgelagerte Besteuerung nach ' +
      '§ 22 Nr. 5 EStG, zertifiziert nach AltvVerbG. Mit Beispielrechnung und Rechner-Einstieg. ' +
      'Stand 2026, keine Beratung.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'WebApplication',
    relatedRoutes: [
      '/',
      '/rentenluecke-rechner',
      '/riester-rechner',
      '/riester-vs-altersvorsorgedepot',
    ],
    calculatorCta: {
      label: 'Altersvorsorgedepot jetzt berechnen',
      href: '/?topic=altersvorsorgedepot-rechner',
    },
    preselection: {
      mode: 'compare',
      visibleProducts: ['etf', 'altersvorsorgedepot'],
    },
  },
  '/riester-vs-altersvorsorgedepot': {
    canonical: '/riester-vs-altersvorsorgedepot',
    title: 'Riester oder Altersvorsorgedepot? Vergleich 2026 | RentenWiki.de',
    metaDescription:
      'Riester vs. AVD im Vergleich: Förderstruktur, Zulagen, Sonderausgabenabzug, ' +
      'Übertragungsmöglichkeiten und Auszahlungsbesteuerung nach § 22 Nr. 5 EStG. Stand 2026.',
    h1: 'Riester oder Altersvorsorgedepot? Vergleich der geförderten Schicht-2-Wege 2026',
    summary:
      'Vergleicht Riester-Rente und Altersvorsorgedepot (AVD) anhand Förderstruktur (Grundzulage, ' +
      'Kinderzulage, Sonderausgabenabzug § 10a EStG), Produktform (Versicherung/Fondssparplan vs. ' +
      'reines Wertpapierdepot), Übertragungsmöglichkeiten von Riester auf AVD sowie Auszahlungs' +
      'besteuerung nach § 22 Nr. 5 EStG. Keine Empfehlung — framt Bedingungen und Annahmen. ' +
      'Stand 2026.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'Article',
    relatedRoutes: [
      '/',
      '/rentenluecke-rechner',
      '/riester-rechner',
      '/altersvorsorgedepot-rechner',
    ],
    calculatorCta: {
      label: 'Riester vs. AVD selbst berechnen',
      href: '/?topic=riester-vs-altersvorsorgedepot',
    },
    preselection: {
      mode: 'compare',
      visibleProducts: ['riester', 'altersvorsorgedepot'],
    },
  },
  // ---------------------------------------------------------------------------
  // Future topic pages (#04/#07) — registered by their owning agents.
  // The preselection seeds below are reference defaults.
  //
  //   '/bav-rechner':                       { mode: 'compare', visibleProducts: ['etf', 'bav'] },
  //   '/etf-vs-bav':                        { mode: 'compare', visibleProducts: ['etf', 'bav'] },
  //   '/rente-netto-berechnen':             { mode: 'compare', visibleProducts: [] },  // GRV-only landing
  //   '/altersvorsorgeprodukte-vergleichen':{ mode: 'combine' },  // omit visibleProducts: user adds via wizard
  // ---------------------------------------------------------------------------
  // Issue #06: Basisrente + private RV topic cluster
  '/basisrente-rechner': {
    canonical: '/basisrente-rechner',
    title: 'Basisrente Rechner 2026 — Rürup: Steuervorteil & Rentenhöhe berechnen | RentenWiki.de',
    metaDescription:
      'Basisrente (Rürup) berechnen: Sonderausgabenabzug § 10 Abs. 3 EStG, ' +
      'Besteuerungsanteil und Auszahlungsformen (nur Leibrente / Zeitrente — ' +
      'keine Kapitalauszahlung). Modellrechnung Stand 2026.',
    h1: 'Basisrente Rechner 2026 — Rürup: Steuervorteil & Auszahlungsbeschränkungen',
    summary:
      'Erklärt die Basisrente (Rürup): Sonderausgabenabzug nach §​10 Abs. 3 EStG (bis zu ' +
      '100 % des Höchstbetrags abzugsfähig), nachgelagerte Besteuerung nach ' +
      '§​22 Nr. 1 Satz 3 a EStG mit Besteuerungsanteil je nach ' +
      'Renteneintrittskohorte sowie die gesetzlich verankerte Auszahlungsbeschränkung: ' +
      'Kapitalauszahlung ist verboten — nur Leibrente oder Zeitrente möglich. Stand 2026.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'WebApplication',
    relatedRoutes: [
      '/',
      '/rentenluecke-rechner',
      '/private-rentenversicherung-rechner',
    ],
    calculatorCta: {
      label: 'Basisrente jetzt berechnen',
      href: '/?topic=basisrente-rechner',
    },
    preselection: {
      mode: 'compare',
      visibleProducts: ['etf', 'basisrente'],
    },
  },
  '/private-rentenversicherung-rechner': {
    canonical: '/private-rentenversicherung-rechner',
    title: 'Private Rentenversicherung Rechner 2026 — Kosten, Steuer & Auszahlung | RentenWiki.de',
    metaDescription:
      'Private Rentenversicherung berechnen: Versicherungsmantel-Kosten, ' +
      'Steuerregime nach Vertragsbeginn (vor 2005 / Halbeinkünfte / Abgeltungsteuer), ' +
      'Leibrente vs. Kapitalverzehr. Modellrechnung Stand 2026.',
    h1: 'Private Rentenversicherung Rechner 2026 — Kosten, Steuerregime & Auszahlung',
    summary:
      'Zeigt, wie eine private Rentenversicherung modellhaft berechnet wird: ' +
      'zweiteilige Kostenstruktur aus Versicherungsmantel-Gebühr und Fondskosten (TER), ' +
      'automatische Ableitung des Steuerregimes aus dem Vertragsbeginn ' +
      '(vor 2005, Halbeinkünfte §​20 Abs. 1 Nr. 6 EStG, Abgeltungsteuer) ' +
      'sowie Unterschied zwischen Leibrente (Ertragsanteil §​22 Nr. 1 Satz 3 a EStG) ' +
      'und Kapitalverzehr. Stand 2026. Keine Anlage-, Steuer- oder Rechtsberatung.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'WebApplication',
    relatedRoutes: [
      '/',
      '/rentenluecke-rechner',
      '/basisrente-rechner',
    ],
    calculatorCta: {
      label: 'Private Rentenversicherung jetzt berechnen',
      href: '/?topic=private-rentenversicherung-rechner',
    },
    preselection: {
      mode: 'compare',
      visibleProducts: ['etf', 'versicherung'],
    },
  },
  // ---------------------------------------------------------------------------
  // Issue #07 — Portfolio planner + Rente netto cluster
  // ---------------------------------------------------------------------------
  '/rente-netto-berechnen': {
    canonical: '/rente-netto-berechnen',
    title: 'Rente netto berechnen — gesetzliche Rente nach Steuer und KV/PV 2026 | RentenWiki.de',
    metaDescription:
      'Gesetzliche Rente netto berechnen: Besteuerungsanteil §22 EStG (Kohorten), ' +
      'KVdR vs. freiwillige GKV §240 SGB V, Pflegeversicherung §55 SGB XI, ' +
      'Werbungskosten- und Sonderausgaben-Pauschbetrag. Modellrechnung Stand 2026.',
    h1: 'Rente netto berechnen — gesetzliche Rente nach Steuer und KV/PV 2026',
    summary:
      'Erklärt, wie die gesetzliche Rente in der Auszahlphase besteuert wird (kohortenbezogener ' +
      'Besteuerungsanteil nach §22 Nr. 1 Satz 3 a EStG, Versorgungsfreibetrag §19 Abs. 2 EStG), ' +
      'wie KV- und PV-Beiträge berechnet werden (KVdR §226 SGB V vs. freiwillig §240 SGB V, ' +
      'Pflegeversicherung §55 SGB XI) und welche Pauschbeträge abgezogen werden. ' +
      'Modellrechner RentenWiki.de, Stand 2026, keine Steuer- oder Rechtsberatung.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'WebApplication',
    relatedRoutes: [
      '/',
      '/rentenluecke-rechner',
      '/altersvorsorgeprodukte-vergleichen',
    ],
    calculatorCta: {
      label: 'Rente netto jetzt berechnen',
      href: '/?topic=rente-netto-berechnen',
    },
    // Natural seed: ETF supplement alongside the implicit GRV baseline.
    // This is the most common "Rentenlücke schließen" framing:
    // statutory pension net (always shown) + ETF savings as supplement.
    preselection: {
      mode: 'compare',
      visibleProducts: ['etf'],
    },
  },
  '/altersvorsorgeprodukte-vergleichen': {
    canonical: '/altersvorsorgeprodukte-vergleichen',
    title: 'Altersvorsorgeprodukte vergleichen — ETF, bAV, Riester, Basisrente & Co. 2026 | RentenWiki.de',
    metaDescription:
      'ETF, bAV, private Rentenversicherung, Basisrente, AVD und Riester gemeinsam planen: ' +
      'kostenloser Portfolio-Modellrechner. "Nächster Euro"-Assistent. ' +
      'Kein Broker, keine Empfehlung. Stand 2026.',
    h1: 'Altersvorsorgeprodukte vergleichen — ETF, bAV, Riester und mehr gemeinsam planen 2026',
    summary:
      'RentenWiki.de ist ein kostenloser, quelloffener Modellrechner ohne Broker- oder ' +
      'Provisionsbindung. Im Portfolio-Modus lassen sich mehrere Verträge (ETF, bAV, private ' +
      'Rentenversicherung, Basisrente/Rürup, Altersvorsorgedepot, Riester) gleichzeitig erfassen, ' +
      'mit Transfer-Ereignissen (beitragsfrei, Rückkauf, Übertragung) kombinieren und als ' +
      'Haushaltsperspektive auswerten. Der "Wo geht mein nächster Euro hin?"-Assistent nutzt ' +
      'Deckungsbeitragspotenzialmessung und Monte-Carlo-P10-Risikoabschätzung — keine Empfehlung. ' +
      'Stand 2026, keine Steuer-, Rechts- oder Anlageberatung.',
    dateModified: '2026-05-06',
    robots: 'index,follow',
    inSitemap: true,
    jsonLdType: 'Article',
    relatedRoutes: [
      '/',
      '/rentenluecke-rechner',
      '/rente-netto-berechnen',
    ],
    calculatorCta: {
      label: 'Portfolio-Modus öffnen',
      href: '/?topic=altersvorsorgeprodukte-vergleichen',
    },
    // Combine-mode: user adds their own contracts via the InventoryWizard.
    // No visibleProducts seed — the wizard's product checklist starts empty
    // so users self-select which products they actually have.
    preselection: {
      mode: 'combine',
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
 *   - `topic` (preselection mechanism — issue #13; runtime hint, not canonical)
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

// ---------------------------------------------------------------------------
// Topic preselection resolver (issue #13)
// ---------------------------------------------------------------------------

/**
 * Resolve a `?topic=<slug>` query string to a `TopicPreselection` seed.
 *
 * Returns `null` for any of:
 *   - missing `?topic=` parameter
 *   - unknown slug (no matching registry entry)
 *   - matching slug but the entry has no `preselection` declared
 *   - malformed query string (defensive)
 *
 * Pure function over `URLSearchParams` and the registry — no DOM, no
 * localStorage. Callers (e.g. `LandingPage`) are responsible for combining
 * this with `detectSavedMode()` so returning users are never overridden.
 *
 * Slug semantics: a topic slug is the canonical path WITHOUT the leading
 * slash. E.g. `?topic=rentenluecke-rechner` matches `/rentenluecke-rechner`.
 *
 * @param searchString  Raw `window.location.search` (with or without leading `?`).
 */
export function resolveTopicPreselection(searchString: string): TopicPreselection | null {
  if (!searchString) return null
  let params: URLSearchParams
  try {
    // URLSearchParams accepts both "?foo=1" and "foo=1"; the former is
    // produced by `window.location.search` so we normalise here.
    const normalised = searchString.startsWith('?') ? searchString.slice(1) : searchString
    params = new URLSearchParams(normalised)
  } catch {
    return null
  }
  const slug = params.get('topic')
  if (!slug) return null
  // Reject empty / whitespace-only slugs.
  if (slug.trim() === '') return null
  // Look up the registry entry by canonical path (`/<slug>`).
  const canonicalPath = '/' + slug
  const entry = (publicRouteRegistry as Record<string, PublicRoute>)[canonicalPath]
  if (!entry) return null
  if (!entry.preselection) return null
  return entry.preselection
}
