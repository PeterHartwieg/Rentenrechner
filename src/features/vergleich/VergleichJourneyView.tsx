import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ProductId } from '../../domain'
import { getProductMeta } from '../../engine/productRegistry'
import { NumberField } from '../../ui/NumberField'
import { clampNumber } from '../../ui/formatting'
import { formatCurrency, formatPercent } from '../../utils/format'
import { qaTargetAttrs } from '../qa-feedback'
import { useQaMode } from '../qa-feedback/useQaMode'
import type { VergleichJourneyControls } from './VergleichJourneyPage'
import type { PlanProfileSummary } from './planProfileSummary'
import { productTaglines } from './productTaglines'
import './VergleichPage.css'

interface Props {
  controls: VergleichJourneyControls
  productIds: readonly ProductId[]
  onToggleProduct: (id: ProductId) => void
  renderResult: (onEditSetup: () => void, profileNote: ReactNode) => ReactNode
}

function healthLabel(publicHealthInsurance: boolean): string {
  return publicHealthInsurance ? 'gesetzlich versichert' : 'privat versichert'
}

/**
 * One sentence naming every field the comparison is diffed against the plan
 * on (`profileDiffersFrom`). Used verbatim for the comparison's own figures
 * and for the plan's, so when the two differ the differing field is visible
 * rather than hidden behind identical-looking copy.
 */
function describeProfile(summary: PlanProfileSummary): string {
  return `${summary.age} Jahre · ${formatCurrency(summary.grossSalaryYear)} brutto im Jahr`
    + ` · ${healthLabel(summary.publicHealthInsurance)}`
    + ` · Rente mit ${summary.retirementAge}`
    + ` · Inflation ${formatPercent(summary.inflationRate)}`
}

/** View navigation stays local; all edits use the container's compare-state handlers. */
export function VergleichJourneyView({ controls, productIds, onToggleProduct, renderResult }: Props) {
  const [view, setView] = useState<'setup' | 'result'>(() =>
    controls.selectedProducts.length === 0 ? 'setup' : 'result',
  )
  const root = useRef<HTMLDivElement>(null)
  const [hasNavigated, setHasNavigated] = useState(false)
  const { enabled: qaEnabled } = useQaMode()
  const { profile, setProfile } = controls

  useEffect(() => {
    if (!hasNavigated) return
    root.current?.querySelector('h1')?.focus()
  }, [view, hasNavigated])

  function changeView(next: 'setup' | 'result') {
    setHasNavigated(true)
    setView(next)
  }

  // The result page names the person it computes on. Without this the
  // comparison silently kept an older salary after the plan had been refined
  // (audit F11): the figures looked personal but were not the plan's.
  const plan = controls.planProfile
  const current = describeProfile({
    age: profile.age,
    retirementAge: profile.retirementAge,
    grossSalaryYear: profile.grossSalaryYear,
    publicHealthInsurance: profile.publicHealthInsurance,
    inflationRate: controls.inflationRate,
  })
  const profileNote = (
    <div className="vergleich-profile-strip" role="note" data-testid="vergleich-profile-strip">
      <p>
        <strong>Beispielrechnung mit Muster-Sparformen</strong>, nicht mit deinen Verträgen oder Angeboten.
        {' '}Angaben: {current}.
        {controls.hasSavedPlan && !controls.profileDiffersFromPlan && ' Wie in deinem Plan.'}
      </p>
      {controls.hasSavedPlan && plan && controls.profileDiffersFromPlan && (
        <p className="vergleich-profile-strip__diff">
          Dein Plan rechnet mit anderen Angaben: {describeProfile(plan)}.
          {' '}<button type="button" className="vergleich-actions__button" onClick={controls.seedFromPlan}>Angaben aus meinem Plan übernehmen</button>
        </p>
      )}
      <button type="button" className="vergleich-profile-strip__edit" onClick={() => changeView('setup')}>Angaben ändern</button>
    </div>
  )

  return (
    <div ref={root} className="vergleich-journey">
      {view === 'result' ? renderResult(() => changeView('setup'), profileNote) : (
        <section className="vergleich-shell vergleich-journey-setup" data-testid="vergleich-setup">
          <div className="vergleich-main vergleich-body">
            <div className="vergleich-kicker">Sparformen vergleichen</div>
            <h1 className="vergleich-headline" tabIndex={-1}>Was möchtest du vergleichen?</h1>
            <p className="vergleich-lead">Wähle nur die Sparformen, die dich interessieren.</p>
            <form className="vergleich-setup-form" onSubmit={(event) => {
              event.preventDefault()
              changeView('result')
            }}>
              <fieldset className="vergleich-choice-fieldset">
                <legend>Sparformen</legend>
                <div className="vergleich-choice-grid">
                  {productIds.map((id) => (
                    <label key={id} className="vergleich-choice">
                      <input type="checkbox" checked={controls.selectedProducts.includes(id)}
                        aria-label={getProductMeta(id)?.label}
                        onChange={() => onToggleProduct(id)} />
                      <span><strong>{getProductMeta(id)?.label}</strong><small>{productTaglines[id]}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="vergleich-budget">
                <NumberField label="Was möchtest du monatlich selbst zahlen (€)?"
                  value={controls.ownMoneyMonthly} min={0} step={1} decimals={2}
                  onCommit={(value) => controls.setOwnMoneyMonthly(Math.max(0, Number(value)))} />
                <p className="vergleich-muted">Für jede ausgewählte Sparform derselbe Betrag aus deinem eigenen Geld.</p>
              </div>
              {controls.hasSavedPlan ? (
                <div className="vergleich-profile-seed">
                  <button type="button" className="vergleich-actions__button" onClick={controls.seedFromPlan}>
                    Angaben aus meinem Plan verwenden
                  </button>
                  <p className="vergleich-muted" data-qa-sensitive="true">
                    Aktuell verwendet: {current}.
                  </p>
                </div>
              ) : (
                <fieldset className="vergleich-choice-fieldset">
                  <legend>Deine Angaben für den Vergleich</legend>
                  <p className="vergleich-muted">Prüfe die vorbelegten Angaben. Weitere Werte bleiben Modellannahmen.</p>
                  <div className="vergleich-profile-grid">
                    <NumberField label="Alter" feedbackTargetId="inputs.profile.age"
                      value={profile.age} min={18} max={profile.retirementAge - 1}
                      onCommit={(value) => setProfile((current) => ({ ...current,
                        age: clampNumber(Number(value), 18, current.retirementAge - 1),
                      }))} />
                    <NumberField label="Jahreseinkommen brutto (€)" feedbackTargetId="inputs.profile.grossSalary"
                      value={profile.grossSalaryYear} min={0} step={1}
                      onCommit={(value) => setProfile((current) => ({ ...current,
                        grossSalaryYear: Math.max(0, Number(value)),
                      }))} />
                    <fieldset className="vergleich-health">
                      <legend>Krankenversicherung</legend>
                      <label {...qaTargetAttrs(qaEnabled, { id: 'inputs.profile.krankenversicherung.gkv', label: 'Gesetzlich (GKV)', precision: 'exact' })}>
                        <input type="radio" name="vergleich-health" checked={profile.publicHealthInsurance}
                          onChange={() => setProfile((current) => ({ ...current, publicHealthInsurance: true }))} /> Gesetzlich (GKV)
                      </label>
                      <label {...qaTargetAttrs(qaEnabled, { id: 'inputs.profile.krankenversicherung.pkv', label: 'Privat (PKV)', precision: 'exact' })}>
                        <input type="radio" name="vergleich-health" checked={!profile.publicHealthInsurance}
                          onChange={() => setProfile((current) => ({ ...current, publicHealthInsurance: false }))} /> Privat (PKV)
                      </label>
                    </fieldset>
                  </div>
                </fieldset>
              )}
              <button type="submit" className="vergleich-primary">Vergleich ansehen</button>
            </form>
          </div>
        </section>
      )}

    </div>
  )
}
