import type { PersonalProfile, ReturnScenario } from './profile'
import type { StatutoryPensionAssumptions } from './products/grv'
import type { BavFundingResult } from './products/bav'
import type { BasisrenteFundingResult } from './products/basisrente'
import type { AltersvorsorgedepotFundingResult } from './products/altersvorsorgedepot'
import type { RiesterFundingResult } from './products/riester'
import type { ProductId } from './products/common'
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
  compareSubMode?: 'equal_cash' | 'equal_input'
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
}

export interface WhatIfScenario extends Scenario {
  derivedFromBaselineId: string
  /** Frozen copy of the baseline at fork time; required to recover the user's deltas for re-base. */
  derivedFromBaselineSnapshot: Scenario
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
   * Free-form portfolio-level notes surfaced to the UI. Used today to flag
   * the deferred Sparerpauschbetrag cross-instance handling (issue 15).
   */
  notes: string[]
}
