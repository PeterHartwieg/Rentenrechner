import { ChevronLeft } from 'lucide-react'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import RiesterVsAvdBody from './riester-vs-altersvorsorgedepot.body.mdx'
import './publicPages.css'
import { RULES_YEAR } from '../../rules'

const ROUTE = publicRouteRegistry['/riester-vs-altersvorsorgedepot']

/**
 * Public discovery page for `/riester-vs-altersvorsorgedepot`.
 *
 * Renders the same DOM in two contexts:
 *   1. SSG prerender pass (server, no localStorage, no router) — produces
 *      the static HTML that crawlers fetch first. Reads no engine code.
 *   2. Hydration on the client (React 19 hydrateRoot) — preserves the
 *      session-only DisclaimerBanner behavior.
 *
 * Decision pinned in issue #05: JSON-LD type is `Article` (comparison /
 * explanatory page), not `WebApplication`. The wrapper is thin — chrome +
 * structured navigation, no business logic.
 *
 * Compliance:
 *   - Renders the not-advice DisclaimerBanner (covered by tests).
 *   - Renders the visible "Stand 2026-05-06" line that JSON-LD `dateModified`
 *     references — required by Google's structured-data guidelines.
 *   - Provides explicit internal links to homepage and topic siblings.
 *   - Calculator CTA deep-links to `/?topic=riester-vs-altersvorsorgedepot`
 *     (issue #13).
 *   - No "winner" copy anywhere on the page (YMYL guardrail — comparison pages
 *     frame conditions, not declare a winner per PRD line 111).
 *   - Does not import simulation engine code (the body is pure prose).
 */
export function RiesterVsAltersvorsorgedepotPage() {
  return (
    <div className="public-shell">
      <main className="public-main">
        <a href="/" className="public-back-link">
          <ChevronLeft size={16} aria-hidden="true" />
          Zurück zum Rechner
        </a>

        <article className="public-article">
          <h1>{ROUTE.h1}</h1>
          <p className="public-summary">{ROUTE.summary}</p>
          <p className="public-stand">Redaktion: RentenWiki.de · Stand: {ROUTE.dateModified} · Werte für Deutschland {RULES_YEAR}</p>

          <a href={ROUTE.calculatorCta.href} className="public-cta">
            {ROUTE.calculatorCta.label}
          </a>

          <RiesterVsAvdBody />

          <h2>Verwandte Seiten</h2>
          <ul className="public-internal-links">
            <li>
              <a href="/?view=vergleich">RentenWiki.de — Modellrechner Startseite</a>
            </li>
            {ROUTE.relatedRoutes.map((slug) => {
              if (slug === '/') return null
              const sibling = publicRouteRegistry[slug as keyof typeof publicRouteRegistry]
              if (!sibling) return null
              return (
                <li key={slug}>
                  <a href={`${slug}/`}>{sibling.h1}</a>
                </li>
              )
            })}
          </ul>
        </article>
      </main>

      <footer className="public-page-footer">
        <a href="/">RentenWiki.de</a>
        <span>·</span>
        <a href="/impressum/">Impressum</a>
        <span>·</span>
        <a href="/datenschutz/">Datenschutzerklärung</a>
      </footer>
    </div>
  )
}
