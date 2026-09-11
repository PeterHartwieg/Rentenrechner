// ---------------------------------------------------------------------------
// VergleichJourneyPage — container for `/vergleich` (simplification 2C).
//
// This file is *plumbing only*. It resolves state, wires the handlers and
// hands a typed `VergleichJourneyControls` object to the presentation layer.
// VergleichJourneyView owns setup/result navigation and presentation; all
// compare-state handlers below stay in this container.
//
// Two invariants this container exists to hold:
//
//  1. **It never touches the combine workspace.** `/vergleich` reads and
//     writes the compare-mode singleton state (`useCalculatorState`, persisted
//     under `STORAGE_KEY_V1`) and never calls `portfolioState.setMode` or any
//     workspace mutator. Seeding from the plan is explicit, one-way and
//     user-initiated (`seedFromPlan`), per the lead decision "Comparison
//     without a plan".
//  2. **Only selected products render and export.** `selectedProducts` is
//     `assumptions.visibleProducts`; the table, the print mirror and the CSV
//     all consume the same filtered product set, so the file always matches
//     the screen.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PersonalProfile, ProductId } from '../../domain'
import type { Route } from '../../app/useRoute'
import { useCalculatorState } from '../../app/useCalculatorState'
import { useSimulationResult } from '../../app/useSimulationResult'
import { buildAllProductsSimulation } from '../../app/buildAllProductsSimulation'
import { seedCompareFromWorkspace } from '../../app/compareSeed'
import { loadSavedWorkspace } from '../../storage'
import { hasStartedPlan } from '../../app/portfolioState'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { de2026Rules } from '../../rules/de2026'
import { buildExportCsv, downloadCsv } from '../../utils/csvExport'
import { buildShareUrl } from '../../utils/urlShare'
import type { LandingChoice } from '../landing/LandingPage'
import { PrintReport } from '../results/PrintReport'
import { VergleichPage } from './VergleichPage'
import { VergleichJourneyView } from './VergleichJourneyView'
import { profileDiffersFrom, type PlanProfileSummary } from './planProfileSummary'

/**
 * The control surface the `/vergleich` presentation layer consumes. Every
 * field is resolved by this container; the UI never reaches into storage,
 * the engine or the workspace itself.
 */
export interface VergleichJourneyControls {
  /** True when a combine-mode plan exists in storage worth seeding from. */
  profile: PersonalProfile
  setProfile: Dispatch<SetStateAction<PersonalProfile>>
  hasSavedPlan: boolean
  /**
   * Copy person + economic frame (profile, inflation, return scenarios,
   * retirement end age) from the saved plan into the compare state. Explicit
   * and one-way: contracts and contributions are never copied, and nothing is
   * written back to the workspace. No-op when `hasSavedPlan` is false.
   */
  seedFromPlan: () => void
  /** Currently compared products (`assumptions.visibleProducts`). May be empty. */
  selectedProducts: readonly ProductId[]
  /** Replace the comparison selection. Writes `visibleProducts` and nothing else. */
  setSelectedProducts: (next: readonly ProductId[]) => void
  /** The fair-comparison net own-money anchor in €/month (`equalInputAmountEUR`). */
  ownMoneyMonthly: number
  /** Set the anchor through the existing `syncMonthlyContributions` path. */
  setOwnMoneyMonthly: (value: number) => void
  /**
   * The inflation rate the comparison computes on (`assumptions.inflationRate`).
   * Read-only here: the view names it next to the profile so the plan diff
   * can be understood; editing stays on the assumptions surface.
   */
  inflationRate: number
  /**
   * The person + inflation the saved plan computes on, read once at mount.
   * Undefined without a saved plan. Lets the result say when the comparison
   * runs on other figures than the plan (audit F11).
   */
  planProfile?: PlanProfileSummary
  /** True when `planProfile` exists and differs from the compare-state profile. */
  profileDiffersFromPlan: boolean
}

interface Props {
  navigate: (target: Route, search?: string) => void
  /**
   * Landing-page choice forwarded from `App.tsx` when the user picked
   * "Vergleich" (or arrived via a `?topic=` preselection with
   * `mode: 'compare'`). Applied once: seeds `visibleProducts`.
   */
  pendingChoice?: LandingChoice | null
  onPendingChoiceConsumed?: () => void
}

const ALL_PRODUCT_IDS: readonly ProductId[] = PRODUCT_REGISTRY.map(
  (entry) => entry.metadata.id as ProductId,
)

export function VergleichJourneyPage({ navigate, pendingChoice, onPendingChoiceConsumed }: Props) {
  const {
    profile,
    setProfile,
    assumptions,
    setAssumptions,
    setSyncedMonthlyContribution,
  } = useCalculatorState()

  const [selectedScenarioId, setSelectedScenarioId] = useState('basis')
  const [linkCopied, setLinkCopied] = useState(false)

  // Saved plan detection. Read once on mount — the workspace is not a live
  // dependency of this page and re-reading it on every render would make the
  // comparison feel coupled to the plan it must stay independent of.
  const [savedWorkspace] = useState(() => {
    try {
      return loadSavedWorkspace()
    } catch {
      return null
    }
  })
  const hasSavedPlan = savedWorkspace !== null && hasStartedPlan(savedWorkspace)
  const planProfile: PlanProfileSummary | undefined = hasSavedPlan && savedWorkspace
    ? {
        age: savedWorkspace.baseline.profile.age,
        retirementAge: savedWorkspace.baseline.profile.retirementAge,
        grossSalaryYear: savedWorkspace.baseline.profile.grossSalaryYear,
        publicHealthInsurance: savedWorkspace.baseline.profile.publicHealthInsurance,
        inflationRate: savedWorkspace.baseline.assumptions.inflationRate,
      }
    : undefined

  // Landing-CTA / topic preselection. One-shot, mirrors Calculator's
  // `pendingChoice` effect.
  useEffect(() => {
    if (!pendingChoice) return
    if (pendingChoice.kind === 'compare' && pendingChoice.visibleProducts) {
      const seed = [...pendingChoice.visibleProducts]
      setAssumptions((current) => ({ ...current, visibleProducts: seed }))
    }
    onPendingChoiceConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChoice])

  const result = useSimulationResult(profile, assumptions, selectedScenarioId)

  // All six products always simulated (the fair-comparison anchor is derived
  // across the full set); the *view* is then filtered to the selection so an
  // unselected product never renders and never reaches the CSV.
  const allProductsSimulation = useMemo(
    () => buildAllProductsSimulation(profile, assumptions),
    [profile, assumptions],
  )

  const selectedProducts = assumptions.visibleProducts

  const filteredSimulation = useMemo(() => {
    const selected = new Set<string>(selectedProducts)
    return {
      ...allProductsSimulation,
      products: allProductsSimulation.products.filter((p) => selected.has(p.productId)),
    }
  }, [allProductsSimulation, selectedProducts])

  const controls: VergleichJourneyControls = {
    profile,
    setProfile,
    hasSavedPlan,
    seedFromPlan: () => {
      if (!savedWorkspace) return
      const seed = seedCompareFromWorkspace(savedWorkspace, assumptions)
      setProfile(seed.profile)
      setAssumptions(seed.assumptions)
    },
    selectedProducts,
    setSelectedProducts: (next) => {
      setAssumptions((current) => ({ ...current, visibleProducts: [...next] }))
    },
    ownMoneyMonthly: assumptions.equalInputAmountEUR ?? 0,
    setOwnMoneyMonthly: setSyncedMonthlyContribution,
    inflationRate: assumptions.inflationRate,
    planProfile,
    profileDiffersFromPlan: profileDiffersFrom(planProfile, profile, assumptions.inflationRate),
  }

  function handleExportCsv(): void {
    const csv = buildExportCsv({
      statutoryPension: filteredSimulation.statutoryPension,
      products: filteredSimulation.products,
      bavAnnualTaxSvSavings: filteredSimulation.bavFunding.annualTaxAndSvSavings,
      bavProfile: profile,
      bavKvdrMember: result.taxModes.kvdrMember,
      bavOtherAnnualIncome: assumptions.bav.monthlyOtherRetirementIncome * 12,
      insuranceTaxMode: result.taxModes.insuranceTaxMode,
      equityPartialExemption: assumptions.etf.equityPartialExemption,
      insuranceOtherAnnualIncome: assumptions.insurance.monthlyOtherRetirementIncome * 12,
      avdOtherAnnualIncome: assumptions.altersvorsorgedepot.monthlyOtherRetirementIncome * 12,
      riesterOtherAnnualIncome: assumptions.riester.monthlyOtherRetirementIncome * 12,
      rules: de2026Rules,
      inflationRate: assumptions.inflationRate,
    })
    downloadCsv('rentenwiki-export.csv', csv)
  }

  function handleCopyLink(): void {
    const url = buildShareUrl(profile, assumptions)
    if (typeof history !== 'undefined') history.replaceState(null, '', url)
    void navigator.clipboard?.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    })
  }

  function toggleProduct(id: ProductId): void {
    const next = selectedProducts.includes(id)
      ? selectedProducts.filter((p) => p !== id)
      : [...selectedProducts, id]
    controls.setSelectedProducts(next)
  }

  return (
    <>
      <VergleichJourneyView
        controls={controls}
        productIds={ALL_PRODUCT_IDS}
        onToggleProduct={toggleProduct}
        renderResult={(onEditSetup, profileNote) => (
          <VergleichPage
            onEditSetup={onEditSetup}
            profileNote={profileNote}
            profile={profile}
            assumptions={assumptions}
            result={result}
            allProductsSimulation={filteredSimulation}
            onAssumptionsChange={(updater) =>
              setAssumptions((current) => ({ ...current, ...updater(current) }))
            }
            selectedScenarioId={result.effectiveScenarioId}
            onSelectScenario={setSelectedScenarioId}
            navigate={navigate}
            onPrint={() => window.print()}
            onExportCsv={handleExportCsv}
            onCopyLink={handleCopyLink}
            linkCopied={linkCopied}
          />
        )}
      />

      {/* Print host for this route. `Calculator` mounts the same mirror for
          `/`, but `/vergleich` is its own page, so "Drucken" printed nothing
          here until now. Compare-mode props only — `combineMode` stays false.
          Both `simulation` and `filteredSimulation` are already scoped to
          `visibleProducts`, so the sheet shows exactly the selected products.
          The disclaimer stays the literal first child of `#print-report`;
          that is inside `PrintReport` itself and is not touched here. */}
      <PrintReport
        profile={profile}
        assumptions={assumptions}
        simulation={result.simulation}
        compareAllProductsSimulation={filteredSimulation}
        selectedScenarioId={result.effectiveScenarioId}
      />
    </>
  )
}
