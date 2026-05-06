import { ChevronLeft } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import EtfVsBavBody from './etf-vs-bav.body.mdx'
import './publicPages.css'

const ROUTE = publicRouteRegistry['/etf-vs-bav']

/**
 * Public discovery page for `/etf-vs-bav`.
 *
 * Comparison (Article-shaped) page that covers ETF vs. bAV on the same
 * net-cost basis. No winner copy — frames conditions, assumptions, tradeoffs.
 *
 * Pattern mirrors RentenluckeRechnerPage.tsx (issue #02 tracer bullet).
 *
 * Compliance:
 *   - Renders the not-advice DisclaimerBanner (covered by tests).
 *   - Renders the visible "Stand 2026-05-06" line that JSON-LD `dateModified`
 *     references — required by Google's structured-data guidelines.
 *   - Calculator CTA uses `/?topic=etf-vs-bav` for issue #13 preselection.
 *   - Internal links to homepage, sibling pages, and legal pages.
 *   - Does not import simulation engine code (body is pure prose).
 *   - YMYL guardrail: no "besser als", "lohnt sich", "empfohlen" copy.
 */
export function EtfVsBavPage() {
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

          <EtfVsBavBody />

          <h2>Verwandte Seiten</h2>
          <ul className="public-internal-links">
            <li>
              <a href="/">RentenWiki.de — Modellrechner Startseite</a>
            </li>
            <li>
              <a href="/bav-rechner">bAV Rechner — Betriebliche Altersvorsorge und Entgeltumwandlung</a>
            </li>
            <li>
              <a href="/rentenluecke-rechner">Rentenlücke berechnen — Versorgungslücke 2026</a>
            </li>
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
