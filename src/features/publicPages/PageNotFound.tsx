import { ChevronLeft } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import './publicPages.css'

const ROUTE = publicRouteRegistry['/404']

/**
 * `/404` page — replaces the legacy `dist/404.html = dist/index.html` copy
 * that previously made every unknown URL look like the calculator.
 *
 * Cloudflare Pages serves `dist/404.html` for any unmatched path. The SSG
 * pipeline writes this rendered component there so the user sees a real
 * Page-Not-Found, the canonical for `/404` is set, and the page is marked
 * `noindex,follow` (registry default for this route).
 *
 * Compliance:
 *   - Renders the not-advice DisclaimerBanner (every public page must).
 *   - Provides an explicit link back to the calculator + topic-page sibling.
 *   - No engine imports, no localStorage reads.
 */
export function PageNotFound() {
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

          <h2>Stattdessen verfügbar</h2>
          <ul className="public-internal-links">
            <li>
              <a href="/">RentenWiki.de — Modellrechner Startseite</a>
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
            <li>
              <a href="/impressum">Impressum</a>
            </li>
            <li>
              <a href="/datenschutz">Datenschutzerklärung</a>
            </li>
          </ul>

          <a href={ROUTE.calculatorCta.href} className="public-cta">
            {ROUTE.calculatorCta.label}
          </a>
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
