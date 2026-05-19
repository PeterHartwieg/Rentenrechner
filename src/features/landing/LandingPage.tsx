import { useEffect, useRef } from 'react'
import './LandingPage.css'
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
import {
  HUB_CLUSTERS,
  countHubArticles,
  resolveFeaturedArticles,
} from './hubClusters'
import { RULES_YEAR } from '../../rules'

/**
 * LandingChoice — payload fired by the two CTA buttons (and by the
 * `?topic=<slug>` auto-fire on first-time landing).
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

const PROCESS_STEPS: ReadonlyArray<{ n: string; h: string; p: string }> = [
  {
    n: 'I.',
    h: 'Du beschreibst deine Lage.',
    p: 'Geburtsjahr, Brutto, Familienstand, bestehende Verträge. Bleibt lokal in deinem Browser — nichts wird an einen Server gesendet.',
  },
  {
    n: 'II.',
    h: 'Wir rechnen offen.',
    p: 'Gesetzliche Rente, ETF-Sparpläne, Betriebs- und Privatrenten. Jede Annahme ist erklärt und kann geändert werden.',
  },
  {
    n: 'III.',
    h: 'Du entscheidest selbst.',
    p: 'Wir nennen kein „bestes“ Produkt. Wir zeigen, was die Optionen kosten und was sie bringen.',
  },
]

/**
 * Two-CTA landing page in editorial mode (PR 2).
 *
 * Layout — left column owns the editorial hero (kicker + serif H1 with the
 * italic oxblood "wirklich" accent + subline + two CTAs + 3-step row); right
 * column ("aside") carries the "Empfohlene Artikel" feature list (sourced
 * from `resolveFeaturedArticles()` so labels never drift from
 * [[hubClusters]]) and the truthful "Wer steht hinter RentenWiki" panel.
 * Beneath the two columns the "Alles im Überblick" hub (issue #03) keeps
 * its existing 5-cluster / 10-link structure so the topic-page entry points
 * remain in sitemap reach.
 *
 * Two CTAs are kept (not the mock's single "Berechnung starten" call):
 *   - Mein Plan (combine-mode, primary) opens the InventoryWizard. The
 *     wizard handles both "I have contracts" and "I'm starting fresh" via its
 *     "Weiter ohne Verträge" finish button.
 *   - Produkte vergleichen (compare-mode, secondary) takes users straight to
 *     the compare dashboard.
 *
 * Topic preselection (issue #13): on mount the page reads `?topic=<slug>`
 * from `window.location.search`. If the slug matches a registered route's
 * `preselection` AND `detectSavedMode()` returns `null` (first-time visitor,
 * no saved workspace), the matching `LandingChoice` is auto-fired. Returning
 * users are never overridden — saved state always wins (PRD US-18).
 *
 * Inline JSON-LD (issue #03): `WebSite` + `Organization` + `WebApplication`.
 * All three blocks are emitted via the typed `<JsonLd>` component into the
 * page body so the SSG prerender output already carries them.
 */
export function LandingPage({ onChoice, navigate }: Props) {
  const route = publicRouteRegistry['/']
  const canonical = buildCanonicalUrl('/')
  const featured = resolveFeaturedArticles()
  const hubArticleCount = countHubArticles()

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="landing-shell landing-shell--editorial">
      <main className="landing-main">
        {/* Top section: editorial hero (left) + aside panels (right) */}
        <section className="landing-top">
          <div className="landing-hero">
            <div className="landing-kicker">Eine offene Auskunft zu deiner Altersvorsorge</div>
            <h1 className="landing-headline">
              Was bekommst du <em className="landing-headline-accent">wirklich</em> an Rente?
            </h1>
            <p className="landing-subline">
              Trage deine Verträge ein. Wir rechnen — transparent, ohne Werbung,
              ohne Provisionen — wieviel pro Monat im Alter auf deinem Konto landet,
              in heutiger Kaufkraft und in Euro {RULES_YEAR + 39}. Der Quellcode ist
              offen, die Annahmen sind erklärt.
            </p>

            <div className="landing-cta-row">
              <button
                type="button"
                className="landing-btn landing-btn--primary"
                onClick={() => onChoice({ kind: 'combine' })}
              >
                <span>Mein Plan erstellen</span>
                <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="landing-btn landing-btn--secondary"
                onClick={() => onChoice({ kind: 'compare' })}
              >
                Vergleich starten
              </button>
            </div>

            <ol className="landing-steps" aria-label="So funktioniert es">
              {PROCESS_STEPS.map((step) => (
                <li key={step.n} className="landing-step">
                  <div className="landing-step-num">{step.n}</div>
                  <div className="landing-step-h">{step.h}</div>
                  <div className="landing-step-p">{step.p}</div>
                </li>
              ))}
            </ol>
          </div>

          <aside className="landing-aside" aria-label="Empfohlene Inhalte und Trägerangabe">
            <div className="landing-aside-card landing-aside-card--featured">
              <div className="landing-aside-kicker">Empfohlene Artikel</div>
              <ul className="landing-featured-list">
                {featured.map((a) => (
                  <li key={a.href} className="landing-featured-item">
                    <a href={a.href} className="landing-featured-link">
                      <span className="landing-featured-title">{a.label}</span>
                      <span className="landing-featured-meta">{a.cluster}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <a href="#landing-hub-heading" className="landing-featured-all">
                Alle {hubArticleCount} Themen ansehen →
              </a>
            </div>

            <div className="landing-aside-card landing-aside-card--about">
              <div className="landing-aside-kicker">Wer steht hinter RentenWiki</div>
              <p className="landing-about-body">
                RentenWiki.de ist ein Einzelprojekt von Peter Hartwieg. Es
                gibt keinen Verein, keine Provisionen und keine Werbung —
                die laufenden Kosten decken Spenden über Stripe und GitHub
                Sponsors.
              </p>
              <p className="landing-about-license">
                Der Quellcode steht unter{' '}
                <span className="landing-about-license-name">PolyForm Noncommercial 1.0.0</span>
                {' '}offen. Die kommerzielle Nutzung — etwa durch Versicherungs­makler,
                Anlageberater oder Arbeitgeber — ist lizenzpflichtig.
              </p>
            </div>
          </aside>
        </section>

        {/* Topic-page hub — issue #03. Sectioned `Alles im Überblick` block
            below the hero. Five clusters, 10 anchors. */}
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

      {/* Inline JSON-LD (issue #03): WebSite + Organization + WebApplication. */}
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
