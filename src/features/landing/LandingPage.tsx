import './LandingPage.css'
import { useState } from 'react'
import { ArrowRight, HelpCircle } from 'lucide-react'
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
    // TODO(issue-05): replace with InventoryWizard once it ships.
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
            Berechne, was du in Rente bekommen wirst — und wo dein naechster Euro
            am meisten bewirkt. Keine Steuer-, Rechts- oder Anlageberatung.
          </p>
        </div>

        <div className="landing-cards">
          {/* Primary card: Mein Plan (combine-mode) */}
          <div className="landing-card landing-card--primary">
            <div className="landing-card-body">
              <div className="landing-card-icon landing-card-icon--primary" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <h2 className="landing-card-title">Mein Plan</h2>
              <p className="landing-card-desc">
                Gib deine bestehenden Vertraege ein und sieh, was dein Portfolio
                in Rente abwirft. Erhalte eine Empfehlung, wo dein naechster Euro
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
                    Hast du schon Vertraege?
                  </p>
                  <div className="landing-vertraege-actions">
                    <button
                      type="button"
                      className="landing-btn landing-btn--secondary"
                      onClick={handleVertraegeJa}
                    >
                      Ja, ich habe Vertraege
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
                    Zurueck
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Secondary card: Produkte vergleichen (compare-mode) */}
          <div className="landing-card landing-card--secondary">
            <div className="landing-card-body">
              <div className="landing-card-icon landing-card-icon--secondary" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
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
            Gefuehrter Einstieg
          </button>
          <span className="landing-returning-hint">
            Du weisst noch nicht, womit du anfangen sollst?
          </span>
        </div>
      </main>
    </div>
  )
}
