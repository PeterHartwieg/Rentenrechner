import type {
  ProductId,
  ProductResult,
  ReturnScenario,
  ScenarioAssumptions,
} from '../domain'
import type { SimulationContext } from './simulationContext'
import { metadata as etfMeta, simulate as simulateEtf } from './products/etf'
import { metadata as bavMeta, simulate as simulateBav } from './products/bav'
import { metadata as insuranceMeta, simulate as simulateInsurance } from './products/insurance'
import { metadata as basisrenteMeta, simulate as simulateBasisrente } from './products/basisrente'
import { metadata as avdMeta, simulate as simulateAvd } from './products/altersvorsorgedepot'
import { metadata as riesterMeta, simulate as simulateRiester } from './products/riester'
import { validateEtf } from './products/etf.validation'
import { validateBav } from './products/bav.validation'
import { validateInsurance } from './products/insurance.validation'
import { validateBasisrente } from './products/basisrente.validation'
import { validateAltersvorsorgedepot } from './products/altersvorsorgedepot.validation'
import { validateRiester } from './products/riester.validation'

type SharedAssumptionsKey =
  | 'inflationRate'
  | 'retirementEndAge'
  | 'returnScenarios'
  | 'statutoryPension'
  | 'visibleProducts'

export type ProductAssumptionsKey = Exclude<keyof ScenarioAssumptions, SharedAssumptionsKey>

export interface ProductMetadata {
  readonly id: ProductId
  readonly label: string
  readonly shortLabel: string
  readonly color: string
  readonly order: number
  readonly lockedCapital: boolean
  readonly hasFees: boolean
  readonly hasEmployerContribution: boolean
}

export type ProductSimulator = (
  ctx: SimulationContext,
  scenario: ReturnScenario,
) => ProductResult

export interface ProductRegistryEntry<K extends ProductAssumptionsKey = ProductAssumptionsKey> {
  readonly metadata: ProductMetadata
  readonly assumptionsKey: K
  readonly simulate: ProductSimulator
  readonly validate: (assumptions: unknown) => boolean
}

function product<K extends ProductAssumptionsKey, M extends ProductMetadata>(config: {
  readonly metadata: M
  readonly assumptionsKey: K
  readonly simulate: ProductSimulator
  readonly validate: (assumptions: ScenarioAssumptions[K]) => boolean
}): ProductRegistryEntry<K> & { readonly metadata: M } {
  return {
    ...config,
    validate: config.validate as (assumptions: unknown) => boolean,
  }
}

export const PRODUCT_REGISTRY = [
  product({
    metadata: etfMeta,
    assumptionsKey: 'etf',
    simulate: simulateEtf,
    validate: validateEtf,
  }),
  product({
    metadata: bavMeta,
    assumptionsKey: 'bav',
    simulate: simulateBav,
    validate: validateBav,
  }),
  product({
    metadata: insuranceMeta,
    assumptionsKey: 'insurance',
    simulate: simulateInsurance,
    validate: validateInsurance,
  }),
  product({
    metadata: basisrenteMeta,
    assumptionsKey: 'basisrente',
    simulate: simulateBasisrente,
    validate: validateBasisrente,
  }),
  product({
    metadata: avdMeta,
    assumptionsKey: 'altersvorsorgedepot',
    simulate: simulateAvd,
    validate: validateAltersvorsorgedepot,
  }),
  product({
    metadata: riesterMeta,
    assumptionsKey: 'riester',
    simulate: simulateRiester,
    validate: validateRiester,
  }),
] as const

export type RegisteredProduct = typeof PRODUCT_REGISTRY[number]

export type ProductManifestEntry = RegisteredProduct['metadata']

export const PRODUCT_MANIFEST = PRODUCT_REGISTRY.map(entry => entry.metadata) as readonly ProductManifestEntry[]

export const PRODUCT_IDS = PRODUCT_MANIFEST.map(entry => entry.id) as readonly ProductId[]

export function getProductMeta(productId: string): ProductManifestEntry | undefined {
  return PRODUCT_MANIFEST.find(m => m.id === productId)
}
