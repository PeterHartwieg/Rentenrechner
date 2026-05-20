import { useEffect, useMemo, useState } from 'react'
import './KapitalPage.css'
import type { Route } from '../../app/useRoute'
import { ROUTES, routeToPath } from '../../app/useRoute'
import { shouldUseSpaNavigation } from '../../app/spaNavigation'
import { usePortfolioState } from '../../app/portfolioState'
import { useCombineSimulation } from '../../app/useCombineSimulation'
import { useCalculatorState } from '../../app/useCalculatorState'
import { useSimulationResult } from '../../app/useSimulationResult'
import { de2026Rules } from '../../rules/de2026'
import { projectGrvContributionTimeline } from '../../engine/grv'
import { BreakEvenChart } from '../results/BreakEvenChart'
import { buildLifecycleLineSeries } from '../results/breakEvenSeries'
import { LIFECYCLE_HORIZON_AGE } from '../results/lifecycleHorizon'
import { KapitalFilterChips } from './KapitalFilterChips'
import { KapitalWendepunkteTable } from './KapitalWendepunkteTable'
import { buildWendepunkte } from './wendepunkte'
import {
  buildChartColorMap,
  buildCombineChipOptions,
  buildCompareChipOptions,
  resolveActiveChipId,
  type KapitalChipOption,
} from './kapitalFilters'

interface Props {
  /** SPA navigator threaded from `App.tsx`. Used by the back-link. */
  navigate: (target: Route) => void
}

const SECTION_WENDEPUNKTE = {
  id: 'kapital-wendepunkte',
  n: '§ 1',
  title: 'Wendepunkte im Verlauf',
}

// ---------------------------------------------------------------------------
// KapitalPage — `/kapital` route, PR 8.
//
// Full-page lifecycle chart + Wendepunkte table. Dual-source: the same page
// renders for both compare-mode (per-product) and combine-mode
// (per-instance-aggregated) selections. The page-level filter chips replace
// `BreakEvenChart`'s internal product picker (the chart is rendered with
// `showPicker={false}`) so there is one filter row, not two.
//
// State scope: hooks are called unconditionally and BOTH compare-mode and
// combine-mode simulations run on every render. The branch on
// `workspace.mode` picks which output to use — the unused simulation pass
// is cheap (it's a memoised useMemo) but it does run. Acceptable trade-off
// for keeping the Rules of Hooks contract simple.
//
// Empty states: the page does NOT show a "wrong mode" empty state — both
// modes have a renderable surface. When neither mode has any contracts /
// visible products, the chips list collapses and a single empty-state
// paragraph guides the user to add data on `/eingaben`.
// ---------------------------------------------------------------------------

export function KapitalPage({ navigate }: Props) {
  // ---- 1. Hook prelude — runs unconditionally. ----------------------------
  const portfolioState = usePortfolioState()
  const workspace = portfolioState.workspace
  const compareState = useCalculatorState()

  // Both simulations run on every render (cheap, memoised). The unused one
  // is dropped in the render branch below.
  const combineSimulation = useCombineSimulation(workspace)
  const compareSimulation = useSimulationResult(
    compareState.profile,
    compareState.assumptions,
    // Compare-mode uses its own basis-pinned scenario id; we deliberately
    // don't share `combineSimulation`'s selection because compare and
    // combine workspaces have independent scenario sets.
    pickBasisScenarioId(compareState.assumptions.returnScenarios),
  )

  // Doc title — `/kapital` is not in `publicRouteRegistry` (it's a tool-
  // internal surface, not a landing page) so `useRoute`'s title effect
  // cannot set it. Run before any conditional return.
  useEffect(() => {
    document.title = 'Kapital & Auszahlungen | RentenWiki.de'
  }, [])

  // ---- 2. Mode-specific data sourcing. ------------------------------------
  // `workspace.mode` is the canonical mode signal (PR 286 hardening); do NOT
  // fall back to `detectSavedMode()`.
  const isCombine = workspace.mode === 'combine'

  const scenarioId = useMemo(() => {
    const scenarios = workspace.baseline.assumptions.returnScenarios
    return pickBasisScenarioId(scenarios)
  }, [workspace.baseline.assumptions.returnScenarios])

  const combineChipBundle = useMemo(() => {
    if (!isCombine) return { options: [] as KapitalChipOption[] }
    return buildCombineChipOptions({
      workspace,
      perInstance: combineSimulation.perInstance,
      scenarioId,
    })
  }, [isCombine, workspace, combineSimulation.perInstance, scenarioId])

  const compareChipOptions = useMemo(() => {
    if (isCombine) return [] as KapitalChipOption[]
    // `simulation.products` is flat — one entry per (product × scenario).
    // Filter to the basis scenario so the chart and Wendepunkte align with
    // the single-scenario picker convention used elsewhere in the redesign.
    const compareScenarioId = pickBasisScenarioId(compareState.assumptions.returnScenarios)
    return buildCompareChipOptions({
      assumptions: compareState.assumptions,
      productResults: compareSimulation.simulation.products.filter(
        (p) => p.scenarioId === compareScenarioId,
      ),
    })
  }, [
    isCombine,
    compareState.assumptions,
    compareSimulation.simulation.products,
  ])

  const chipOptions = isCombine ? combineChipBundle.options : compareChipOptions

  // ---- 3. Active chip selection (local UI state). -------------------------
  const [pickedChipId, setPickedChipId] = useState<string | null>(null)
  const activeChipId = resolveActiveChipId(chipOptions, pickedChipId)
  const activeChip = chipOptions.find((c) => c.id === activeChipId) ?? null

  // ---- 4. Profile / assumptions for chart axes. ---------------------------
  // Combine-mode reads from the workspace; compare-mode from the singleton.
  const profile = isCombine ? workspace.baseline.profile : compareState.profile
  const retirementEndAge = isCombine
    ? workspace.baseline.assumptions.retirementEndAge
    : compareState.assumptions.retirementEndAge

  const horizonAge = Math.max(LIFECYCLE_HORIZON_AGE, retirementEndAge)

  // GRV contribution timeline + statutory pension — pulled from whichever
  // mode is active so the chart's "GRV Netto-Einzahlung" + "GRV Netto-
  // Auszahlung" overlays render with the right baseline.
  const grvContributionTimeline = useMemo(() => {
    if (isCombine) {
      // Combine-mode: re-derive the timeline from the workspace's bAV slot
      // by passing the aggregate GRV reduction. The combine simulation
      // already accounts for the apportionment in its statutoryPension
      // projection, but the contribution timeline helper takes a single
      // annual reduction figure so we reconstruct it here.
      const bavReductionAnnual = workspace.baseline.assumptions.bav.reduce(
        (sum, instance) => {
          if (instance.status === 'surrendered' || instance.status === 'offered') return sum
          const funding = combineSimulation.portfolioFunding.bavByInstanceId[instance.instanceId]
          return sum + (funding?.estimatedMonthlyGrvReduction ?? 0) * 12
        },
        0,
      )
      return projectGrvContributionTimeline(
        workspace.baseline.profile,
        de2026Rules,
        workspace.baseline.assumptions.statutoryPension,
        bavReductionAnnual,
      )
    }
    return projectGrvContributionTimeline(
      compareState.profile,
      de2026Rules,
      compareState.assumptions.statutoryPension,
      (compareSimulation.simulation.bavFunding.estimatedMonthlyGrvReduction ?? 0) * 12,
    )
  }, [
    isCombine,
    workspace.baseline.profile,
    workspace.baseline.assumptions.statutoryPension,
    workspace.baseline.assumptions.bav,
    combineSimulation.portfolioFunding.bavByInstanceId,
    compareState.profile,
    compareState.assumptions.statutoryPension,
    compareSimulation.simulation.bavFunding.estimatedMonthlyGrvReduction,
  ])

  const grvNetMonthly = isCombine
    ? combineSimulation.statutoryPension.netMonthlyPension
    : compareSimulation.simulation.statutoryPension.netMonthlyPension
  const pensionBaselineType = isCombine
    ? workspace.baseline.assumptions.statutoryPension.pensionBaselineType
    : compareState.assumptions.statutoryPension.pensionBaselineType

  // ---- 5. Lifecycle data + Wendepunkte rows for the active chip. ----------
  // `selectedResults` is wrapped in useMemo so the dependent useMemos below
  // (data, wendepunkte, productColors) do not re-evaluate on every render
  // — `activeChip?.results ?? []` would otherwise produce a fresh `[]`
  // identity each time when no chip is active.
  const selectedResults = useMemo(
    () => activeChip?.results ?? [],
    [activeChip],
  )
  const data = useMemo(
    () => buildLifecycleLineSeries(selectedResults, profile.age, profile.retirementAge, horizonAge),
    [selectedResults, profile.age, profile.retirementAge, horizonAge],
  )
  const wendepunkte = useMemo(
    () =>
      buildWendepunkte({
        selectedResults,
        data,
        startAge: profile.age,
        retirementAge: profile.retirementAge,
        retirementEndAge,
      }),
    [selectedResults, data, profile.age, profile.retirementAge, retirementEndAge],
  )

  const productColors = useMemo(() => buildChartColorMap(selectedResults), [selectedResults])

  // ---- 6. Render. ---------------------------------------------------------
  return (
    <div className="kapital-shell">
      <div className="kapital-main">
        <article className="kapital-body">
          <div className="kapital-kicker">
            Mein Plan › Verlauf {profile.age} → {horizonAge}
          </div>
          <h1 className="kapital-headline">Kapital und Auszahlungen über das Leben</h1>
          <div className="kapital-backline">
            <a
              href={routeToPath(ROUTES.home)}
              className="kapital-backlink"
              onClick={(event) => {
                if (!shouldUseSpaNavigation(event)) return
                event.preventDefault()
                navigate(ROUTES.home)
              }}
            >
              ← Zurück zum Plan
            </a>
          </div>

          {chipOptions.length === 0 ? (
            <p className="kapital-empty">
              Noch keine Verträge oder Produkte ausgewählt. Lege deinen Plan auf{' '}
              <a
                href={routeToPath(ROUTES.eingaben)}
                onClick={(event) => {
                  if (!shouldUseSpaNavigation(event)) return
                  event.preventDefault()
                  navigate(ROUTES.eingaben)
                }}
              >
                Deine Angaben
              </a>
              {' '}an, um die Kapital-Auszahlung zu sehen.
            </p>
          ) : (
            <>
              <KapitalFilterChips
                options={chipOptions}
                activeId={activeChipId}
                onSelect={setPickedChipId}
              />

              <div className="kapital-chart-wrap">
                <BreakEvenChart
                  selectedResults={selectedResults}
                  productColors={productColors}
                  startAge={profile.age}
                  retirementAge={profile.retirementAge}
                  retirementEndAge={retirementEndAge}
                  singleSelection
                  showPicker={false}
                  grvNetMonthlyPension={grvNetMonthly}
                  grvContributionTimeline={grvContributionTimeline}
                  pensionBaselineType={pensionBaselineType}
                />
              </div>

              <section
                className="kapital-section"
                aria-labelledby={SECTION_WENDEPUNKTE.id}
              >
                <div className="kapital-section-head">
                  <span className="kapital-section-num">{SECTION_WENDEPUNKTE.n}</span>
                  <h2 id={SECTION_WENDEPUNKTE.id} className="kapital-section-title">
                    {SECTION_WENDEPUNKTE.title}
                  </h2>
                </div>
                <KapitalWendepunkteTable rows={wendepunkte} />
              </section>
            </>
          )}
        </article>
      </div>
    </div>
  )
}

/**
 * Resolve the basis scenario id from a workspace's `returnScenarios` array.
 * Defensive in two ways: first `find('basis')`, then fall back to the first
 * scenario, then a literal `'basis'` string for the degenerate empty-array
 * case. The CLAUDE.md "returnScenarios[0] is not necessarily basis" gotcha
 * notes that indexing by position picks `konservativ` (3 %) over `basis`
 * (5 %), so the `find` pass is required.
 */
function pickBasisScenarioId(
  scenarios: ReadonlyArray<{ id: string }>,
): string {
  return scenarios.find((s) => s.id === 'basis')?.id ?? scenarios[0]?.id ?? 'basis'
}
