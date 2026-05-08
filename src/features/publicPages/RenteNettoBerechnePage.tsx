import { ChevronLeft } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import RenteNettoBody from './rente-netto-berechnen.body.mdx'
import './publicPages.css'

const ROUTE = publicRouteRegistry['/rente-netto-berechnen']

/**
 * Public discovery page for `/rente-netto-berechnen`.
 *
 * Covers statutory pension net calculation:
 *   - Retirement-tax pipeline (cohort Besteuerungsanteil §22 Nr. 1 Satz 3 a EStG,
 *     Versorgungsfreibetrag §19 Abs. 2 EStG).
 *   - KV/PV assumptions (KVdR §§226, 237 SGB V vs. freiwillig §240 SGB V,
 *     Pflegeversicherung §§55, 55a SGB XI).
 *   - Werbungskosten-Pauschbetrag §9a Satz 1 Nr. 3 EStG (102 EUR).
 *   - Sonderausgaben-Pauschbetrag §10c EStG (36 EUR).
 *
 * Renders the same DOM in two contexts:
 *   1. SSG prerender pass (server, no localStorage) — crawler-readable HTML.
 *   2. Hydration on the client — preserves session-only DisclaimerBanner.
 *
 * Compliance:
 *   - Renders the not-advice DisclaimerBanner.
 *   - Visible "Stand 2026-05-06" line that JSON-LD dateModified references.
 *   - Internal links to homepage, legal pages, and registered siblings.
 *   - No engine imports; no localStorage reads.
 *   - JSON-LD type: WebApplication (calculator-shaped page).
 */
export function RenteNettoBerechnePage() {
  return (
    <div className="public-shell">
      <DisclaimerBanner />

      <main className="public-main">
        <a href="/" className="public-back-link">
          <ChevronLeft size={16} aria-hidden="true" />
          Zurück zum Rechner
        </a>

        <article className="public-article">
          <h1>{ROUTE.h1}</h1>
          <p className="public-summary">{ROUTE.summary}</p>
          <p className="public-stand">Redaktion: RentenWiki.de · Stand: {ROUTE.dateModified} · Werte für Deutschland 2026</p>

          <a href={ROUTE.calculatorCta.href} className="public-cta">
            {ROUTE.calculatorCta.label}
          </a>

          <RenteNettoBody />

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
                  <a href={slug}>{sibling.h1}</a>
                </li>
              )
            })}
          </ul>
        </article>
      </main>

      <footer className="public-page-footer">
        <a href="/">RentenWiki.de</a>
        <span>·</span>
        <a href="/impressum">Impressum</a>
        <span>·</span>
        <a href="/datenschutz">Datenschutzerklärung</a>
      </footer>
    </div>
  )
}
