// ---------------------------------------------------------------------------
// organization.ts — typed JSON-LD `Organization` and supporting blocks for
// `/`. Issue #03.
//
// Source of truth for the human/identifying fields is the Impressum
// (`src/features/legal/ImpressumPage.tsx`). We mirror only the fields that have
// a real SEO use case:
//
//   - `name`       → public brand "RentenWiki.de"
//   - `legalName`  → "Peter Hartwieg" (sole proprietorship; "Anbieter" line)
//   - `url`        → canonical site origin
//   - `email`      → "peter@hartwieg.com"
//   - `founder`    → Person { name, email }
//
// Why we skip `address`:
//   The Impressum publishes a postal address because §5 TMG requires it for
//   commercial telemedia services. SEO has no local-business use case here —
//   RentenWiki.de is a public online calculator, not a brick-and-mortar
//   advisory office (PRD line 154). Pulling a personal residential address
//   into machine-extractable JSON-LD widens the scraping surface unnecessarily.
//   The Impressum page itself remains the legally-required disclosure.
//
// Why we skip `address` and not `email`:
//   Email is already published on every Impressum and Datenschutz page; it is
//   the only contact channel for license inquiries (`peter@hartwieg.com` is
//   the contact for commercial-license requests per CLAUDE.md). Exposing it in
//   structured data does not widen the surface in any meaningful way.
//
// Decision pinned in issue #03 triage. If a future change wants to add
// `address` (e.g. a real business address), update this comment and the
// homepage tests in lockstep.
// ---------------------------------------------------------------------------

import type { Organization, WebApplication, WebSite, WithContext } from 'schema-dts'
import { SITE_ORIGIN, OG_DEFAULT_IMAGE_PATH } from './publicRouteRegistry'
import { SITE_NAME } from './routeHead'

/** Email used in `Organization.email` and `founder.email`. */
export const ORG_EMAIL = 'peter@hartwieg.com'

/**
 * Founder/legal-person name. Matches the Impressum "Anbieter" entry.
 * Single source of truth so the legal name and the JSON-LD legalName cannot
 * drift.
 */
export const ORG_LEGAL_NAME = 'Peter Hartwieg'

/**
 * Build the `Organization` JSON-LD object for the homepage.
 *
 * The function takes the canonical URL as a parameter (rather than reading it
 * from the registry directly) so tests can pin the input.
 */
export function buildHomeOrganizationJsonLd(canonical: string): WithContext<Organization> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    legalName: ORG_LEGAL_NAME,
    url: canonical,
    email: ORG_EMAIL,
    // Brand asset for AI/search overviews. Same placeholder we use for OG.
    logo: SITE_ORIGIN + OG_DEFAULT_IMAGE_PATH,
    founder: {
      '@type': 'Person',
      name: ORG_LEGAL_NAME,
      email: ORG_EMAIL,
    },
    // INTENTIONALLY OMITTED:
    //   - address: §5 TMG publishes it on the Impressum; no local-business
    //     SEO use case here, and machine-extractable exposure of a personal
    //     residential address widens the scraping surface unnecessarily.
    //   - sameAs: no canonical social profiles to point at yet.
  }
}

/**
 * Build the `WebSite` JSON-LD object for the homepage.
 *
 * Decisions pinned in issue #03:
 *   - No `potentialAction` / SearchAction. We do not implement a public site
 *     search; emitting the action would advertise functionality we do not
 *     have, which Google's structured-data guidelines forbid.
 *   - `inLanguage` matches the page's `<html lang>` and the WebApplication
 *     block.
 */
export function buildHomeWebSiteJsonLd(canonical: string): WithContext<WebSite> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: canonical,
    inLanguage: 'de-DE',
  }
}

/**
 * Build the `WebApplication` JSON-LD object for the homepage.
 *
 * Mirrors the `WebApplication` block previously emitted via routeHead.ts but
 * lives here so the homepage's three blocks share one author. The route-head
 * pipeline now skips JSON-LD for `/` (the LandingPage emits all three blocks
 * inline in body via the typed `<JsonLd>` component).
 *
 * Visible-content audit (Google structured-data guidelines):
 *   - `name` ↔ `<title>` rendered into the page chrome
 *   - `description` ↔ summary rendered as page lead/hero copy
 *   - `url` ↔ canonical (linked from internal navigation)
 *   - `inLanguage` ↔ `<html lang="de">`
 *   - `dateModified` ↔ rendered "Stand …" line in the LegalFooter
 *   - `offers.price` ↔ visible "kostenlos" / "free" copy in hero + cards
 */
export function buildHomeWebApplicationJsonLd(args: {
  readonly canonical: string
  readonly title: string
  readonly summary: string
  readonly dateModified: string
}): WithContext<WebApplication> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: args.title,
    description: args.summary,
    url: args.canonical,
    inLanguage: 'de-DE',
    dateModified: args.dateModified,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
    },
  }
}
