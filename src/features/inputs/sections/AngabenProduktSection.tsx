import type { Route } from '../../../app/useRoute'
import { ROUTES } from '../../../app/useRoute'
import { useCalculatorState } from '../../../app/useCalculatorState'
import { useScenarioLibrary } from '../../../app/useScenarioLibrary'
import { useSimulationResult } from '../../../app/useSimulationResult'
import { useWorkspaceUiState } from '../../../app/useWorkspaceUiState'
import { usePortfolioState } from '../../../app/portfolioState'
import type { AngabenStateMode } from '../../../app/useAngabenState'
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
 * The section is intentionally self-contained: it owns the simulation,
 * scenario-library, and UI-state hooks the panels need so `AngabenPage`
 * stays a thin orchestrator. The four pre-existing § sections still flow
 * through `useAngabenState`; this new section reads the mode AngabenPage
 * already pinned (via `detectSavedMode()` at mount) and branches between
 *
 *   - **compare-mode** → `<InputsPanel>` driven by `useCalculatorState` +
 *     `useScenarioLibrary` + `useSimulationResult` + `useWorkspaceUiState`.
 *   - **combine-mode** → `<CombineDashboardSidebar>` driven by
 *     `usePortfolioState`, plus the `<ContractDecisionMenu>` modal that
 *     `Calculator.tsx` formerly rendered next to the sidebar.
 *
 * The compare-mode branch mounts `useCalculatorState` alongside
 * `AngabenPage`'s `useAngabenState`. Both write to STORAGE_KEY_V1 on edit —
 * mirrors the pre-existing co-existence between `AngabenPage` and the
 * `Calculator` dashboard when the user navigates between routes. The combine
 * branch mounts `usePortfolioState` alongside `useAngabenState`'s ref-based
 * combine writer: each instance update goes through `patchBaseline` (here);
 * each profile / workspace-level assumption update goes through
 * `useAngabenState` (in the parent § 1 – § 4 sections). They share the same
 * `Workspace` shape and the same STORAGE_KEY_V2 envelope; last-effect-wins on
 * the rare overlap of simultaneous edits, consistent with how the two stores
 * behaved when they were on separate routes.
 */

interface Props {
  mode: AngabenStateMode
  navigate?: (target: Route) => void
  /** Section heading + § kicker — provided by the parent so the SECTIONS
   *  array stays the single source of truth for ordering and slug ids. */
  num: string
  id: string
  title: string
}

export function AngabenProduktSection({ mode, navigate, num, id, title }: Props) {
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
        <AngabenProduktCombineBody navigate={navigate} />
      ) : (
        <AngabenProduktCompareBody />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Compare-mode body — wraps <InputsPanel>.
// ---------------------------------------------------------------------------

function AngabenProduktCompareBody() {
  const {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    resetToDefaults,
    setSyncedMonthlyContribution,
  } = useCalculatorState()
  const ui = useWorkspaceUiState()
  const scenarioLib = useScenarioLibrary(profile, assumptions, setProfile, setAssumptions)
  const result = useSimulationResult(profile, assumptions, ui.selectedScenarioId)
  const { simulation, taxModes } = result

  // Mirror the slice of `useDerivedViews` that `<InputsPanel>` needs without
  // pulling in the full chart/table derivation cost — the panel only consumes
  // `selectedResults` + `insuranceResult` from that bundle.
  const visibleProducts = simulation.products.filter((r) =>
    assumptions.visibleProducts.includes(r.productId),
  )
  const selectedResults = visibleProducts
  const insuranceResult = simulation.products.find((r) => r.productId === 'versicherung') as
    | (typeof simulation.products)[number] & { productId: 'versicherung' }
    | undefined

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
      // Cast preserves the narrowed `InsuranceProductResult` shape — the
      // engine guarantees products with id 'versicherung' carry that type.
      insuranceResult={insuranceResult as never}
      tarifgebunden={ui.tarifgebunden}
      onTarifgebundenChange={ui.setTarifgebunden}
    />
  )
}

// ---------------------------------------------------------------------------
// Combine-mode body — wraps <CombineDashboardSidebar> + decision menu modal.
// ---------------------------------------------------------------------------

function AngabenProduktCombineBody({ navigate }: { navigate?: (target: Route) => void }) {
  const portfolioState = usePortfolioState()
  const [activeMenuInstanceId, setActiveMenuInstanceId] = useState<string | null>(null)

  return (
    <>
      <CombineDashboardSidebar
        baseline={portfolioState.baseline}
        assumptions={portfolioState.baseline.assumptions}
        whatIfs={portfolioState.whatIfs}
        onPatchAssumptions={(patch) =>
          portfolioState.patchBaseline({
            assumptions: { ...portfolioState.baseline.assumptions, ...patch },
          })
        }
        onPatchBaseline={portfolioState.patchBaseline}
        addInstance={portfolioState.addInstance}
        removeInstance={portfolioState.removeInstance}
        onRebaseWhatIf={portfolioState.rebaseWhatIf}
        onFreezeWhatIf={portfolioState.freezeWhatIf}
        onArchiveAndRestart={() => portfolioState.archiveAndRestart()}
        onOpenDecisionMenu={setActiveMenuInstanceId}
        onEditInstance={(_productId, instanceId) => {
          if (navigate) navigate(ROUTES.vertrag(instanceId))
        }}
      />
      {activeMenuInstanceId !== null && (
        <ContractDecisionMenu
          workspace={portfolioState.workspace}
          instanceId={activeMenuInstanceId}
          onClose={() => setActiveMenuInstanceId(null)}
          onCreatePlans={(whatIfs) => {
            whatIfs.forEach((wi) => portfolioState.addWhatIf(wi))
            setActiveMenuInstanceId(null)
          }}
        />
      )}
    </>
  )
}
