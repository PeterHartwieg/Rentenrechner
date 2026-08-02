import type { PersonalProfile, ReturnScenario } from './profile'
import type { SalaryResult } from './salary'
import type { StatutoryPensionAssumptions } from './products/grv'
import type { BavFundingResult } from './products/bav'
import type { BasisrenteFundingResult } from './products/basisrente'
import type { AltersvorsorgedepotFundingResult } from './products/altersvorsorgedepot'
import type { RiesterFundingResult } from './products/riester'
import type { ProductId } from './products/common'
import type { ContributionInput } from './results'
import type { MonteCarloAssumptions } from './monteCarlo'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  BasisrenteInstance,
  AltersvorsorgedepotInstance,
  RiesterInstance,
} from './instances'

export interface WorkspaceAssumptionsV2 {
  bav: BavInstance[]
  etf: EtfInstance[]
  insurance: InsuranceInstance[]
  basisrente: BasisrenteInstance[]
  altersvorsorgedepot: AltersvorsorgedepotInstance[]
  riester: RiesterInstance[]
  statutoryPension: StatutoryPensionAssumptions
  inflationRate: number
  retirementEndAge: number
  returnScenarios: ReturnScenario[]
  monteCarlo: MonteCarloAssumptions
  visibleProducts: ProductId[]
  /**
   * Legacy compare-mode sub-mode field. Kept for backward-compat round-trip of
   * old saved/share-URL state. No UI surface exposes this; the public model is
   * Netto-Belastung equality via `equalInputAmountEUR`.
   * @deprecated
   */
  compareSubMode?: 'equal_cash' | 'equal_input'
  /** Monthly net out-of-pocket comparison anchor (EUR/month). Default 200. */
  equalInputAmountEUR?: number
  /**
   * Compare-mode contribution-input mode, carried through the workspace so it
   * survives the singleton↔workspace projection. See
   * `ScenarioAssumptions.contributionInput`. Combine mode does not use it —
   * there each instance's `monthlyOwnContribution` is a real input already.
   */
  contributionInput?: ContributionInput
  visibleInstanceIds?: string[]
}

export interface Scenario {
  id: string
  label: string
  profile: PersonalProfile
  partner?: PersonalProfile
  assumptions: WorkspaceAssumptionsV2
  createdAt: string
  origin: 'baseline' | 'manual' | 'recommender'
  /**
   * Unix timestamp (ms) of the most-recent in-place edit. Updated by
   * `patchBaseline` on every mutation. Used to detect when derived
   * what-ifs are stale relative to the live baseline.
   */
  lastEditedAt?: number
}

export interface WhatIfScenario extends Scenario {
  derivedFromBaselineId: string
  /** Frozen copy of the baseline at fork time; required to recover the user's deltas for re-base. */
  derivedFromBaselineSnapshot: Scenario
  /**
   * Unix timestamp (ms) set when the user clicks "Snapshot beibehalten".
   * While `frozenAt > baseline.lastEditedAt` the "Baseline hat sich geändert"
   * badge suppresses itself. Cleared (set to `undefined`) on re-base.
   */
  frozenAt?: number
}

export interface Workspace {
  schemaVersion: 2
  mode: 'compare' | 'combine'
  baseline: Scenario
  whatIfs: WhatIfScenario[]
  pinnedComparisonIds: string[]
}

// ---------------------------------------------------------------------------
// Portfolio funding (Group G issue 03)
// ---------------------------------------------------------------------------

/**
 * Per-instance portfolio-aware funding share.
 *
 * The PortfolioAdapter pre-step computes cross-instance shared budgets (bAV
 * §3 Nr. 63 + §1 SvEV cap, Basisrente §10 Abs. 3 cap, Riester §10a / §86)
 * before per-instance simulation. Each entry holds the funding result the
 * per-instance simulator should consume for the active instance.
 *
 * Indexed by `instanceId`. Per-instance simulators receive their share via
 * `BuildContextOverrides` so existing engine code stays untouched.
 */
export interface PortfolioFunding {
  /** Map of bav instance id → funding result for that instance after cross-instance cap apportionment. */
  bavByInstanceId: Record<string, BavFundingResult>
  /** Map of basisrente instance id → funding result after Schicht-1 cap apportionment. */
  basisrenteByInstanceId: Record<string, BasisrenteFundingResult>
  /** Map of altersvorsorgedepot instance id → funding result. */
  altersvorsorgedepotByInstanceId: Record<string, AltersvorsorgedepotFundingResult>
  /** Map of riester instance id → funding result. */
  riesterByInstanceId: Record<string, RiesterFundingResult>
  /**
   * Map of Riester instance id → authoritative funding result for each
   * accumulation year. This keeps changing allowances and the shared §10a cap
   * in the portfolio funding boundary instead of re-deriving them in the
   * product simulator.
   */
  riesterYearlyByInstanceId: Record<string, RiesterFundingResult[]>
  /**
   * Authoritative combine-mode funding headroom. Simulation, recommendation,
   * and contract-decision surfaces consume this snapshot instead of
   * reconstructing statutory caps from raw workspace inputs.
   */
  headroom: PortfolioFundingHeadroom
  /**
   * Household salary after all accepted active bAV employee conversions.
   * Downstream Schicht-1 / Riester / AVD funding and marginal recommenders
   * share this exact salary baseline.
   */
  salaryForOtherFunding: SalaryResult
  /**
   * Free-form portfolio-level notes surfaced to the UI for portfolio-wide
   * caveats that don't belong on a single instance (e.g. cap-driven funding
   * adjustments). Sparerpauschbetrag cross-instance sharing is no longer a
   * note — it is applied downstream in `applyCrossInstanceSparerpauschbetrag`.
   */
  notes: string[]
}

export interface SharedFundingHeadroom {
  capAnnual: number
  /** Amount requested before portfolio-level cap apportionment. */
  requestedAnnual: number
  /** Amount accepted by the combine-mode funding pass. */
  fundedAnnual: number
  /** Additional own contribution that can be added without exceeding the cap. */
  remainingAnnual: number
  usedPct: number
  constrained: boolean
}

export interface BavFundingHeadroom extends SharedFundingHeadroom {
  employeeAnnual: number
  employerAnnual: number
  /** Household marginal payroll cost of all accepted bAV conversions. */
  monthlyNetCost: number
}

export interface BasisrenteFundingHeadroom extends SharedFundingHeadroom {
  pensionSystemAnnual: number
  productAnnual: number
}

export interface SubsidisedFundingHeadroom extends SharedFundingHeadroom {
  allowanceAnnual: number
}

export interface PortfolioFundingHeadroom {
  bav: BavFundingHeadroom
  basisrente: BasisrenteFundingHeadroom
  riester: SubsidisedFundingHeadroom
  altersvorsorgedepotByInstanceId: Record<string, SubsidisedFundingHeadroom>
}
