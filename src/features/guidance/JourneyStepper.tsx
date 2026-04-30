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
  const currentIndex = STEPS.findIndex((s) => s.view === activeView)
  const previous = currentIndex > 0 ? STEPS[currentIndex - 1] : null
  const next =
    currentIndex >= 0 && currentIndex < STEPS.length - 1 ? STEPS[currentIndex + 1] : null
  const currentStep = currentIndex >= 0 ? STEPS[currentIndex] : null

  return (
    <section className="journey-stepper" aria-label="Geführter Ablauf">
      {/* Step pills — visible on desktop only, hidden on mobile via .journey-steps CSS. */}
      <ol className="journey-steps">
        {STEPS.map((step, index) => {
          const isActive = step.view === activeView
          const isComplete = currentIndex > index
          const isFuture = currentIndex < index
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
        {currentStep && (
          <span className="journey-status">
            <span className="journey-status-pill">
              Schritt {currentStep.number} von {STEPS.length}
            </span>
            <span className="journey-status-label">{currentStep.label}</span>
            <span className="journey-status-hint">— {currentStep.hint}</span>
          </span>
        )}
        <div className="journey-nav">
          {previous && (
            <button
              type="button"
              className="journey-nav-btn journey-nav-back"
              onClick={() => onNavigate(previous.view)}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              <span className="journey-nav-text">Zurück: {previous.label}</span>
              <span className="journey-nav-text-short" aria-hidden="true">Zurück</span>
            </button>
          )}
          {next && (
            <button
              type="button"
              className="journey-nav-btn journey-nav-next"
              onClick={() => onNavigate(next.view)}
            >
              <span className="journey-nav-text">Weiter: {next.label}</span>
              <span className="journey-nav-text-short" aria-hidden="true">Weiter</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="journey-nav-btn journey-nav-dismiss"
            onClick={onDismiss}
            aria-label="Geführten Ablauf beenden und volles Dashboard zeigen"
            title="Geführten Ablauf beenden"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
