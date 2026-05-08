import { ChevronLeft } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import BasisrenteBody from './basisrente-rechner.body.mdx'
import './publicPages.css'

const ROUTE = publicRouteRegistry['/basisrente-rechner']

/**
 * Public discovery page for `/basisrente-rechner`.
 *
 * Renders the same DOM in two contexts:
 *   1. SSG prerender pass (server, no localStorage, no router) — produces
 *      the static HTML that crawlers fetch first. Reads no engine code.
 *   2. Hydration on the client (React 19 hydrateRoot) — preserves the
 *      session-only DisclaimerBanner behavior.
 *
 * Issue #06: Basisrente + private RV topic cluster.
 *
 * Key compliance obligations for this page:
 *   - YMYL: every substantive tax claim cites §10 Abs. 3 EStG (Sonderausgaben),
 *     §22 Nr. 1 Satz 3 a EStG (Besteuerungsanteil kohort), AltZertG (Auszahlungsverbot).
 *   - The no-Kapitalauszahlung legal constraint is visibly explicit in the body
 *     (MDX section "Auszahlungsbeschränkung: Kapitalauszahlung verboten").
 *   - Visible "Stand 2026-05-06" matches JSON-LD dateModified.
 *   - No engine imports; no localStorage reads.
 *   - DisclaimerBanner rendered for every visit (session-only, never permanent).
 */
export function BasisrenteRechnerPage() {
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

          <BasisrenteBody />

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
