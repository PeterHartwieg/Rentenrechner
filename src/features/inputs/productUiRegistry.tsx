import type React from 'react'
import type { ReactNode } from 'react'
import type {
  BavLumpSumTaxMode,
  GermanRules,
  InsuranceProductResult,
  InsuranceTaxMode,
  PersonalProfile,
  ProductId,
  ProductResult,
  ScenarioAssumptions,
  SimulationResult,
} from '../../domain'
import { BavInputs } from './BavInputs'
import { EtfInputs } from './EtfInputs'
import { InsuranceInputs } from './InsuranceInputs'
import { BasisrenteInputs } from './BasisrenteInputs'
import { AltersvorsorgedepotInputs } from './AltersvorsorgedepotInputs'
import { RiesterInputs } from './RiesterInputs'

/**
 * Shared context for product-specific input rendering. `InputsPanel` builds it
 * once from its own props and passes it through to each registry entry, so
 * adding/removing a product does not require touching a branch chain.
 *
 * Engine-only data already flows in via `simulation` / `selectedResults` /
 * `*ProductResult`; tying registry entries to engine-derived shapes keeps each
 * product's input section focused while keeping React out of the engine.
 */
export interface ProductInputsContext {
  readonly assumptions: ScenarioAssumptions
  readonly onAssumptionsChange: React.Dispatch<React.SetStateAction<ScenarioAssumptions>>
  readonly onSyncMonthlyContribution: (targetNet: number) => void
  readonly profile: PersonalProfile
  readonly simulation: SimulationResult
  readonly selectedResults: ProductResult[]
  readonly rules: GermanRules
  readonly kvdrMember: boolean
  readonly bavLumpSumTaxMode: BavLumpSumTaxMode
  readonly insuranceTaxMode: InsuranceTaxMode
  readonly insuranceResult: InsuranceProductResult | undefined
  readonly tarifgebunden: boolean
  readonly onTarifgebundenChange: (v: boolean) => void
  readonly bavMinAnnual: number
  readonly bavMinMonthly: number
  readonly bavEntitlementMax: number
}

/**
 * Per-product UI registration. Currently only `renderInputs` collapses real
 * duplication in `InputsPanel`; if `selectFunding`/`selectResult` start
 * appearing in more places (e.g. inventory cards in Group G), promote them
 * here at that point — adding fields now would be speculative.
 */
export interface ProductUiEntry {
  readonly renderInputs: (ctx: ProductInputsContext) => ReactNode
}

export const PRODUCT_UI_REGISTRY: Record<ProductId, ProductUiEntry> = {
  etf: {
    renderInputs: (ctx) => (
      <EtfInputs
        assumptions={ctx.assumptions}
        onAssumptionsChange={ctx.onAssumptionsChange}
      />
    ),
  },
  bav: {
    renderInputs: (ctx) => (
      <BavInputs
        assumptions={ctx.assumptions}
        onAssumptionsChange={ctx.onAssumptionsChange}
        onSyncMonthlyContribution={ctx.onSyncMonthlyContribution}
        profile={ctx.profile}
        bavFunding={ctx.simulation.bavFunding}
        selectedResults={ctx.selectedResults}
        kvdrMember={ctx.kvdrMember}
        bavLumpSumTaxMode={ctx.bavLumpSumTaxMode}
        tarifgebunden={ctx.tarifgebunden}
        onTarifgebundenChange={ctx.onTarifgebundenChange}
        bavMinAnnual={ctx.bavMinAnnual}
        bavMinMonthly={ctx.bavMinMonthly}
        bavEntitlementMax={ctx.bavEntitlementMax}
        rules={ctx.rules}
      />
    ),
  },
  versicherung: {
    renderInputs: (ctx) => (
      <InsuranceInputs
        assumptions={ctx.assumptions}
        onAssumptionsChange={ctx.onAssumptionsChange}
        profile={ctx.profile}
        insuranceTaxMode={ctx.insuranceTaxMode}
        insuranceProductResult={ctx.insuranceResult}
        rules={ctx.rules}
      />
    ),
  },
  basisrente: {
    renderInputs: (ctx) => (
      <BasisrenteInputs
        assumptions={ctx.assumptions}
        onAssumptionsChange={ctx.onAssumptionsChange}
        onSyncMonthlyContribution={ctx.onSyncMonthlyContribution}
        basisrenteFunding={ctx.simulation.basisrenteFunding}
        basisrenteProductResult={ctx.selectedResults.find((r) => r.productId === 'basisrente')}
        rules={ctx.rules}
        retirementAge={ctx.profile.retirementAge}
      />
    ),
  },
  altersvorsorgedepot: {
    renderInputs: (ctx) => (
      <AltersvorsorgedepotInputs
        assumptions={ctx.assumptions}
        onAssumptionsChange={ctx.onAssumptionsChange}
        onSyncMonthlyContribution={ctx.onSyncMonthlyContribution}
        profile={ctx.profile}
        avdFunding={ctx.simulation.altersvorsorgedepotFunding}
        avdProductResult={ctx.selectedResults.find((r) => r.productId === 'altersvorsorgedepot')}
        rules={ctx.rules}
      />
    ),
  },
  riester: {
    renderInputs: (ctx) => (
      <RiesterInputs
        assumptions={ctx.assumptions}
        onAssumptionsChange={ctx.onAssumptionsChange}
        onSyncMonthlyContribution={ctx.onSyncMonthlyContribution}
        profile={ctx.profile}
        riesterFunding={ctx.simulation.riesterFunding}
        riesterProductResult={ctx.selectedResults.find((r) => r.productId === 'riester')}
      />
    ),
  },
}

export function getProductUiEntry(id: ProductId): ProductUiEntry | undefined {
  return PRODUCT_UI_REGISTRY[id]
}
