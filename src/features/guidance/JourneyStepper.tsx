import './JourneyStepper.css'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import type { WorkspaceView } from '../../app/useWorkspace'

type Step = {
  /** Workspace view this step maps to. */
  view: WorkspaceView
  /** Visible step number (1-based). */
  number: number
  label: string
  hint: string
}

const STEPS: readonly Step[] = [
  {
    view: 'angebot',
    number: 1,
    label: 'Eingaben',
    hint: 'Profil & Angebot vervollständigen',
  },
  {
    view: 'vergleich',
    number: 2,
    label: 'Vergleich',
    hint: 'Welches Produkt liegt vorn?',
  },
  {
    view: 'warum',
    number: 3,
    label: 'Ergebnis verstehen',
    hint: 'Wohin geht das Geld? Wie robust ist das?',
  },
  {
    view: 'details',
    number: 4,
    label: 'Export',
    hint: 'Details, Cashflows, PDF / CSV',
  },
] as const

type Props = {
  activeView: WorkspaceView
  onNavigate: (view: WorkspaceView) => void
  onDismiss: () => void
}

export function JourneyStepper({ activeView, onNavigate, onDismiss }: Props) {
  // Start view is "step 0" — before the journey begins. Treat it as currentIndex = -1
  // so the first step shows as "next" and Zurück hides.
  const currentIndex = STEPS.findIndex((s) => s.view === activeView)
  const onStart = activeView === 'start'
  const previous = currentIndex > 0 ? STEPS[currentIndex - 1] : null
  const next =
    currentIndex >= 0 && currentIndex < STEPS.length - 1
      ? STEPS[currentIndex + 1]
      : onStart
        ? STEPS[0]
        : null
  const currentStep = currentIndex >= 0 ? STEPS[currentIndex] : null

  return (
    <section className="journey-stepper" aria-label="Geführter Ablauf">
      <ol className="journey-steps">
        {STEPS.map((step, index) => {
          const isActive = step.view === activeView
          const isComplete = currentIndex > index
          const isFuture = currentIndex < index && !onStart
          return (
            <li
              key={step.view}
              className={[
                'journey-step',
                isActive ? 'journey-step--active' : '',
                isComplete ? 'journey-step--complete' : '',
                isFuture ? 'journey-step--future' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="journey-step-btn"
                onClick={() => onNavigate(step.view)}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="journey-step-num" aria-hidden="true">
                  {isComplete ? <Check size={14} /> : step.number}
                </span>
                <span className="journey-step-label">{step.label}</span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="journey-controls">
        {currentStep && <span className="journey-hint">{currentStep.hint}</span>}
        {onStart && (
          <span className="journey-hint">Bereit für den Vergleich? Schritt 1 öffnen.</span>
        )}
        <div className="journey-nav">
          {previous && (
            <button
              type="button"
              className="journey-nav-btn journey-nav-back"
              onClick={() => onNavigate(previous.view)}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span>Zurück: {previous.label}</span>
            </button>
          )}
          {next && (
            <button
              type="button"
              className="journey-nav-btn journey-nav-next"
              onClick={() => onNavigate(next.view)}
            >
              <span>Weiter: {next.label}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="journey-nav-btn journey-nav-dismiss"
            onClick={onDismiss}
            aria-label="Geführten Ablauf beenden und volles Dashboard zeigen"
          >
            <X size={14} aria-hidden="true" />
            <span>Dashboard anzeigen</span>
          </button>
        </div>
      </div>
    </section>
  )
}
