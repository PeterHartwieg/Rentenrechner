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
import type {
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
} from '../../domain/instances'
import { BavInputs } from './BavInputs'
import { EtfInputs } from './EtfInputs'
import { InsuranceInputs } from './InsuranceInputs'
import { BasisrenteInputs } from './BasisrenteInputs'
import { AltersvorsorgedepotInputs } from './AltersvorsorgedepotInputs'
import { RiesterInputs } from './RiesterInputs'
import { BavInstanceInputs } from '../produkte/instances/BavInstanceInputs'
import { EtfInstanceInputs } from '../produkte/instances/EtfInstanceInputs'
import { InsuranceInstanceInputs } from '../produkte/instances/InsuranceInstanceInputs'
import { BasisrenteInstanceInputs } from '../produkte/instances/BasisrenteInstanceInputs'
import { AltersvorsorgedepotInstanceInputs } from '../produkte/instances/AltersvorsorgedepotInstanceInputs'
import { RiesterInstanceInputs } from '../produkte/instances/RiesterInstanceInputs'

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
 * Union of all per-product workspace instance shapes accepted by
 * `renderInstanceInputs`. Aligned with `AnyInstance` in
 * `src/app/portfolioState.ts`; we re-declare here so the registry stays
 * React-only and doesn't drag the portfolio state hook into its dependency
 * tree.
 */
export type WorkspaceInstance =
  | BavInstance
  | EtfInstance
  | InsuranceInstance
  | BasisrenteInstance
  | AltersvorsorgedepotInstance
  | RiesterInstance

/**
 * Shared context for a per-instance editor. Each registry entry narrows
 * `instance` and `patchInstance` to its product's instance type internally;
 * the panel passes the union shape because it iterates a heterogeneous list.
 */
export interface InstanceInputsContext {
  readonly instance: WorkspaceInstance
  readonly patchInstance: (patch: Partial<WorkspaceInstance>) => void
  readonly profile: PersonalProfile
  readonly activeRules: GermanRules
}

/**
 * Per-product UI registration.
 *
 * - `renderInputs` (PR 3): compare-mode singleton editor mounted inside the
 *   Sober D § 2 row disclosure. Reads `ScenarioAssumptions`.
 * - `renderInstanceInputs` (CX-PR4-2 R1): combine-mode per-instance editor
 *   mounted inside the same § 2 disclosure when the panel iterates
 *   `WorkspaceAssumptionsV2`. Optional — products without a registered
 *   instance editor surface a fallback message and the row's "Details
 *   ansehen ›" affordance remains the only edit path. All six multi-instance
 *   products carry an editor today.
 */
export interface ProductUiEntry {
  readonly renderInputs: (ctx: ProductInputsContext) => ReactNode
  readonly renderInstanceInputs?: (ctx: InstanceInputsContext) => ReactNode
}

export const PRODUCT_UI_REGISTRY: Record<ProductId, ProductUiEntry> = {
  etf: {
    renderInputs: (ctx) => (
      <EtfInputs
        assumptions={ctx.assumptions}
        onAssumptionsChange={ctx.onAssumptionsChange}
      />
    ),
    renderInstanceInputs: (ctx) => (
      <EtfInstanceInputs
        instance={ctx.instance as EtfInstance}
        patchInstance={ctx.patchInstance as (p: Partial<EtfInstance>) => void}
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
    renderInstanceInputs: (ctx) => (
      <BavInstanceInputs
        instance={ctx.instance as BavInstance}
        patchInstance={ctx.patchInstance as (p: Partial<BavInstance>) => void}
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
    renderInstanceInputs: (ctx) => (
      <InsuranceInstanceInputs
        instance={ctx.instance as InsuranceInstance}
        patchInstance={
          ctx.patchInstance as (p: Partial<InsuranceInstance>) => void
        }
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
    renderInstanceInputs: (ctx) => (
      <BasisrenteInstanceInputs
        instance={ctx.instance as BasisrenteInstance}
        patchInstance={
          ctx.patchInstance as (p: Partial<BasisrenteInstance>) => void
        }
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
    renderInstanceInputs: (ctx) => (
      <AltersvorsorgedepotInstanceInputs
        instance={ctx.instance as AltersvorsorgedepotInstance}
        patchInstance={
          ctx.patchInstance as (
            p: Partial<AltersvorsorgedepotInstance>,
          ) => void
        }
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
    renderInstanceInputs: (ctx) => (
      <RiesterInstanceInputs
        instance={ctx.instance as RiesterInstance}
        patchInstance={
          ctx.patchInstance as (p: Partial<RiesterInstance>) => void
        }
      />
    ),
  },
}

export function getProductUiEntry(id: ProductId): ProductUiEntry | undefined {
  return PRODUCT_UI_REGISTRY[id]
}
