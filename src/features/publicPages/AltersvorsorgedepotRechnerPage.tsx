import { ChevronLeft } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import AvdBody from './altersvorsorgedepot-rechner.body.mdx'
import './publicPages.css'

const ROUTE = publicRouteRegistry['/altersvorsorgedepot-rechner']

/**
 * Public discovery page for `/altersvorsorgedepot-rechner`.
 *
 * Renders the same DOM in two contexts:
 *   1. SSG prerender pass (server, no localStorage, no router) — produces
 *      the static HTML that crawlers fetch first. Reads no engine code.
 *   2. Hydration on the client (React 19 hydrateRoot) — preserves the
 *      session-only DisclaimerBanner behavior.
 *
 * Issue #05: AVD is the new Schicht-2 depot product introduced by the
 * Jahressteuergesetz 2024.
 *
 * Key compliance obligations for this page:
 *   - §22 Nr. 5 EStG payout taxation cited inline and in tests.
 *   - AltvVerbG certification reference (AltZertG §1-equivalent for AVD).
 *   - Jahressteuergesetz 2024 origin of the product explicitly stated.
 *   - Visible "Stand 2026-05-06" matches JSON-LD dateModified.
 *   - No engine imports; no localStorage reads.
 *   - DisclaimerBanner rendered for every visit (session-only, never permanent).
 */
export function AltersvorsorgedepotRechnerPage() {
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

          <AvdBody />

          <h2>Verwandte Seiten</h2>
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
