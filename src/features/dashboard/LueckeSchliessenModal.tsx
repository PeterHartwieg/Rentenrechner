import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { Workspace } from '../../domain/workspace'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { ProductResult } from '../../domain/results'
import type { BavEmployerOfferInput, RecommendedCandidate } from '../../app/recommender'
import { NumberField } from '../../ui/NumberField'
import { formatPercent } from '../../utils/format'
import { RecommenderCard } from './RecommenderCard'
import './RecommenderCard.css'

type Step = 'budget' | 'bav-offer' | 'result'
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
  const [offerChoice, setOfferChoice] = useState<OfferChoice>(null)
  const [employerPercentPct, setEmployerPercentPct] = useState(15)
  const [fixedMonthlyEUR, setFixedMonthlyEUR] = useState(0)
  const [capMonthlyEUR, setCapMonthlyEUR] = useState(0)
  const [effectiveCostPct, setEffectiveCostPct] = useState(1.2)
  const [payoutMode, setPayoutMode] = useState<'leibrente' | 'zeitrente' | 'kapitalverzehr'>('leibrente')
  const [rentenfaktor, setRentenfaktor] = useState(30)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

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
    <div className="luecke-modal-backdrop" role="presentation">
      <section
        className="luecke-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="luecke-modal-title"
      >
        <header className="luecke-modal__header">
          <div>
            <h2 id="luecke-modal-title">Lücke schließen</h2>
            <p>{stepLabel(step)}</p>
          </div>
          <button
            type="button"
            className="luecke-modal__icon-button"
            onClick={onClose}
            aria-label="Dialog schließen"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {step === 'budget' && (
          <div className="luecke-modal__body">
            <h3>Wie viel möchtest du zusätzlich sparen?</h3>
            <div className="luecke-modal__presets" role="group" aria-label="Monatliche Sparrate auswählen">
              {[100, 200, 400].map((preset) => (
                <button
                  key={preset}
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
              >
                Weiter
              </button>
            </div>
          </div>
        )}

        {step === 'bav-offer' && (
          <div className="luecke-modal__body">
            <h3>Hast du ein bAV-Angebot vom Arbeitgeber?</h3>
            <div className="luecke-modal__choice-row">
              <button
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
              >
                Optionen anzeigen
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
                onSaveAsPlan(candidate)
                onClose()
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
      </section>
    </div>
  )
}

function stepLabel(step: Step): string {
  if (step === 'budget') return 'Schritt 1 von 3'
  if (step === 'bav-offer') return 'Schritt 2 von 3'
  return 'Ergebnis'
}
