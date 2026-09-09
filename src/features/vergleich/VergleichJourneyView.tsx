import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ProductId } from '../../domain'
import { getProductMeta } from '../../engine/productRegistry'
import { NumberField } from '../../ui/NumberField'
import { clampNumber } from '../../ui/formatting'
import { formatCurrency } from '../../utils/format'
import { qaTargetAttrs } from '../qa-feedback'
import { useQaMode } from '../qa-feedback/useQaMode'
import type { VergleichJourneyControls } from './VergleichJourneyPage'
import { productTaglines } from './productTaglines'
import './VergleichPage.css'

interface Props {
  controls: VergleichJourneyControls
  productIds: readonly ProductId[]
  onToggleProduct: (id: ProductId) => void
  renderResult: (onEditSetup: () => void) => ReactNode
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

  return (
    <div ref={root} className="vergleich-journey">
      {view === 'result' ? renderResult(() => changeView('setup')) : (
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
                    Aktuell verwendet: {profile.age} Jahre · {formatCurrency(profile.grossSalaryYear)} brutto im Jahr
                    {' · '}{profile.publicHealthInsurance ? 'gesetzlich versichert' : 'privat versichert'}.
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
