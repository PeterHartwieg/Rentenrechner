import './LandingPage.css'
import { useState } from 'react'
import { ArrowRight, HelpCircle, LayoutGrid, BarChart3 } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'

export type LandingChoice =
  | { kind: 'combine-new' }
  | { kind: 'combine-existing' }
  | { kind: 'compare' }
  | { kind: 'guided-setup' }

interface Props {
  onChoice: (choice: LandingChoice) => void
}

/**
 * Two-CTA landing page (Group G issue 04 — M2.1 + M2.2).
 *
 * Mein Plan (combine-mode, primary weight):
 *   Clicks open a "Hast du schon Verträge?" prompt.
 *   - Ja  → routes to inventory wizard placeholder (issue 05 builds the real one).
 *   - Nein → opens the existing GuidedSetup minimum-input flow.
 *
 * Produkte vergleichen (compare-mode, secondary weight):
 *   Routes directly to today's compare-mode dashboard with mode: 'compare' tagged.
 *
 * Disclaimer banner remains visible (sessionStorage-based, never permanently dismissed).
 */
export function LandingPage({ onChoice }: Props) {
  const [showVertraegePrompt, setShowVertraegePrompt] = useState(false)

  function handleMeinPlanClick() {
    setShowVertraegePrompt(true)
  }

  function handleVertraegeJa() {
    // Routes to the InventoryWizard (Group G issue 05).
    onChoice({ kind: 'combine-existing' })
  }

  function handleVertraegeNein() {
    onChoice({ kind: 'combine-new' })
  }

  function handleVergleichenClick() {
    onChoice({ kind: 'compare' })
  }

  function handleGuidedSetupLink() {
    onChoice({ kind: 'guided-setup' })
  }

  return (
    <div className="landing-shell">
      <DisclaimerBanner />

      <main className="landing-main">
        <div className="landing-hero">
          <h1 className="landing-headline">
            Deine Altersvorsorge im Blick
          </h1>
          <p className="landing-subline">
            Berechne, was du in Rente bekommen wirst — und wo dein nächster Euro
            am meisten bewirkt. Keine Steuer-, Rechts- oder Anlageberatung.
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
                Gib deine bestehenden Verträge ein und sieh, was dein Portfolio
                in Rente abwirft. Erhalte eine Empfehlung, wo dein nächster Euro
                am besten aufgehoben ist.
              </p>

              {!showVertraegePrompt ? (
                <button
                  type="button"
                  className="landing-btn landing-btn--primary"
                  onClick={handleMeinPlanClick}
                >
                  Mein Plan erstellen
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              ) : (
                <div className="landing-vertraege-prompt">
                  <p className="landing-vertraege-question">
                    Hast du schon Verträge?
                  </p>
                  <div className="landing-vertraege-actions">
                    <button
                      type="button"
                      className="landing-btn landing-btn--secondary"
                      onClick={handleVertraegeJa}
                    >
                      Ja, ich habe Verträge
                    </button>
                    <button
                      type="button"
                      className="landing-btn landing-btn--ghost"
                      onClick={handleVertraegeNein}
                    >
                      Nein, ich fange neu an
                    </button>
                  </div>
                  <button
                    type="button"
                    className="landing-vertraege-back"
                    onClick={() => setShowVertraegePrompt(false)}
                  >
                    Zurück
                  </button>
                </div>
              )}
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
                Vergleiche ETF-Depot, bAV, private Rentenversicherung, Basisrente,
                Altersvorsorgedepot und Riester direkt nebeneinander — mit gleicher
                Einzahlung als fairer Vergleichsbasis.
              </p>
              <button
                type="button"
                className="landing-btn landing-btn--outline"
                onClick={handleVergleichenClick}
              >
                Vergleich starten
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Returning-user link */}
        <div className="landing-returning">
          <button
            type="button"
            className="landing-link-btn"
            onClick={handleGuidedSetupLink}
          >
            <HelpCircle size={15} aria-hidden="true" />
            Geführter Einstieg
          </button>
          <span className="landing-returning-hint">
            Du weißt noch nicht, womit du anfangen sollst?
          </span>
        </div>
      </main>
    </div>
  )
}
