import { useState } from 'react'
import './AngabenPage.css'
import './AngabenProduktePage.css'
import { LegalFooter } from '../legal/LegalFooter'
import { CombineDashboardSidebar } from '../inventory/CombineDashboardSidebar'
import { ContractDecisionMenu } from '../dashboard/ContractDecisionMenu'
import { ProdukteEingabenPanel } from '../produkte/ProdukteEingabenPanel'
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
import { deriveSelectedResults } from '../../app/simulationSelectors'
import type { InsuranceProductResult } from '../../domain'
import { buildStateJson } from '../../storage'
import { downloadJsonBlob } from '../../app/downloadJsonBlob'

/**
 * `/eingaben/produkte` — Schritt 2 of the two-page `/eingaben` wizard
 * (PR 2 of the Direction D redesign migration).
 *
 * Schritt 1 (`AngabenPage` at `/eingaben`) collects person / Einkommen /
 * Renteneintritt / Annahmen. This page hosts the per-contract input surface
 * that previously lived in § 5 ("Produkt-Eingaben" / "Meine Verträge")
 * of the single-page version.
 *
 * **PR 3 scope (compare-mode body rewrite).** The compare-mode branch now
 * mounts `<ProdukteEingabenPanel>` from `src/features/produkte/` — the new
 * Sober D Produkte family ported from the v3 design bundle. The combine-mode
 * body still wraps the legacy `<CombineDashboardSidebar>` + per-contract
 * `<ContractDecisionMenu>` modal — PR 4 will unify the two.
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
 * into the legacy panels.
 */

interface Props {
  navigate?: (target: Route) => void
  /** Lifted workspace UI store from `App.tsx`. Compare-mode consumes
   *  `selectedScenarioId` so the per-product surface binds to the active
   *  scenario; combine-mode ignores it. Optional so existing test call-sites
   *  (which mount the page without a lifted store) compile unchanged — when
   *  absent we fall back to a local `useWorkspaceUiState()` mount. */
  workspaceUi?: WorkspaceUiState
}

export function AngabenProduktePage({ navigate, workspaceUi }: Props) {
  const navigateOrNoop: (target: Route) => void = navigate ?? (() => {})

  // Fall back to a local `useWorkspaceUiState()` if the parent did not lift
  // one. Production (`App.tsx`) always passes the lifted store so the
  // selected scenario survives SPA navigation (Codex R5 P2). The fallback
  // keeps test call-sites that render `<AngabenProduktePage />` working.
  const localWorkspaceUi = useWorkspaceUiState()
  const effectiveWorkspaceUi = workspaceUi ?? localWorkspaceUi

  // Single source of truth — both pages of the /eingaben flow mount this
  // hook. NEVER mount a second `useCalculatorState` / `usePortfolioState`
  // here (Codex R2 P1 from prior PRs).
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
          {/* Center — page body. PR 2 hosts the legacy InputsPanel /
              CombineDashboardSidebar inside the new shell. */}
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

            {/* Footer button row — Zurück / Plan ansehen / JSON export.
                Mirrors AngabenPage's footer treatment for visual parity. */}
            <div className="angaben-footer">
              <button
                type="button"
                className="angaben-footer__btn angaben-footer__btn--primary"
                onClick={() => {
                  // Persist the current state before navigating so a first-time
                  // visitor who changed nothing still writes a saved-mode marker
                  // — otherwise App's detectSavedMode() returns null and `/`
                  // renders the landing page instead of the dashboard this CTA
                  // promises (Codex P2, PR #344).
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

          {/* Right rail — static for PR 2; PR 4 wires live "receipt strip".
              Two cards: documents-needed checklist and out-of-scope notes. */}
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

            {/* Static placeholder receipt strip for PR 2 — PR 4 wires live
                "lastEditedAt" + storage-status data once the workspace
                surface settles on this page. */}
            <p className="angaben-produkte-receipt">
              Verträge erfasst · zuletzt geändert vor wenigen Minuten ·
              gespeichert im Browser
            </p>
          </aside>
        </div>
      </div>

      <LegalFooter navigate={navigateOrNoop} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compare-mode body — wraps the legacy <InputsPanel>. Lifted from the
// deleted `AngabenProduktSection.tsx`; PR 3 will replace the panel with new
// Sober D Produkte components.
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
  // Compare-mode-only convenience setters. The API field types are
  // `(...) => void | undefined`; in compare-mode they MUST be defined. We
  // narrow with a guard so a misconfigured caller (combine-mode body invoking
  // this compare-mode component by mistake) fails loud rather than silently
  // dispatching to undefined.
  const resetToDefaults = angabenState.resetToDefaults
  const setSyncedMonthlyContribution = angabenState.setSyncedMonthlyContribution
  if (!resetToDefaults || !setSyncedMonthlyContribution) {
    throw new Error(
      'AngabenProduktePage CompareBody requires compare-mode useAngabenState API',
    )
  }
  const ui = workspaceUi
  // PR 3: `useScenarioLibrary` no longer mounts here. The library moved to
  // Schritt 1 § 4 Annahmen alongside `<NettoBelastungControl>` so the
  // scenario-load surface is available before the user reaches the
  // per-product Schritt 2 view.
  const result = useSimulationResult(profile, assumptions, ui.selectedScenarioId)
  const { simulation, effectiveScenarioId, taxModes } = result

  // Codex R3 P1: filter `simulation.products` by both `visibleProducts` AND
  // active scenario so the panel does not pick up the first-in-array (often
  // `konservativ`) row when the user picked Optimistisch elsewhere.
  const selectedResults = deriveSelectedResults(
    simulation,
    assumptions.visibleProducts,
    effectiveScenarioId,
  )
  const insuranceResult: InsuranceProductResult | undefined = simulation.products.find(
    (r): r is InsuranceProductResult =>
      r.productId === 'versicherung' && r.scenarioId === effectiveScenarioId,
  )

  // `resetToDefaults` is wired into AngabenPage's footer (Schritt 1) and is
  // not surfaced inside the panel for PR 3 — silence the unused-binding lint
  // by referencing it. PR 4 may relocate the reset affordance into the
  // panel's right-rail.
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
// Combine-mode body — wraps the legacy CombineDashboardSidebar + the
// per-contract decision menu modal. Lifted from the deleted section file.
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
      'AngabenProduktePage CombineBody requires combine-mode useAngabenState API',
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
