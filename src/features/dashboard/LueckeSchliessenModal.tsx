import { useEffect, useMemo, useRef, useState } from 'react'
import type { PortfolioFunding, Workspace } from '../../domain/workspace'
import { useFeedbackTarget } from '../../features/qa-feedback'
import type { CombinedResult } from '../../engine/portfolioCombine'
import type { ProductResult } from '../../domain/results'
import type { BavEmployerOfferInput, RecommendedCandidate } from '../../app/recommender'
import { solveTargetContribution, type TargetContribution } from '../../app/targetContribution'
import { de2026Rules } from '../../rules/de2026'
import { ModalSlot } from '../../ui/chrome/ModalSlot'
import { NumberField } from '../../ui/NumberField'
import { formatCurrency, formatPercent } from '../../utils/format'
import { RecommenderCard } from './RecommenderCard'
import { candidateFigures, selectedScenario } from './RecommenderCard.figures'
import { CandidateFigureRows, FiguresBasisNote } from './RecommenderCard.figureRows'
import './RecommenderCard.css'
import './LueckeSchliessenModal.css'

type Step = 'budget' | 'bav-offer' | 'result' | 'saved'
type OfferChoice = 'yes' | 'no' | null

/**
 * Audit F07: the on-demand "Sparrate für meine Wunschrente" solver. Runs only
 * when the user clicks the button, never on render; the result is cleared
 * when the chosen ETF changes so a stale answer cannot sit next to a new
 * selection.
 */
type SolverState =
  | { kind: 'idle' }
  | { kind: 'no-result' }
  | { kind: 'met'; achievedMonthlyReal: number }
  | { kind: 'solved'; result: TargetContribution }

interface Props {
  workspace: Workspace
  baselineCombined: CombinedResult
  baselinePerInstance: Record<string, ProductResult[]>
  portfolioFunding?: PortfolioFunding
  grvGrossMonthlyPension: number
  selectedScenarioId?: string
  onClose: () => void
  /**
   * Persists the candidate as a saved alternative (what-if scenario). May
   * return the new scenario id; when it does, the confirmation step offers a
   * "Gespeicherte Alternative ansehen" button (requires `onOpenSaved`).
   */
  onSaveAsPlan: (candidate: RecommendedCandidate) => string | void
  /**
   * Navigates to the saved alternative with the given id. The modal does not
   * close itself here; the parent decides whether navigation unmounts it.
   */
  onOpenSaved?: (id: string) => void
}

export function LueckeSchliessenModal({
  workspace,
  baselineCombined,
  baselinePerInstance,
  portfolioFunding,
  grvGrossMonthlyPension,
  selectedScenarioId,
  onClose,
  onSaveAsPlan,
  onOpenSaved,
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
  // Id of the saved alternative, when the parent's save handler returns one.
  // Drives the "Gespeicherte Alternative ansehen" button on the saved step.
  const [savedId, setSavedId] = useState<string | null>(null)

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

  // ---- Audit F07: target-driven contribution solver (budget step) --------
  const profile = workspace.baseline.profile
  const wsa = workspace.baseline.assumptions
  const targetMonthly = profile.desiredNetMonthlyPension ?? 0
  const activeEtfs = useMemo(
    () => wsa.etf.filter((inst) => inst.status === 'active'),
    [wsa.etf],
  )
  const [solverInstanceId, setSolverInstanceId] = useState<string>(() => activeEtfs[0]?.instanceId ?? '')
  const [solver, setSolver] = useState<SolverState>({ kind: 'idle' })
  const scenario = selectedScenario(workspace, selectedScenarioId)
  const solverEtf = activeEtfs.find((inst) => inst.instanceId === solverInstanceId) ?? activeEtfs[0]
  const yearsUntilRetirement = Math.max(0, profile.retirementAge - profile.age)

  function runSolver() {
    if (!solverEtf || targetMonthly <= 0) {
      setSolver({ kind: 'no-result' })
      return
    }
    const result = solveTargetContribution(workspace, de2026Rules, solverEtf.instanceId, targetMonthly, scenario.id)
    if (!result) {
      setSolver({ kind: 'no-result' })
    } else if (result.additionalMonthly <= 0) {
      setSolver({ kind: 'met', achievedMonthlyReal: result.achievedMonthlyReal })
    } else {
      setSolver({ kind: 'solved', result })
    }
  }

  const figuresContext = useMemo(
    () => ({ workspace, baselineCombined, rules: de2026Rules, selectedScenarioId }),
    [workspace, baselineCombined, selectedScenarioId],
  )

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

            <section className="luecke-modal__solver" aria-labelledby="luecke-solver-heading">
              <h4 id="luecke-solver-heading">Oder: Wie viel müsste ich für meine Wunschrente sparen?</h4>
              {targetMonthly <= 0 ? (
                <p className="luecke-modal__note">
                  Dafür fehlt eine Wunschrente in deinem Plan. Lege sie unter „Deine Angaben“ fest,
                  dann rechnet dieser Schritt die nötige ETF-Sparrate aus.
                </p>
              ) : activeEtfs.length === 0 ? (
                <p className="luecke-modal__note">
                  Diese Rechnung braucht ein aktives ETF-Depot in deinem Plan. Ohne ETF-Depot
                  bleibt nur der Weg über das Budget oben.
                </p>
              ) : (
                <>
                  <p className="luecke-modal__note">
                    Rechnet für ein bestehendes ETF-Depot aus, welche Sparrate deine Wunschrente von{' '}
                    {formatCurrency(targetMonthly)} netto im Monat (heutige Euro) im Szenario{' '}
                    <strong>{scenario.label}</strong> ({formatPercent(scenario.annualReturn, 1)} p.a.)
                    erreicht. Andere Verträge bleiben unverändert.
                  </p>
                  {activeEtfs.length > 1 && (
                    <label className="field luecke-modal__solver-select">
                      <span>ETF-Depot</span>
                      <select
                        value={solverEtf?.instanceId ?? ''}
                        onChange={(event) => {
                          setSolverInstanceId(event.target.value)
                          setSolver({ kind: 'idle' })
                        }}
                      >
                        {activeEtfs.map((inst) => (
                          <option key={inst.instanceId} value={inst.instanceId}>
                            {inst.label?.trim() || inst.instanceId}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="luecke-modal__solver-actions">
                    <button type="button" className="luecke-modal__secondary" onClick={runSolver}>
                      Sparrate für meine Wunschrente berechnen
                    </button>
                  </div>
                  {solver.kind !== 'idle' && (
                    <div className="luecke-modal__solver-result" role="status" aria-live="polite">
                      {solver.kind === 'no-result' && (
                        <p className="luecke-modal__note">
                          Für diese Wunschrente ließ sich keine Sparrate bis 20.000 € im Monat finden,
                          oder in deinem Plan fehlen noch Angaben für eine Gesamtrente. Prüfe die
                          Wunschrente und die Angaben unter „Deine Angaben“.
                        </p>
                      )}
                      {solver.kind === 'met' && (
                        <p className="luecke-modal__note">
                          Dein Plan erreicht die Wunschrente im Szenario {scenario.label} bereits:{' '}
                          {formatCurrency(solver.achievedMonthlyReal)} netto im Monat in heutigen Euro.
                          Eine höhere Sparrate ist dafür rechnerisch nicht nötig.
                        </p>
                      )}
                      {solver.kind === 'solved' && solverEtf && (
                        <>
                          <dl className="luecke-modal__saved-summary-list">
                            <div>
                              <dt>Neue ETF-Sparrate gesamt</dt>
                              <dd>{formatCurrency(solver.result.monthlyContribution)} / Mon.</dd>
                            </div>
                            <div>
                              <dt>Davon zusätzlich</dt>
                              <dd>{formatCurrency(solver.result.additionalMonthly)} / Mon.</dd>
                            </div>
                            <div>
                              <dt>Netto-Rente gesamt (ganzer Plan)</dt>
                              <dd>{formatCurrency(solver.result.achievedMonthlyReal)} / Mon.</dd>
                            </div>
                            <div>
                              <dt>Szenario und Horizont</dt>
                              <dd>
                                {scenario.label} · {yearsUntilRetirement} Jahre bis {profile.retirementAge} ·
                                Entnahme bis Alter {wsa.retirementEndAge}
                              </dd>
                            </div>
                          </dl>
                          <p className="luecke-modal__note">
                            Rechnerisches Ergebnis für „{solverEtf.label?.trim() || 'ETF-Depot'}“ mit
                            denselben Annahmen wie eine gespeicherte Alternative, in heutigen Euro.
                            Es ist keine Beratung und keine Garantie; bei einer anderen Rendite fällt
                            die nötige Sparrate anders aus.
                          </p>
                          <div className="luecke-modal__solver-actions">
                            <button
                              type="button"
                              className="luecke-modal__secondary"
                              onClick={() => setBudget(solver.result.additionalMonthly)}
                            >
                              {formatCurrency(solver.result.additionalMonthly)} als Budget übernehmen
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

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
            <h3 {...stepHeadingTargetProps}>Alternative gespeichert</h3>
            <p className="luecke-modal__saved-summary">
              <strong>{savedCandidate.label}</strong> wurde als gespeicherte Alternative angelegt.
              Zu finden unter Mein Plan → Gespeicherte Alternativen.
            </p>
            {/* Audit F02: the confirmation renders the same shared rows as the
                card, so the numbers a user just saw cannot change here. */}
            <div className="luecke-modal__saved-figures">
              <CandidateFigureRows
                figures={candidateFigures(savedCandidate, figuresContext)}
                candidateLabel={savedCandidate.label}
              />
            </div>
            <FiguresBasisNote scenario={scenario} className="luecke-modal__note" />
            <p className="luecke-modal__note">
              Dein Hauptplan bleibt unverändert. Die Alternative wird erst Teil des Hauptplans,
              wenn du sie dort aktiv übernimmst.
            </p>
            <div className="luecke-modal__actions">
              <button
                ref={(el) => { firstFieldRef.current = el }}
                type="button"
                className="luecke-modal__secondary"
                onClick={() => {
                  setSavedCandidate(null)
                  setSavedId(null)
                  setStep('result')
                }}
              >
                Weitere Alternative speichern
              </button>
              {savedId !== null && onOpenSaved && (
                <button
                  type="button"
                  className="luecke-modal__secondary"
                  onClick={() => onOpenSaved(savedId)}
                >
                  Gespeicherte Alternative ansehen
                </button>
              )}
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
              portfolioFunding={portfolioFunding}
              grvGrossMonthlyPension={grvGrossMonthlyPension}
              marginalMonthlyEUR={safeBudget}
              bavOffer={bavOffer}
              selectedScenarioId={selectedScenarioId}
              onSaveAsPlan={(candidate) => {
                // Issue 68: do NOT close the modal silently. Persist the
                // candidate via the parent's onSaveAsPlan handler (which adds
                // a what-if scenario in App.tsx) and then show a confirmation
                // step. The user gets explicit feedback that the alternative
                // was saved and where to find it; closing the modal moves
                // them back to the dashboard. Save fires exactly once per
                // click; the returned id (if any) only enables the
                // "ansehen" button, it never triggers a second save.
                const returned = onSaveAsPlan(candidate)
                setSavedId(typeof returned === 'string' && returned.length > 0 ? returned : null)
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
  if (step === 'saved') return 'Alternative gespeichert'
  return 'Ergebnis'
}
