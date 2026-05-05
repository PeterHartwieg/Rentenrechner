import type { BavAssumptions } from './products/bav'
import type { EtfAssumptions } from './products/etf'
import type { InsuranceAssumptions } from './products/insurance'
import type { BasisrenteAssumptions } from './products/basisrente'
import type { AltersvorsorgedepotAssumptions } from './products/altersvorsorgedepot'
import type { RiesterAssumptions } from './products/riester'

export type EvidenceState = 'user_confirmed' | 'model_estimate' | 'statement'

export type TransferEvent =
  | {
      type: 'certified'
      year: number
      sourceInstanceId: string
      targetInstanceId: string
      amountEUR: number
    }
  | {
      type: 'surrender_reinvest'
      year: number
      sourceInstanceId: string
      targetInstanceId: string
      amountEUR: number
      surrenderHaircutPct: number
    }

export interface InstanceCommon {
  instanceId: string
  label: string
  anbieter?: string
  status: 'active' | 'paid_up' | 'surrendered' | 'offered'
  contractStartYear: number
  currentValueEUR?: number
  evidenceMap: Record<string, EvidenceState>
  ownedBy?: 'self' | 'partner'
  transferEvents?: TransferEvent[]
}

export interface BavInstance extends InstanceCommon, BavAssumptions {}

export interface EtfInstance extends InstanceCommon, EtfAssumptions {
  /**
   * Per-instance monthly contribution (EUR/month) honored only in **combine-mode**
   * (workspace, `simulatePortfolio` → `BuildContextOverrides.etfMonthlyUserCostOverride`).
   * In compare-mode the fair-comparison invariant pulls ETF gross from
   * `bavFunding.monthlyNetCost`; this field is unused there. Optional for
   * backward-compat with workspaces predating the recommender wiring.
   */
  monthlyContribution?: number
}

export interface InsuranceInstance extends InstanceCommon, InsuranceAssumptions {
  /**
   * Per-instance monthly contribution (EUR/month) honored only in **combine-mode**
   * (workspace, `simulatePortfolio` → `BuildContextOverrides.insuranceMonthlyUserCostOverride`).
   * In compare-mode the fair-comparison invariant pulls insurance gross from
   * `bavFunding.monthlyNetCost`; this field is unused there. Optional for
   * backward-compat with workspaces predating this wiring.
   */
  monthlyContribution?: number
}

export interface BasisrenteInstance extends InstanceCommon, BasisrenteAssumptions {}

export interface AltersvorsorgedepotInstance extends InstanceCommon, AltersvorsorgedepotAssumptions {}

export interface RiesterInstance extends InstanceCommon, RiesterAssumptions {}
