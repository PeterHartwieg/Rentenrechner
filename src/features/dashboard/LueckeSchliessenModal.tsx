import { useEffect, useMemo, useRef, useState } from 'react'
import type { Workspace } from '../../domain/workspace'
import { useFeedbackTarget } from '../../features/qa-feedback'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { ProductResult } from '../../domain/results'
import type { BavEmployerOfferInput, RecommendedCandidate } from '../../app/recommender'
import { ModalSlot } from '../../ui/chrome/ModalSlot'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency, formatPercent } from '../../utils/format'
import { RecommenderCard } from './RecommenderCard'
import './RecommenderCard.css'
import './LueckeSchliessenModal.css'

type Step = 'budget' | 'bav-offer' | 'result' | 'saved'
type OfferChoice = 'yes' | 'no' | null

interface Props {
  workspace: Workspace
  baselineCombined: CombinedResult
  baselinePerInstance: Record<string, ProductResult[]>
  grvGrossMonthlyPension: number
  selectedScenarioId?: string
  onClose: () => void
  onSaveAsPlan: (candidate: RecommendedCandidate) => void
}

export function LueckeSchliessenModal({
  workspace,
  baselineCombined,
  baselinePerInstance,
  grvGrossMonthlyPension,
  selectedScenarioId,
  onClose,
  onSaveAsPlan,
}: Props) {
  const [step, setStep] = useState<Step>('budget')
  const [budget, setBudget] = useState(200)

  const { targetProps: modalTargetProps } = useFeedbackTarget({
    id: 'dashboard.lueckeModal.dialog',
    label: 'Lücke schließen',
    precision: 'section',
  })
  const { targetProps: stepHeadingTargetProps } = useFeedbackTarget({
    id: `dashboard.lueckeModal.step.${step}.heading`,
    label: `Lücke-schließen Schritt: ${step}`,
  })
  const { targetProps: primaryCtaTargetProps } = useFeedbackTarget({
    id: `dashboard.lueckeModal.step.${step}.primaryCta`,
    label: 'Weiter',
  })
  const [offerChoice, setOfferChoice] = useState<OfferChoice>(null)
  const [employerPercentPct, setEmployerPercentPct] = useState(15)
  const [fixedMonthlyEUR, setFixedMonthlyEUR] = useState(0)
  const [capMonthlyEUR, setCapMonthlyEUR] = useState(0)
  const [effectiveCostPct, setEffectiveCostPct] = useState(1.2)
  const [payoutMode, setPayoutMode] = useState<'leibrente' | 'zeitrente' | 'kapitalverzehr'>('leibrente')
  const [rentenfaktor, setRentenfaktor] = useState(30)
  // Issue 68: track the candidate the user adopted so the confirmation step
  // can echo what was saved.
  const [savedCandidate, setSavedCandidate] = useState<RecommendedCandidate | null>(null)

  // Keyboard a11y: ModalSlot's FocusTrap focuses the first focusable element
  // on mount, which is the invisible backdrop <button>. Override by focusing
  // the first visible form control in the step body after FocusTrap's mount-
  // focus runs. useEffect (not useLayoutEffect) ensures this consumer effect
  // runs after FocusTrap's mount effect, so this focus call wins the race.
  // Re-runs on step transition so the first field of each step receives focus.
  const firstFieldRef = useRef<HTMLInputElement | HTMLButtonElement | null>(null)
  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [step])

  const bavOffer = useMemo<BavEmployerOfferInput>(() => {
    if (offerChoice !== 'yes') {
      return {
        hasOffer: false,
        employerMatchPercent: 0.15,
        fixedMonthlyEUR: 0,
        monthlyCapEUR: undefined,
        effectiveCostAnnual: 0.012,
        durchfuehrungsweg: 'direktversicherung_3_63',
        payoutMode: 'leibrente',
        rentenfaktor: 30,
      }
    }
    return {
      hasOffer: true,
      employerMatchPercent: Math.max(0, employerPercentPct) / 100,
      fixedMonthlyEUR: Math.max(0, fixedMonthlyEUR),
      monthlyCapEUR: capMonthlyEUR > 0 ? capMonthlyEUR : undefined,
      effectiveCostAnnual: Math.max(0, effectiveCostPct) / 100,
      durchfuehrungsweg: 'direktversicherung_3_63',
      payoutMode,
      rentenfaktor,
    }
  }, [
    offerChoice,
    employerPercentPct,
    fixedMonthlyEUR,
    capMonthlyEUR,
    effectiveCostPct,
    payoutMode,
    rentenfaktor,
  ])

  const safeBudget = Math.max(0, budget)

  return (
    <ModalSlot
      open
      onClose={onClose}
      title="Lücke schließen"
      eyebrow={stepLabel(step)}
      closeLabel="Dialog schließen"
      panelClassName="luecke-modal__panel"
    >
      <div {...modalTargetProps}>
        {step === 'budget' && (
          <div className="luecke-modal__body">
            <h3 {...stepHeadingTargetProps}>Wie viel möchtest du zusätzlich sparen?</h3>
            <div className="luecke-modal__presets" role="group" aria-label="Monatliche Sparrate auswählen">
              {[100, 200, 400].map((preset, index) => (
                <button
                  key={preset}
                  ref={index === 0 ? (el) => { firstFieldRef.current = el } : undefined}
                  type="button"
                  className={`recommender-preset ${safeBudget === preset ? 'is-active' : ''}`}
                  onClick={() => setBudget(preset)}
                >
                  {preset} €
                </button>
              ))}
            </div>
            <NumberField
              label="Eigener Betrag"
              value={safeBudget}
              min={0}
              max={20_000}
              step={10}
              decimals={0}
              suffix="€/Mon."
              onCommit={(raw) => setBudget(Math.max(0, Number(raw) || 0))}
            />
            <div className="luecke-modal__actions">
              <button type="button" className="luecke-modal__secondary" onClick={onClose}>
                Abbrechen
              </button>
              <button
                type="button"
                className="luecke-modal__primary"
                onClick={() => setStep('bav-offer')}
                disabled={safeBudget <= 0}
                {...primaryCtaTargetProps}
              >
                Weiter
              </button>
            </div>
          </div>
        )}

        {step === 'bav-offer' && (
          <div className="luecke-modal__body">
            <h3 {...stepHeadingTargetProps}>Hast du ein bAV-Angebot vom Arbeitgeber?</h3>
            <div className="luecke-modal__choice-row">
              <button
                ref={(el) => { firstFieldRef.current = el }}
                type="button"
                className={`luecke-modal__choice ${offerChoice === 'yes' ? 'is-active' : ''}`}
                onClick={() => setOfferChoice('yes')}
              >
                Ja, Angebot erfassen
              </button>
              <button
                type="button"
                className={`luecke-modal__choice ${offerChoice === 'no' ? 'is-active' : ''}`}
                onClick={() => setOfferChoice('no')}
              >
                Nein, Standardannahmen nutzen
              </button>
            </div>

            {offerChoice === 'yes' && (
              <>
                <div className="luecke-modal__grid">
                  <NumberField
                    label="Arbeitgeberzuschuss"
                    value={employerPercentPct}
                    min={0}
                    max={500}
                    step={1}
                    decimals={0}
                    suffix="%"
                    onCommit={(raw) => setEmployerPercentPct(Math.max(0, Number(raw) || 0))}
                  />
                  <NumberField
                    label="Fester Arbeitgeberbeitrag"
                    value={fixedMonthlyEUR}
                    min={0}
                    max={20_000}
                    step={10}
                    decimals={0}
                    suffix="€/Mon."
                    onCommit={(raw) => setFixedMonthlyEUR(Math.max(0, Number(raw) || 0))}
                  />
                  <NumberField
                    label="Max. Arbeitgeberbeitrag"
                    value={capMonthlyEUR}
                    min={0}
                    max={20_000}
                    step={10}
                    decimals={0}
                    suffix="€/Mon."
                    onCommit={(raw) => setCapMonthlyEUR(Math.max(0, Number(raw) || 0))}
                  />
                  <NumberField
                    label="Effektivkosten p.a."
                    value={effectiveCostPct}
                    min={0}
                    max={10}
                    step={0.1}
                    decimals={1}
                    suffix="%"
                    onCommit={(raw) => setEffectiveCostPct(Math.max(0, Number(raw) || 0))}
                  />
                </div>
                <p className="luecke-modal__note">
                  Prozent und fixer Beitrag werden addiert; ein Maximum begrenzt den Arbeitgeberanteil.
                </p>
                <details className="luecke-modal__details">
                  <summary>Optionale bAV-Details</summary>
                  <div className="luecke-modal__grid">
                    <label className="field">
                      <span>Auszahlung</span>
                      <select
                        value={payoutMode}
                        onChange={(event) => setPayoutMode(event.target.value as typeof payoutMode)}
                      >
                        <option value="leibrente">Leibrente</option>
                        <option value="zeitrente">Zeitrente</option>
                        <option value="kapitalverzehr">Kapitalverzehr</option>
                      </select>
                    </label>
                    <NumberField
                      label="Rentenfaktor"
                      value={rentenfaktor}
                      min={0}
                      max={100}
                      step={1}
                      decimals={0}
                      suffix="€/10k"
                      onCommit={(raw) => setRentenfaktor(Math.max(0, Number(raw) || 0))}
                    />
                  </div>
                  <p className="luecke-modal__note">
                    Durchführungsweg: Direktversicherung §3 Nr. 63.
                  </p>
                </details>
              </>
            )}

            {offerChoice === 'no' && (
              <p className="luecke-modal__note">
                bAV bleibt im Vergleich mit {formatPercent(0.15, 0)} Arbeitgeberzuschuss,
                {` ${formatPercent(0.012, 1)} Effektivkosten p.a.`} und niedrigerer Eingabesicherheit.
              </p>
            )}

            <div className="luecke-modal__actions">
              <button type="button" className="luecke-modal__secondary" onClick={() => setStep('budget')}>
                Zurück
              </button>
              <button
                type="button"
                className="luecke-modal__primary"
                onClick={() => setStep('result')}
                disabled={offerChoice === null}
                {...primaryCtaTargetProps}
              >
                Optionen anzeigen
              </button>
            </div>
          </div>
        )}

        {step === 'saved' && savedCandidate && (
          <div
            className="luecke-modal__body luecke-modal__body--saved"
            role="status"
            aria-live="polite"
          >
            <h3 {...stepHeadingTargetProps}>Plan gespeichert</h3>
            <p className="luecke-modal__saved-summary">
              <strong>{savedCandidate.label}</strong> wurde als Was-wäre-wenn-Szenario gespeichert.
              Zu finden unter Meine Verträge → Szenarien.
            </p>
            <dl className="luecke-modal__saved-summary-list">
              <div>
                <dt>Zusätzlich monatlich</dt>
                <dd>{formatCurrency(savedCandidate.netCashOutEUR, 0)} netto</dd>
              </div>
              <div>
                <dt>Erwartete Netto-Rente</dt>
                <dd>{formatCurrency(savedCandidate.medianNettoRente, 0)} / Mon.</dd>
              </div>
              <div>
                <dt>Kapital bei Renteneinstieg (netto)</dt>
                <dd>
                  {formatCurrency(savedCandidate.netCapitalAtRetirement, 0)}
                  {savedCandidate.payoutOnly ? ' (annuitisiert)' : ''}
                </dd>
              </div>
            </dl>
            <p className="luecke-modal__note">
              Die Basisplanung bleibt unverändert. Erst wenn du das Szenario aktiv übernimmst,
              wird es Teil des Hauptplans.
            </p>
            <div className="luecke-modal__actions">
              <button
                ref={(el) => { firstFieldRef.current = el }}
                type="button"
                className="luecke-modal__secondary"
                onClick={() => {
                  setSavedCandidate(null)
                  setStep('result')
                }}
              >
                Weiteres Szenario speichern
              </button>
              <button type="button" className="luecke-modal__primary" onClick={onClose}>
                Fertig
              </button>
            </div>
          </div>
        )}

        {step === 'result' && (
          <div className="luecke-modal__body luecke-modal__body--result">
            <RecommenderCard
              workspace={workspace}
              baselineCombined={baselineCombined}
              baselinePerInstance={baselinePerInstance}
              grvGrossMonthlyPension={grvGrossMonthlyPension}
              marginalMonthlyEUR={safeBudget}
              bavOffer={bavOffer}
              selectedScenarioId={selectedScenarioId}
              onSaveAsPlan={(candidate) => {
                // Issue 68: do NOT close the modal silently. Persist the
                // candidate via the parent's onSaveAsPlan handler (which adds
                // a what-if scenario in App.tsx) and then show a confirmation
                // step. The user gets explicit feedback that the plan was
                // saved and where to find it; closing the modal moves them
                // back to the dashboard.
                onSaveAsPlan(candidate)
                setSavedCandidate(candidate)
                setStep('saved')
              }}
            />
            <div className="luecke-modal__actions">
              <button type="button" className="luecke-modal__secondary" onClick={() => setStep('bav-offer')}>
                Zurück
              </button>
              <button type="button" className="luecke-modal__secondary" onClick={onClose}>
                Schließen
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalSlot>
  )
}

function stepLabel(step: Step): string {
  if (step === 'budget') return 'Schritt 1 von 3'
  if (step === 'bav-offer') return 'Schritt 2 von 3'
  if (step === 'saved') return 'Plan gespeichert'
  return 'Ergebnis'
}
