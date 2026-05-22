import type { Route } from '../../../app/useRoute'
import { ROUTES } from '../../../app/useRoute'
import type { InsuranceProductResult } from '../../../domain'
import { useScenarioLibrary } from '../../../app/useScenarioLibrary'
import { useSimulationResult } from '../../../app/useSimulationResult'
import { useWorkspaceUiState } from '../../../app/useWorkspaceUiState'
import { deriveSelectedResults } from '../../../app/simulationSelectors'
import type { UseAngabenStateApi } from '../../../app/useAngabenState'
import { useState } from 'react'
import { InputsPanel } from '../InputsPanel'
import { CombineDashboardSidebar } from '../../inventory/CombineDashboardSidebar'
import { ContractDecisionMenu } from '../../dashboard/ContractDecisionMenu'

/**
 * `§ 5 Produkt-Eingaben` (compare-mode) / `§ 5 Meine Verträge` (combine-mode)
 * for `/eingaben`. Folds the per-product input surfaces that used to live in
 * the workspace `angebot` tab (`Calculator.tsx`) into the Sober D § layout —
 * the workspace tab strip itself is being removed in the same PR.
 *
 * The section is intentionally state-thin: it receives the full
 * `UseAngabenStateApi` bundle from `AngabenPage` and consumes the slice that
 * matches the active mode. This is the post–Codex R2 P1 shape — earlier
 * revisions mounted a fresh `useCalculatorState()` / `usePortfolioState()`
 * here, but those second stores collided with the parent's `useAngabenState`
 * on the same storage envelope (STORAGE_KEY_V1 / STORAGE_KEY_V2) and caused
 * last-write-wins data loss: a § 1 profile edit followed by a § 5 setting
 * change would silently revert the § 1 edit because the § 5 store wrote a
 * stale snapshot. With ONE store per mode owned by `AngabenPage`, every
 * setter on this page goes through the same source of truth.
 *
 *   - **compare-mode** → `<InputsPanel>` driven by the section-owned
 *     `useScenarioLibrary` + `useSimulationResult` + `useWorkspaceUiState`
 *     (all read-only against `profile` / `assumptions` from props, or own
 *     separate storage keys, so no parallel-store risk).
 *   - **combine-mode** → `<CombineDashboardSidebar>` driven by the
 *     workspace mutators from the lifted `UseAngabenStateApi`, plus the
 *     `<ContractDecisionMenu>` modal that `Calculator.tsx` formerly
 *     rendered next to the sidebar.
 */

interface Props {
  angabenState: UseAngabenStateApi
  navigate?: (target: Route) => void
  /** Section heading + § kicker — provided by the parent so the SECTIONS
   *  array stays the single source of truth for ordering and slug ids. */
  num: string
  id: string
  title: string
}

export function AngabenProduktSection({ angabenState, navigate, num, id, title }: Props) {
  const mode = angabenState.mode
  return (
    <section className="angaben-section">
      <div className="angaben-section-head">
        <span className="angaben-section-num">{num}</span>
        <h2 id={id} className="angaben-section-title">
          {title}
        </h2>
      </div>
      <p className="angaben-section-lead">
        {mode === 'combine'
          ? 'Deine vorhandenen Verträge — Beiträge, Förderung und Auszahlungs­optionen je Vertrag.'
          : 'Produktspezifische Annahmen für den Vergleich — bAV, ETF, Versicherung, Riester, Basisrente und Altersvorsorgedepot.'}
      </p>

      {mode === 'combine' ? (
        <AngabenProduktCombineBody angabenState={angabenState} navigate={navigate} />
      ) : (
        <AngabenProduktCompareBody angabenState={angabenState} />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Compare-mode body — wraps <InputsPanel>.
// ---------------------------------------------------------------------------

function AngabenProduktCompareBody({ angabenState }: { angabenState: UseAngabenStateApi }) {
  const { profile, setProfile, assumptions, setAssumptions } = angabenState
  // Compare-mode-only convenience setters. The API field types are
  // `(...) => void | undefined`; in compare-mode they MUST be defined. We
  // narrow with a guard so a misconfigured caller (combine-mode body invoking
  // this compare-mode component by mistake) fails loud rather than silently
  // dispatching to undefined.
  const resetToDefaults = angabenState.resetToDefaults
  const setSyncedMonthlyContribution = angabenState.setSyncedMonthlyContribution
  if (!resetToDefaults || !setSyncedMonthlyContribution) {
    throw new Error(
      'AngabenProduktCompareBody requires compare-mode useAngabenState API',
    )
  }
  const ui = useWorkspaceUiState()
  const scenarioLib = useScenarioLibrary(profile, assumptions, setProfile, setAssumptions)
  const result = useSimulationResult(profile, assumptions, ui.selectedScenarioId)
  const { simulation, effectiveScenarioId, taxModes } = result

  // Mirror the slice of `useDerivedViews` that `<InputsPanel>` needs without
  // pulling in the full chart/table derivation cost — the panel only consumes
  // `selectedResults` + `insuranceResult` from that bundle.
  //
  // Codex R3 P1: `simulation.products` contains rows for ALL return scenarios
  // (konservativ + basis + optimistisch). Filtering by `visibleProducts` alone
  // surfaces whichever scenario happens to appear first — typically
  // `konservativ` — so a user who picks "Optimistisch" elsewhere and then edits
  // a product setting in § 5 sees stale `konservativ` numbers. We reuse the
  // pure `deriveSelectedResults` helper that drives `useDerivedViews` so the
  // panel binds against the same (active-scenario + visible-products + registry
  // order) slice every other surface uses.
  const selectedResults = deriveSelectedResults(
    simulation,
    assumptions.visibleProducts,
    effectiveScenarioId,
  )
  // `productId: 'versicherung'` discriminates the `ProductResult` union into
  // `InsuranceProductResult` — the engine guarantees this at construction
  // time. `find` does not narrow the union, so we annotate the local
  // explicitly to give `<InputsPanel>` the precise shape its prop type
  // declares (avoids an unsound `as never` cast). Filter to the active
  // scenario so the insurance result matches the rest of the panel.
  const insuranceResult: InsuranceProductResult | undefined = simulation.products.find(
    (r): r is InsuranceProductResult =>
      r.productId === 'versicherung' && r.scenarioId === effectiveScenarioId,
  )

  return (
    <InputsPanel
      profile={profile}
      onProfileChange={setProfile}
      assumptions={assumptions}
      onAssumptionsChange={setAssumptions}
      onSyncMonthlyContribution={setSyncedMonthlyContribution}
      resetToDefaults={resetToDefaults}
      simulation={simulation}
      selectedResults={selectedResults}
      scenarioLib={scenarioLib}
      kvdrMember={taxModes.kvdrMember}
      bavLumpSumTaxMode={taxModes.bavLumpSumTaxMode}
      insuranceTaxMode={taxModes.insuranceTaxMode}
      insuranceResult={insuranceResult}
      tarifgebunden={ui.tarifgebunden}
      onTarifgebundenChange={ui.setTarifgebunden}
    />
  )
}

// ---------------------------------------------------------------------------
// Combine-mode body — wraps <CombineDashboardSidebar> + decision menu modal.
// ---------------------------------------------------------------------------

function AngabenProduktCombineBody({
  angabenState,
  navigate,
}: {
  angabenState: UseAngabenStateApi
  navigate?: (target: Route) => void
}) {
  // Narrow the combine-mode-only slice. As with the compare-mode body, every
  // combine-mode field on `UseAngabenStateApi` is `T | undefined`. Throwing
  // here keeps the body component's downstream code free of repeated null
  // guards while still failing loud if the parent miswires modes.
  const {
    workspace,
    baseline,
    whatIfs,
    patchBaseline,
    addInstance,
    removeInstance,
    rebaseWhatIf,
    freezeWhatIf,
    archiveAndRestart,
    addWhatIf,
  } = angabenState
  if (
    !workspace ||
    !baseline ||
    !whatIfs ||
    !patchBaseline ||
    !addInstance ||
    !removeInstance ||
    !rebaseWhatIf ||
    !freezeWhatIf ||
    !archiveAndRestart ||
    !addWhatIf
  ) {
    throw new Error(
      'AngabenProduktCombineBody requires combine-mode useAngabenState API',
    )
  }
  const [activeMenuInstanceId, setActiveMenuInstanceId] = useState<string | null>(null)

  return (
    <>
      <CombineDashboardSidebar
        baseline={baseline}
        assumptions={baseline.assumptions}
        whatIfs={whatIfs}
        onPatchAssumptions={(patch) =>
          patchBaseline({
            assumptions: { ...baseline.assumptions, ...patch },
          })
        }
        onPatchBaseline={patchBaseline}
        addInstance={addInstance}
        removeInstance={removeInstance}
        onRebaseWhatIf={rebaseWhatIf}
        onFreezeWhatIf={freezeWhatIf}
        onArchiveAndRestart={() => {
          archiveAndRestart()
        }}
        onOpenDecisionMenu={setActiveMenuInstanceId}
        onEditInstance={(_productId, instanceId) => {
          if (navigate) navigate(ROUTES.vertrag(instanceId))
        }}
      />
      {activeMenuInstanceId !== null && (
        <ContractDecisionMenu
          workspace={workspace}
          instanceId={activeMenuInstanceId}
          onClose={() => setActiveMenuInstanceId(null)}
          onCreatePlans={(whatIfsList) => {
            whatIfsList.forEach((wi) => addWhatIf(wi))
            setActiveMenuInstanceId(null)
          }}
        />
      )}
    </>
  )
}
