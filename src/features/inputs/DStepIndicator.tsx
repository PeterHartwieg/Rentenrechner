import './DStepIndicator.css'

/**
 * Two-step indicator shared by both pages of the `/eingaben` wizard:
 *
 *   Step I  · "Über dich"      — `/eingaben`          (Person / Einkommen / Ziel / Annahmen)
 *   Step II · "Deine Verträge" — `/eingaben/produkte` (GRV / Sparpläne / Versicherungen)
 *
 * Visual treatment is ported from `direction-d-pages.jsx` `DStepIndicator`
 * (bundle L261-315) — two-column grid with mono kicker (I. / II.), sans
 * label + sublabel, and a mono uppercase status badge that flips between
 * `abgeschlossen` (done), `aktueller Schritt` (active), and `ausstehend`
 * (pending). Inline styles in the bundle become CSS classes that consume
 * the existing Sober D tokens (`--rw-paper`, `--rw-ink`, `--rw-rule`, etc.)
 * defined in `src/App.css` — no new design tokens are introduced.
 *
 * The component is intentionally render-only: it carries no navigation, no
 * accessibility region label (the surrounding page owns the heading), and
 * no state. PR 2 lands it as a shared shell element; PR 3 + 4 follow up by
 * replacing the Schritt-2 body with new Sober D Produkte components.
 */

interface DStepIndicatorProps {
  /** 1 = Schritt I active (Schritt 2 page sets 2 so step 1 reads as done). */
  current: 1 | 2
}

interface Step {
  readonly n: string
  readonly label: string
  readonly sub: string
}

const STEPS: ReadonlyArray<Step> = [
  { n: 'I.', label: 'Über dich', sub: 'Person · Einkommen · Ziel · Annahmen' },
  { n: 'II.', label: 'Deine Verträge', sub: 'GRV · Sparpläne · Versicherungen' },
]

function statusLabel(state: 'done' | 'active' | 'pending'): string {
  if (state === 'done') return 'abgeschlossen'
  if (state === 'active') return 'aktueller Schritt'
  return 'ausstehend'
}

export function DStepIndicator({ current }: DStepIndicatorProps) {
  return (
    <div className="d-step-indicator" data-testid="d-step-indicator" data-step={current}>
      {STEPS.map((step, i) => {
        const stepNum = i + 1
        const state: 'done' | 'active' | 'pending' =
          current === stepNum ? 'active' : current > stepNum ? 'done' : 'pending'
        return (
          <div
            key={step.n}
            className={`d-step-indicator__cell d-step-indicator__cell--${state}`}
            data-step-state={state}
          >
            <span className="d-step-indicator__kicker">{step.n}</span>
            <div className="d-step-indicator__body">
              <div className="d-step-indicator__label">{step.label}</div>
              <div className="d-step-indicator__sub">{step.sub}</div>
            </div>
            <span className="d-step-indicator__status">{statusLabel(state)}</span>
          </div>
        )
      })}
    </div>
  )
}
