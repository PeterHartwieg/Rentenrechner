import { useMemo, useState } from 'react'
import './AngabenPage.css'
import './AngabenProduktePage.css'
import { LegalFooter } from '../legal/LegalFooter'
import { ContractDecisionMenu } from '../dashboard/ContractDecisionMenu'
import { ProdukteEingabenPanel } from '../produkte/ProdukteEingabenPanel'
import { CombineHaushaltSection } from '../produkte/CombineHaushaltSection'
import { CombineWhatIfSection } from '../produkte/CombineWhatIfSection'
import { GlossaryPanel } from './GlossaryPanel'
import { DStepIndicator } from './DStepIndicator'
import type { Route } from '../../app/useRoute'
import { ROUTES } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import {
  useAngabenState,
  type UseAngabenStateApi,
} from '../../app/useAngabenState'
import { useWorkspaceUiState, type WorkspaceUiState } from '../../app/useWorkspaceUiState'
import { useSimulationResult } from '../../app/useSimulationResult'
import { useCombineSimulation } from '../../app/useCombineSimulation'
import { deriveSelectedResults } from '../../app/simulationSelectors'
import type { InsuranceProductResult } from '../../domain'
import { buildStateJson } from '../../storage'
import { downloadJsonBlob } from '../../app/downloadJsonBlob'
import { formatRelativeTime } from '../../utils/format'
import { useNowSnapshot } from './useNowSnapshot'

/**
 * `/eingaben/produkte` — Schritt 2 of the two-page `/eingaben` wizard.
 *
 * Schritt 1 (`AngabenPage` at `/eingaben`) collects person / Einkommen /
 * Renteneintritt / Annahmen. This page hosts the per-contract input surface
 * that previously lived in § 5 ("Produkt-Eingaben" / "Meine Verträge")
 * of the single-page version.
 *
 * **PR 4 scope (combine-mode unification).** Both compare-mode AND
 * combine-mode branches now mount `<ProdukteEingabenPanel>` from
 * `src/features/produkte/` — the new Sober D Produkte family ported from the
 * v3 design bundle. The combine branch passes through the workspace
 * `baseline.assumptions` instance arrays and wires the per-instance
 * "Bearbeiten" CTA to `ROUTES.vertrag(:instanceId)` plus the "Weitere
 * Optionen" kebab to the page-hosted `<ContractDecisionMenu>` modal. The
 * legacy `<CombineDashboardSidebar>` (with its per-card editing UI) is
 * retired in this PR.
 *
 * The `<GlossaryPanel>` lives at the bottom of the article (above
 * `<LegalFooter>`) inside a single `<details>` disclosure. It used to live
 * inside `<InputsPanel>`; this page is the appropriate host because the
 * glossary is page-scope context, not panel-scope.
 *
 * **Architectural invariant: one `useAngabenState` per page.** Both Schritt 1
 * and Schritt 2 mount this hook directly and rely on localStorage to
 * round-trip edits between the pages. We must NEVER mount a second
 * `useCalculatorState` / `usePortfolioState` here — that was the Codex R2 P1
 * finding on PR #322 (parallel stores caused last-write-wins data loss when
 * a § 1 profile edit on the previous page was clobbered by a § 5 product
 * edit). The deleted `sections/AngabenProduktSection.tsx` carried the long
 * comment explaining the bug class; we preserve the invariant here by
 * consuming `useAngabenState` exactly once and threading the relevant slice
 * into the panel.
 *
 * Receipt strip (right-rail bottom) is mode-aware (PR 4):
 *   - combine-mode: live "{N} Verträge erfasst · zuletzt geändert vor {X} ·
 *     gespeichert im Browser" derived from
 *     `workspace.baseline.assumptions` instance arrays +
 *     `workspace.baseline.lastEditedAt`.
 *   - compare-mode: hidden (the singleton state model does not have a
 *     contract count or per-edit timestamp; if a future iteration wants a
 *     "saved at" stamp for compare-mode we'll add it as a separate metric).
 */

interface Props {
  navigate?: (target: Route) => void
  workspaceUi?: WorkspaceUiState
}

export function AngabenProduktePage({ navigate, workspaceUi }: Props) {
  const navigateOrNoop: (target: Route) => void = navigate ?? (() => {})

  const localWorkspaceUi = useWorkspaceUiState()
  const effectiveWorkspaceUi = workspaceUi ?? localWorkspaceUi

  const angabenState = useAngabenState()
  const { profile, assumptions, mode, workspace } = angabenState

  return (
    <div className="angaben-shell">
      <div className="angaben-main">
        <nav className="angaben-breadcrumb" aria-label="Pfad">
          <a
            href="/"
            className="angaben-breadcrumb-back"
            onClick={(event) => {
              if (!navigate) return
              if (!shouldUseSpaNavigation(event)) return
              event.preventDefault()
              navigate(ROUTES.home)
            }}
          >
            Startseite
          </a>
          <span className="angaben-breadcrumb-sep" aria-hidden="true">›</span>
          <span className="angaben-breadcrumb-cluster">Verträge</span>
        </nav>

        <div className="angaben-grid angaben-grid--produkte">
          <article className="angaben-body">
            <div className="angaben-kicker">Mein Plan · Schritt 2 von 2</div>
            <DStepIndicator current={2} />
            <h1 className="angaben-headline">Deine Verträge und Sparformen</h1>
            <p className="angaben-summary">
              Erfasse hier alle Verträge, die du heute schon hast — gesetzliche
              Rente, ETF-Sparpläne, Betriebs- oder Privatrenten. Fehlt eine
              Sparform, lässt du sie einfach weg. Du kannst Einträge jederzeit
              ergänzen oder entfernen. Auch nur die gesetzliche Rente ist ein
              gültiger Stand — wir zeigen dir dann, was üblicherweise fehlt.
            </p>

            <div className="angaben-produkte-body">
              {mode === 'combine' ? (
                <CombineBody angabenState={angabenState} navigate={navigate} />
              ) : (
                <CompareBody
                  angabenState={angabenState}
                  workspaceUi={effectiveWorkspaceUi}
                />
              )}
            </div>

            <div className="angaben-footer">
              <button
                type="button"
                className="angaben-footer__btn angaben-footer__btn--primary"
                onClick={() => {
                  angabenState.persistNow()
                  navigate?.(ROUTES.home)
                }}
              >
                Speichern und Plan ansehen
              </button>
              <button
                type="button"
                className="angaben-footer__btn angaben-footer__btn--secondary"
                onClick={() => navigate?.(ROUTES.eingaben)}
              >
                ← Zurück zu Schritt 1
              </button>
              <button
                type="button"
                className="angaben-footer__btn angaben-footer__btn--export"
                onClick={() => {
                  const json = mode === 'combine' && workspace
                    ? JSON.stringify(workspace, null, 2)
                    : buildStateJson(profile, assumptions)
                  const filename = mode === 'combine' ? 'rentenwiki-workspace.json' : 'rentenwiki-export.json'
                  downloadJsonBlob(json, filename)
                }}
              >
                Als JSON exportieren ↓
              </button>
            </div>

            {/* Glossary — relocated from the bottom of <InputsPanel> in PR 3.
                Schritt 2 is the appropriate host because the glossary is
                page-scope context (compare and combine both want to reach
                it), not panel-scope. Single `<details>` so the body stays
                collapsed by default. Compare-mode only: combine-mode users
                land on the workspace sidebar, which carries its own
                contextual help, so we gate the disclosure on mode. */}
            {mode === 'compare' && (
              <details className="angaben-produkte-glossar">
                <summary className="angaben-produkte-glossar__summary">
                  Glossar einblenden
                </summary>
                <GlossaryPanel />
              </details>
            )}
          </article>

          {/* Right rail — documents checklist + out-of-scope notes + the
              mode-aware receipt strip. PR 4 wires the strip to live workspace
              data (instance count + lastEditedAt) in combine-mode and hides
              it in compare-mode (singleton state model has no contract count
              metric). */}
          <aside className="angaben-aside">
            <div className="angaben-aside-card">
              <div className="angaben-aside-kicker">
                Welche Unterlagen du brauchst
              </div>
              <ul className="angaben-aside-list">
                <li className="angaben-aside-list-item">
                  <span className="angaben-aside-list-key">DRV-Rentenauskunft</span>
                  <span className="angaben-aside-list-val">
                    jährlich per Post, oder online bei eservice-drv.de.
                  </span>
                </li>
                <li className="angaben-aside-list-item">
                  <span className="angaben-aside-list-key">Vertragsunterlagen</span>
                  <span className="angaben-aside-list-val">
                    Sparrate, Kosten, Beginn — meist Seite 1 der Police.
                  </span>
                </li>
                <li className="angaben-aside-list-item">
                  <span className="angaben-aside-list-key">Depot-Kontoauszug</span>
                  <span className="angaben-aside-list-val">
                    für ISIN und aktuelle Sparrate.
                  </span>
                </li>
                <li className="angaben-aside-list-item">
                  <span className="angaben-aside-list-key">bAV-Bescheinigung</span>
                  <span className="angaben-aside-list-val">
                    vom Arbeitgeber oder Versorgungsträger.
                  </span>
                </li>
              </ul>
            </div>

            <div className="angaben-aside-card">
              <div className="angaben-aside-kicker">
                Was wir hier nicht abfragen
              </div>
              <ul className="angaben-produkte-exclude-list">
                <li className="angaben-produkte-exclude-item">
                  <span className="angaben-produkte-exclude-mark" aria-hidden="true">×</span>
                  Bestandstarife mit Garantiezins vor 2005
                </li>
                <li className="angaben-produkte-exclude-item">
                  <span className="angaben-produkte-exclude-mark" aria-hidden="true">×</span>
                  Im Ausland bestehende Verträge
                </li>
                <li className="angaben-produkte-exclude-item">
                  <span className="angaben-produkte-exclude-mark" aria-hidden="true">×</span>
                  Erbschaften oder erwartete Schenkungen
                </li>
                <li className="angaben-produkte-exclude-item">
                  <span className="angaben-produkte-exclude-mark" aria-hidden="true">×</span>
                  Kapitalbildende Lebensversicherungen (Schicht 4)
                </li>
              </ul>
            </div>

            {mode === 'combine' && workspace && (
              <ReceiptStrip workspace={workspace} />
            )}
          </aside>
        </div>
      </div>

      <LegalFooter navigate={navigateOrNoop} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compare-mode body — mounts the new ProdukteEingabenPanel in compare mode.
// ---------------------------------------------------------------------------

interface CompareBodyProps {
  angabenState: UseAngabenStateApi
  workspaceUi: WorkspaceUiState
}

function CompareBody({
  angabenState,
  workspaceUi,
}: CompareBodyProps) {
  const { profile, setProfile, assumptions, setAssumptions } = angabenState
  const resetToDefaults = angabenState.resetToDefaults
  const setSyncedMonthlyContribution = angabenState.setSyncedMonthlyContribution
  if (!resetToDefaults || !setSyncedMonthlyContribution) {
    throw new Error(
      'AngabenProduktePage CompareBody requires compare-mode useAngabenState API',
    )
  }
  const ui = workspaceUi
  const result = useSimulationResult(profile, assumptions, ui.selectedScenarioId)
  const { simulation, effectiveScenarioId, taxModes } = result

  const selectedResults = deriveSelectedResults(
    simulation,
    assumptions.visibleProducts,
    effectiveScenarioId,
  )
  const insuranceResult: InsuranceProductResult | undefined = simulation.products.find(
    (r): r is InsuranceProductResult =>
      r.productId === 'versicherung' && r.scenarioId === effectiveScenarioId,
  )

  void resetToDefaults
  return (
    <ProdukteEingabenPanel
      mode="compare"
      profile={profile}
      onProfileChange={setProfile}
      assumptions={assumptions}
      onAssumptionsChange={setAssumptions}
      onSyncMonthlyContribution={setSyncedMonthlyContribution}
      simulation={simulation}
      selectedResults={selectedResults}
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
// Combine-mode body — PR 4 swaps the legacy <CombineDashboardSidebar> for
// the new <ProdukteEingabenPanel mode="combine"> and re-hosts the
// <ContractDecisionMenu> modal at the page level.
// ---------------------------------------------------------------------------

interface CombineBodyProps {
  angabenState: UseAngabenStateApi
  navigate?: (target: Route) => void
}

function CombineBody({
  angabenState,
  navigate,
}: CombineBodyProps) {
  const {
    workspace,
    baseline,
    whatIfs,
    addInstance,
    removeInstance,
    patchBaseline,
    addWhatIf,
    rebaseWhatIf,
    freezeWhatIf,
    archiveAndRestart,
  } = angabenState
  if (
    !workspace ||
    !baseline ||
    !whatIfs ||
    !addInstance ||
    !removeInstance ||
    !patchBaseline ||
    !addWhatIf ||
    !rebaseWhatIf ||
    !freezeWhatIf ||
    !archiveAndRestart
  ) {
    throw new Error(
      'AngabenProduktePage CombineBody requires combine-mode useAngabenState API',
    )
  }
  // Modal state — held at the page level so the ContractDecisionMenu can be
  // re-hosted outside the panel. Matches the pre-PR-4 pattern.
  const [activeMenuInstanceId, setActiveMenuInstanceId] = useState<string | null>(null)

  // Combine-mode statutory-pension projection. The new panel only needs the
  // gross monthly + projected EP for the § 1 DRV card; the rest of the
  // combine-mode result drives Mein Plan elsewhere. We compute it here so
  // the page can pass the slice into the panel without making the panel
  // mount its own simulation hook.
  const combineSimulation = useCombineSimulation(workspace)

  // Whether the workspace holds any contracts — gates the archive-and-restart
  // affordance (there must be something to archive).
  const a = baseline.assumptions
  const hasContracts =
    a.bav.length +
      a.etf.length +
      a.insurance.length +
      a.basisrente.length +
      a.altersvorsorgedepot.length +
      a.riester.length >
    0

  return (
    <>
      <ProdukteEingabenPanel
        mode="combine"
        baseline={baseline}
        assumptions={baseline.assumptions}
        statutoryPensionResult={combineSimulation.statutoryPension}
        onPatchBaseline={patchBaseline}
        addInstance={addInstance}
        removeInstance={removeInstance}
        onEditInstance={(_productId, instanceId) => {
          if (navigate) navigate(ROUTES.vertrag(instanceId))
        }}
        onOpenDecisionMenu={setActiveMenuInstanceId}
      />
      <CombineHaushaltSection baseline={baseline} onPatchBaseline={patchBaseline} />
      <CombineWhatIfSection
        whatIfs={whatIfs}
        baselineLastEditedAt={baseline.lastEditedAt}
        hasContracts={hasContracts}
        onRebase={rebaseWhatIf}
        onFreeze={freezeWhatIf}
        onArchiveAndRestart={archiveAndRestart}
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

// ---------------------------------------------------------------------------
// Receipt strip — live data only in combine-mode.
// ---------------------------------------------------------------------------

interface ReceiptStripProps {
  workspace: NonNullable<UseAngabenStateApi['workspace']>
}

function ReceiptStrip({ workspace }: ReceiptStripProps) {
  // Compute the live instance count from the workspace baseline. We re-derive
  // on every render so a freshly-added instance is immediately reflected — the
  // workspace is the source of truth and re-renders are cheap.
  const instanceCount = useMemo(() => {
    const a = workspace.baseline.assumptions
    return (
      a.bav.length +
      a.etf.length +
      a.insurance.length +
      a.basisrente.length +
      a.altersvorsorgedepot.length +
      a.riester.length
    )
  }, [workspace.baseline.assumptions])

  // Snapshot "now" via a `useSyncExternalStore` subscription so the render
  // function itself never calls `Date.now()`. The snapshot refreshes on every
  // `lastEditedAt` change (see `useNowSnapshot` below).
  const lastEditedAt = workspace.baseline.lastEditedAt
  const renderTime = useNowSnapshot(lastEditedAt)

  // When the baseline has never been edited (fresh default workspace) we
  // surface "soeben" — same string formatRelativeTime returns for the
  // 0-ms case, so the user sees a consistent stamp even before they've
  // made any edits.
  const elapsedMs =
    lastEditedAt !== undefined ? renderTime - lastEditedAt : 0
  const relativeTime = formatRelativeTime(elapsedMs)

  return (
    <p
      className="angaben-produkte-receipt"
      data-testid="angaben-produkte-receipt"
    >
      {`${instanceCount} ${instanceCount === 1 ? 'Vertrag' : 'Verträge'} erfasst · zuletzt geändert ${relativeTime} · gespeichert im Browser`}
    </p>
  )
}

// `useNowSnapshot` — React-pure "current time" hook for the receipt strip.
// Lives in `./useNowSnapshot.ts` so the `react-refresh/only-export-components`
// lint on this page-component module stays happy.
