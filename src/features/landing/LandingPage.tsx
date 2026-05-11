import { useEffect, useRef } from 'react'
import './LandingPage.css'
import { ArrowRight, LayoutGrid, BarChart3 } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'
import { LegalFooter } from '../legal/LegalFooter'
import type { ProductId } from '../../domain'
import type { Route } from '../../app/useRoute'
import { detectSavedMode } from '../../app/useRoute'
import { JsonLd } from '../../seo/JsonLd'
import {
  buildHomeOrganizationJsonLd,
  buildHomeWebApplicationJsonLd,
  buildHomeWebSiteJsonLd,
} from '../../seo/organization'
import {
  buildCanonicalUrl,
  publicRouteRegistry,
  resolveTopicPreselection,
} from '../../seo/publicRouteRegistry'
import { HUB_CLUSTERS } from './hubClusters'
import { RULES_YEAR } from '../../rules'

/**
 * LandingChoice — payload fired by the two CTA buttons (and by the
 * `?topic=<slug>` auto-fire on first-time landing, see below).
 *
 * `visibleProducts` (issue #13) is optional preselection metadata that the
 * caller may forward into the workspace (compare-mode) or the InventoryWizard
 * (combine-mode). It is `undefined` for plain CTA clicks; only the
 * topic-preselection auto-fire path populates it.
 */
export type LandingChoice =
  | { kind: 'combine'; visibleProducts?: readonly ProductId[] }
  | { kind: 'compare'; visibleProducts?: readonly ProductId[] }

interface Props {
  onChoice: (choice: LandingChoice) => void
  /**
   * Optional navigate handler. Threaded through to `LegalFooter` so the
   * footer's `Impressum` / `Datenschutz` links use SPA navigation when the
   * landing page is rendered inside the live app. The SSG prerender pass
   * passes a no-op — the rendered HTML still carries `<a href>` attributes,
   * so direct loads work; the SPA router takes over after hydration.
   */
  navigate?: (target: Route) => void
}

/**
 * Two-CTA landing page.
 *
 * Mein Plan (combine-mode, primary): opens the InventoryWizard which walks
 * the user through personal details and (optionally) existing contracts.
 * The wizard handles both "I have contracts" and "I'm starting fresh" via its
 * "Weiter ohne Verträge" finish button — there is no separate guided-setup
 * flow anymore.
 *
 * Produkte vergleichen (compare-mode, secondary): direct entry to the
 * compare dashboard for users who already know what they want to compare.
 *
 * Topic preselection (issue #13): on mount the page reads `?topic=<slug>`
 * from `window.location.search`. If the slug matches a registered route's
 * `preselection` AND `detectSavedMode()` returns `null` (first-time visitor,
 * no saved workspace), the matching `LandingChoice` is auto-fired. Returning
 * users are never overridden — saved state always wins (PRD US-18).
 *
 * Below the two CTAs (issue #03):
 *   - `Erkunde Themen` topic-page hub: 5 clusters, 10 descriptive German
 *     anchors. Most targets do not have pages yet (issues #04–#07).
 *   - `LegalFooter`: license posture + Impressum/Datenschutz links.
 *
 * Inline JSON-LD (issue #03): `WebSite` + `Organization` + `WebApplication`.
 * All three blocks are emitted via the typed `<JsonLd>` component into the
 * page body so the SSG prerender output already carries them. Crawlers parse
 * JSON-LD wherever it appears in the document; placing the blocks in body
 * keeps the head emission for `/` empty (the route-head pipeline returns
 * `null` for `/` so the head is not duplicated).
 */
export function LandingPage({ onChoice, navigate }: Props) {
  const route = publicRouteRegistry['/']
  const canonical = buildCanonicalUrl('/')

  // Prerender path may pass undefined for `navigate`. We pass a stable no-op
  // through to LegalFooter — the rendered HTML still emits `<a href>` so
  // direct loads work; the live app threads its real navigate from useRoute.
  const navigateOrNoop: (target: Route) => void = navigate ?? (() => {})

  // Auto-fire-once guard (issue #13): useEffect deps are stable (`onChoice` is
  // the only referenced value) but React 19 strict-mode runs effects twice in
  // dev. The ref ensures we never double-fire `onChoice` if the component
  // re-renders.
  const autoFiredRef = useRef(false)

  useEffect(() => {
    if (autoFiredRef.current) return
    if (typeof window === 'undefined') return
    // Returning users: saved state always wins. Never override on `?topic=`.
    if (detectSavedMode() !== null) return
    const preselection = resolveTopicPreselection(window.location.search)
    if (!preselection) return
    autoFiredRef.current = true
    if (preselection.mode === 'compare') {
      onChoice({ kind: 'compare', visibleProducts: preselection.visibleProducts })
    } else {
      onChoice({ kind: 'combine', visibleProducts: preselection.visibleProducts })
    }
    // We intentionally read `onChoice` as a stable callback. It is captured
    // by handleLandingChoice in App.tsx which is not memoised, but the guard
    // above ensures we only call it once regardless of how many renders occur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="landing-shell">
      <DisclaimerBanner />

      <main className="landing-main">
        <div className="landing-hero">
          <h1 className="landing-headline">Rente planen, Produkte vergleichen.</h1>
          <p className="landing-subline">
            RentenWiki.de: Altersvorsorge planen mit Steuern und Krankenkassenbeiträgen, auch für Betriebsrente und ETF.
          </p>
        </div>

        <div className="landing-cards">
          {/* Primary card: Mein Plan (combine-mode) */}
          <div className="landing-card landing-card--primary">
            <div className="landing-card-body">
              <div className="landing-card-icon landing-card-icon--primary" aria-hidden="true">
                <LayoutGrid size={32} />
              </div>
              <h2 className="landing-card-title">Mein Plan</h2>
              <p className="landing-card-desc">
                Plane deine Rente mithilfe von Vergleichen und Empfehlungen.
              </p>
              <button
                type="button"
                className="landing-btn landing-btn--primary"
                onClick={() => onChoice({ kind: 'combine' })}
              >
                Mein Plan erstellen
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Secondary card: Produkte vergleichen (compare-mode) */}
          <div className="landing-card landing-card--secondary">
            <div className="landing-card-body">
              <div className="landing-card-icon landing-card-icon--secondary" aria-hidden="true">
                <BarChart3 size={32} />
              </div>
              <h2 className="landing-card-title">Produkte vergleichen</h2>
              <p className="landing-card-desc">
                Betriebsrente, ETF und Privatrente direkt vergleichen, bei gleichem Nettoaufwand.
              </p>
              <button
                type="button"
                className="landing-btn landing-btn--outline"
                onClick={() => onChoice({ kind: 'compare' })}
              >
                Vergleich starten
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Topic-page hub — issue #03. Sectioned `Erkunde Themen` block under
            the two CTAs. Five clusters, 10 anchors. Most targets ship in
            issues #04–#07; the hub still lists them so internal links resolve
            atomically as those issues land. */}
        <nav className="landing-hub" aria-labelledby="landing-hub-heading">
          <h2 id="landing-hub-heading" className="landing-hub-heading">
            Alles im Überblick
          </h2>
          <div className="landing-hub-clusters">
            {HUB_CLUSTERS.map((cluster) => (
              <section key={cluster.heading} className="landing-hub-cluster">
                <h3 className="landing-hub-cluster-heading">{cluster.heading}</h3>
                <ul className="landing-hub-links">
                  {cluster.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} className="landing-hub-link">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>
      </main>

      {/* Visible "Stand" line for JSON-LD `dateModified` (Google structured-data
          guideline: every JSON-LD field must have a visible counterpart). */}
      <p className="landing-stand">
        Stand: {route.dateModified} · Werte für Deutschland {RULES_YEAR}
      </p>

      <LegalFooter navigate={navigateOrNoop} />

      {/* Inline JSON-LD (issue #03): WebSite + Organization + WebApplication.
          All three blocks emitted via the typed `<JsonLd>` component — the
          single React JSON-LD path (no parallel raw-string emission). */}
      <JsonLd data={buildHomeWebSiteJsonLd(canonical)} />
      <JsonLd data={buildHomeOrganizationJsonLd(canonical)} />
      <JsonLd
        data={buildHomeWebApplicationJsonLd({
          canonical,
          title: route.title,
          summary: route.summary,
          dateModified: route.dateModified,
        })}
      />
    </div>
  )
}
