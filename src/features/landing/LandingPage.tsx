import './LandingPage.css'
import { ArrowRight, LayoutGrid, BarChart3 } from 'lucide-react'
import { DisclaimerBanner } from '../workspace/DisclaimerBanner'

export type LandingChoice =
  | { kind: 'combine' }
  | { kind: 'compare' }

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
 */
export function LandingPage({ onChoice }: Props) {
  return (
    <div className="landing-shell">
      <DisclaimerBanner />

      <main className="landing-main">
        <div className="landing-hero">
          <h1 className="landing-headline">Deine Altersvorsorge im Blick</h1>
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
                Wir nehmen dich an die Hand: ein paar persönliche Angaben, dann
                deine bestehenden Verträge — oder leg ohne Verträge los, wenn du
                neu anfängst. Du erhältst eine Empfehlung, wo dein nächster Euro
                am besten aufgehoben ist.
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
                Vergleiche ETF-Depot, bAV, private Rentenversicherung, Basisrente,
                Altersvorsorgedepot und Riester direkt nebeneinander mit derselben
                monatlichen Netto-Belastung.
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
