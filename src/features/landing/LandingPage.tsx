import { useEffect, useRef } from 'react'
import './LandingPage.css'
import { ArrowRight, LayoutGrid, BarChart3 } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'
import type { ProductId } from '../../domain'
import { resolveTopicPreselection } from '../../seo/publicRouteRegistry'
import { detectSavedMode } from '../../app/useRoute'

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
 */
export function LandingPage({ onChoice }: Props) {
  // Auto-fire-once guard: useEffect deps are stable (`onChoice` is the only
  // referenced value) but React 19 strict-mode runs effects twice in dev. The
  // ref ensures we never double-fire `onChoice` if the component re-renders.
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
          <h1 className="landing-headline">Deine Altersvorsorge im Blick</h1>
          <p className="landing-subline">
            Berechne, was du in Rente bekommen wirst — und wo dein nächster Euro
            am meisten bewirkt. Hilfreich besonders, wenn du deine{' '}
            <a href="/rentenluecke-rechner">Rentenlücke berechnen</a> möchtest.
            Keine Steuer-, Rechts- oder Anlageberatung.
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
                Persönliche Angaben und bestehende Verträge — oder leg ohne los,
                wenn du neu anfängst. Empfehlung, wo dein nächster Euro am meisten bringt.
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
                ETF, bAV, Versicherung, Basisrente, AVD und Riester direkt nebeneinander
                — gleiche Netto-Belastung, faire Zahlen.
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
      </main>
    </div>
  )
}
