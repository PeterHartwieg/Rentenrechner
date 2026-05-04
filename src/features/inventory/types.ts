/**
 * Draft state types for the InventoryWizard.
 *
 * These are UI-layer draft shapes — not the same as the domain instance types
 * in `src/domain/instances.ts`. The wizard commits them to the workspace via
 * `buildWorkspaceFromDraft` on exit; there is no persistent draft state.
 *
 * Deliberately minimal: each draft only holds the Layer 1 fields the wizard
 * collects. On commit, missing fields are filled from `defaultAssumptions`.
 */

import type {
  BavDurchfuehrungsweg,
} from '../../domain/products/bav'
import type {
  AltersvorsorgedepotSubtype,
} from '../../domain/products/altersvorsorgedepot'
import type { EvidenceState } from '../../domain/instances'

export type InstanceStatus = 'active' | 'paid_up' | 'surrendered'

/** Base fields shared by all product drafts (universal Layer 1). */
export interface ProductDraftState {
  productId: string
  /** User-editable instance label. Overrides the default "{ProductLabel} #N" disambiguator. */
  instanceLabel?: string
  status: InstanceStatus
  contractStartYear: number
  currentValueEUR?: number
  monthlyContribution: number
  anbieter?: string
  /** Per-field evidence map. Missing keys default to 'model_estimate'. */
  evidenceMap?: Record<string, EvidenceState>
}

export interface GrvDraft {
  productId: 'grv'
  yearsWorked: number
  currentEntgeltpunkte: number
  useYearsEstimate: boolean
}

export interface BavDraft extends ProductDraftState {
  productId: 'bav'
  durchfuehrungsweg: BavDurchfuehrungsweg
  effektivkostenPct: number
  rentenfaktor: number
  payoutMode: 'leibrente' | 'zeitrente' | 'kapitalverzehr'
}

export interface PavDraft extends ProductDraftState {
  productId: 'versicherung'
  effektivkostenPct: number
  rentenfaktor: number
  payoutMode: 'leibrente' | 'zeitrente' | 'kapitalverzehr'
}

export interface RiesterDraft extends ProductDraftState {
  productId: 'riester'
  payoutMode: 'leibrente' | 'zeitrente'
  zulageStatus: string
}

export interface BasisrenteDraft extends ProductDraftState {
  productId: 'basisrente'
  effektivkostenPct: number
  rentenfaktor: number
}

export interface AvdDraft extends ProductDraftState {
  productId: 'altersvorsorgedepot'
  subtype: AltersvorsorgedepotSubtype
  useGlidepath: boolean
}

export interface EtfDraft extends ProductDraftState {
  productId: 'etf'
  terPct: number
}

/** Union of all product draft types (excluding GRV which has its own shape). */
export type AnyProductDraft =
  | BavDraft
  | PavDraft
  | RiesterDraft
  | BasisrenteDraft
  | AvdDraft
  | EtfDraft

// ---------------------------------------------------------------------------
// Step 0: personal details draft (issue #06)
// ---------------------------------------------------------------------------

/**
 * Personal details collected in wizard step 0 before the product checklist.
 *
 * - birthYear is the primary input; age is derived as (currentYear − birthYear).
 *   The wizard stores birthYear so it can show derived age as a hint.
 * - steuerklasse: only class 1 is currently supported by the engine (see
 *   scenarioSchema.ts validateProfile). The field is collected for forward-
 *   compatibility and surfaced in the UI, but written as `taxClass: 1`
 *   regardless of input until multi-class engine support lands.
 * - ehegattensplitting: maps to `partner` on the Scenario (populated as a
 *   minimal partner profile with default values when true).
 */
export interface PersonalDetailsDraft {
  birthYear: number
  grossSalaryYear: number
  /** Always 1 until engine multi-class support lands. Stored for future use. */
  steuerklasse: 1
  ehegattensplitting: boolean
  retirementAge: number
}
