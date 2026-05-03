import type { PersonalProfile, ReturnScenario } from './profile'
import type { StatutoryPensionAssumptions } from './products/grv'
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
