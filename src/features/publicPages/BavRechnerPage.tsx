import { ChevronLeft } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import BavRechnerBody from './bav-rechner.body.mdx'
import './publicPages.css'

const ROUTE = publicRouteRegistry['/bav-rechner']

/**
 * Public discovery page for `/bav-rechner`.
 *
 * Renders the same DOM in two contexts:
 *   1. SSG prerender pass (server, no localStorage, no router) — produces
 *      the static HTML that crawlers fetch first. Reads no engine code.
 *   2. Hydration on the client (React 19 hydrateRoot) — preserves the
 *      session-only DisclaimerBanner behavior.
 *
 * Pattern mirrors RentenluckeRechnerPage.tsx (issue #02 tracer bullet).
 *
 * Compliance:
 *   - Renders the not-advice DisclaimerBanner (covered by tests).
 *   - Renders the visible "Stand 2026-05-06" line that JSON-LD `dateModified`
 *     references — required by Google's structured-data guidelines.
 *   - Calculator CTA uses `/?topic=bav-rechner` for issue #13 preselection.
 *   - Internal links to homepage, sibling pages, and legal pages.
 *   - Does not import simulation engine code (body is pure prose).
 */
export function BavRechnerPage() {
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

          <BavRechnerBody />

          <h2>Verwandte Seiten</h2>
          <ul className="public-internal-links">
            <li>
              <a href="/">RentenWiki.de — Modellrechner Startseite</a>
            </li>
            <li>
              <a href="/etf-vs-bav">ETF vs. bAV — Vergleich mit gleicher Nettokostenbasis</a>
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
