import { ChevronLeft } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'
import { publicRouteRegistry } from '../../seo/publicRouteRegistry'
import AltersvorsorgeBody from './altersvorsorgeprodukte-vergleichen.body.mdx'
import { useQaMode } from '../qa-feedback/useQaMode'
import { qaTargetAttrs } from '../qa-feedback/useFeedbackTarget'
import './publicPages.css'

const ROUTE = publicRouteRegistry['/altersvorsorgeprodukte-vergleichen']

/**
 * Public discovery page for `/altersvorsorgeprodukte-vergleichen`.
 *
 * Portfolio framing (`Article` JSON-LD): explains combine-mode, per-instance
 * contract arrays, transfer events, household totals, and the
 * "Wo geht mein nächster Euro hin?" recommender entry point.
 *
 * This page explicitly frames RentenWiki.de as a free model calculator with
 * NO broker/affiliate/product-recommendation posture (PRD lines 16–18,
 * acceptance criterion). The CTA routes into combine-mode via
 * `/?topic=altersvorsorgeprodukte-vergleichen` (issue #13 preselection).
 *
 * Compliance:
 *   - Renders the not-advice DisclaimerBanner.
 *   - Visible "Stand 2026-05-06" line that JSON-LD dateModified references.
 *   - Internal links to homepage, legal pages, and registered siblings.
 *   - No engine imports; no localStorage reads.
 *   - No inline simulator output (PRD line 134 — explicitly forbidden).
 *   - No winner/recommendation copy ("besser als", "lohnt sich", "empfohlen").
 */
export function AltersvorsorgeproduktePage() {
  const { enabled: qaEnabled } = useQaMode()

  return (
    <div className="public-shell">
      <DisclaimerBanner />

      <main className="public-main">
        <a href="/" className="public-back-link">
          <ChevronLeft size={16} aria-hidden="true" />
          Zurück zum Rechner
        </a>

        <article
          className="public-article"
          {...qaTargetAttrs(qaEnabled, {
            id: 'publicPage.altersvorsorgeprodukte.article',
            label: 'Artikel: Altersvorsorgeprodukte vergleichen',
            precision: 'section',
          })}
        >
          <h1>{ROUTE.h1}</h1>
          <p className="public-summary">{ROUTE.summary}</p>
          <p className="public-stand">Redaktion: RentenWiki.de · Stand: {ROUTE.dateModified} · Werte für Deutschland 2026</p>

          <a href={ROUTE.calculatorCta.href} className="public-cta">
            {ROUTE.calculatorCta.label}
          </a>

          <AltersvorsorgeBody />

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
