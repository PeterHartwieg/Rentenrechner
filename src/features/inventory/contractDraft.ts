/**
 * Contract draft state — the per-contract editor's model.
 *
 * Pure, React-free. Package 2B-mechanical of the simplification project
 * (`docs/redesign/simplification/notes/state-contract.md` §2, §11, §12;
 * `ui-journey-map.md` §2 "Wizard und InstanceCard" / "/eingaben/produkte").
 *
 * Sibling of `onboardingDraft.ts`, which owns the profile and statutory-pension
 * steps. The `Field<T>` vocabulary is shared verbatim — imported from there, not
 * re-invented — so "weiß ich nicht" behaves identically on both surfaces:
 *
 *   - `entered`  — the user typed it. Numeric **0 is a valid entered value**.
 *   - `document` — read off a policy statement / Standmitteilung.
 *   - `assumed`  — a model default the user has never reviewed. Also the legacy
 *                  fallback for instances saved before this metadata existed.
 *   - `unknown`  — the user explicitly declined. The *engine* field keeps the
 *                  existing value (or the registry default) and is never
 *                  overwritten with 0.
 *
 * A fourth, draft-only state exists: `'empty'`. A brand-new contract starts with
 * its two core fields (current value and monthly contribution) unanswered — not
 * `assumed`, because nothing was assumed, and not `unknown`, because the user
 * has not declined. `validateDraft` rejects an empty core field until the user
 * either types a number or ticks "Weiß ich nicht". Empty is tracked in
 * `ContractDraft.pending` rather than inside `Field<T>`, so every `Field` helper
 * from `onboardingDraft.ts` keeps working unchanged.
 *
 * Every editable field is declared once in `CONTRACT_FIELD_SPECS`. The spec
 * drives the adapters (`draftFromInstance` / `draftToInstancePatch`), the
 * validation bounds, and `fieldSpecs()` — the list the UI renders from. Adding a
 * per-contract field is one table entry, not four parallel edits.
 *
 * **Only fields that exist on the domain instance types appear here.** Nothing
 * reaches into compare-mode singleton state (lead decision "Controls that are
 * not wired today").
 */

import type { EvidenceState } from '../../domain/instances'
import type { InputStatus, InputStatusMap } from '../../domain/inputStatus'
import type { Workspace } from '../../domain/workspace'
import { resolveInputStatus, inputStatusToEvidenceState } from '../results/provenanceHelpers'
import { CONTRIBUTION_FIELD_BY_PRODUCT } from '../../app/resultReadiness'
import { defaultInstanceLabel, newInstanceId } from '../../app/workspaceIdentity'
import {
  INVENTORY_PRODUCT_REGISTRY,
  type MultiInstanceProductId,
} from './inventoryProductRegistry'
import {
  assumed,
  fieldFromStatus,
  isUnknown,
  setUnknown,
  setValue,
  type Field,
  type FieldStatus,
} from './onboardingDraft'
import { DFW_OPTIONS, PAYOUT_OPTIONS_FULL, PAYOUT_OPTIONS_NO_KAPITAL } from './fieldHelpers'
import { legalConstants } from '../../rules/legalConstants'

// ---------------------------------------------------------------------------
// Field specs
// ---------------------------------------------------------------------------

/** Every value a contract field can hold. Instances store no arrays or objects at leaf level. */
export type ContractFieldValue = number | string | boolean

/** How the UI should render a field. */
export type ContractFieldKind = 'number' | 'boolean' | 'text' | 'select'

/**
 * Unit of a numeric field, in the *engine's* representation.
 *
 * `ratio` fields are decimals (0.012 = 1.2 % p.a.). Percent formatting is a
 * display concern — see the UI rounding boundary in `CLAUDE.md`; nothing here
 * multiplies by 100.
 */
export type ContractFieldUnit =
  | 'EUR'
  | 'EUR/Monat'
  | 'ratio'
  | 'year'
  | 'age'
  | 'years'
  | 'count'
  | 'none'

/**
 * Where a field belongs in the progressively-disclosed editor.
 *
 * `minimum` = the short first screen; `details` = the local disclosure;
 * `fees` = the full fee matrix (its own disclosure).
 */
export type ContractFieldSection = 'minimum' | 'details' | 'fees'

/**
 * What "Weiß ich nicht" means for this field.
 *
 *  - `explicit-unknown` — the normal case. Status becomes `'unknown'`, the
 *    engine value is left alone, the evidence key is deleted, and readiness can
 *    block the household total.
 *  - `assumed-default`  — the field has a defensible model default and no
 *    plausible "no answer" rendering (bAV Durchführungsweg, lead decision
 *    "bAV subsidy on the minimum screen"). Ticking unknown writes the registry
 *    default with status `'assumed'`, so the user sees a real, labelled
 *    assumption instead of a hole.
 *  - `none` — the field cannot be unknown (name, status, payout mode).
 */
export type ContractUnknownMode = 'explicit-unknown' | 'assumed-default' | 'none'

export interface ContractFieldSpec {
  /** Draft key. Identical to the `inputStatus` / `evidenceMap` key. */
  readonly id: string
  /** Dot path on the domain instance (`fees.wrapperAssetFee`, `eligibility.directlyEligible`). */
  readonly path: string
  /** Stable, language-neutral key for copy catalogs. */
  readonly labelKey: string
  /** German label. */
  readonly label: string
  readonly kind: ContractFieldKind
  readonly unit: ContractFieldUnit
  readonly section: ContractFieldSection
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  /** `true` when the UI must offer a "Weiß ich nicht" control. */
  readonly supportsUnknown: boolean
  readonly unknownMode: ContractUnknownMode
  /**
   * A core field: the contract is not answerable without it. An `empty` core
   * field fails validation; the user must type a value (0 included) or decline.
   */
  readonly core?: boolean
  /** Additional instance paths that mirror this value (Riester `existingCapital`). */
  readonly mirrorPaths?: readonly string[]
  /** Conditional visibility, evaluated against the live draft. */
  readonly visibleWhen?: (draft: ContractDraft) => boolean
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktiv (Beiträge laufen)' },
  { value: 'paid_up', label: 'Beitragsfrei gestellt' },
  { value: 'surrendered', label: 'Gekündigt / übertragen' },
  { value: 'offered', label: 'Angebot (noch nicht abgeschlossen)' },
] as const

const AVD_SUBTYPE_OPTIONS = [
  { value: 'standarddepot', label: 'Standarddepot' },
  { value: 'depot_no_guarantee', label: 'Depot ohne Garantie' },
  { value: 'guarantee_80', label: '80 % Beitragsgarantie' },
  { value: 'guarantee_100', label: '100 % Beitragsgarantie' },
] as const

const AVD_PAYOUT_OPTIONS = [
  { value: 'lifelong_annuity', label: 'Lebenslange Rente' },
  { value: 'certified_payout_plan', label: 'Auszahlplan (zertifiziert)' },
  { value: 'hybrid_80_annuity', label: '80 % Rente + 20 % variabel' },
] as const

const BASISRENTE_PAYOUT_OPTIONS = [
  { value: 'leibrente', label: 'Lebenslange Rente (gesetzlich vorgeschrieben)' },
] as const

/** Reads a select field's current value for `visibleWhen` predicates. */
function selected(draft: ContractDraft, id: string): string | null {
  const value = draftFieldValue(draft, id)
  return typeof value === 'string' ? value : null
}

function numberOf(draft: ContractDraft, id: string): number | null {
  const value = draftFieldValue(draft, id)
  return typeof value === 'number' ? value : null
}

// --- reusable spec fragments ----------------------------------------------

const labelSpec: ContractFieldSpec = {
  id: 'label',
  path: 'label',
  labelKey: 'contract.label',
  label: 'Eigener Name (optional)',
  kind: 'text',
  unit: 'none',
  section: 'details',
  supportsUnknown: false,
  unknownMode: 'none',
}

const anbieterSpec: ContractFieldSpec = {
  id: 'anbieter',
  path: 'anbieter',
  labelKey: 'contract.anbieter',
  label: 'Anbieter / Tarif',
  kind: 'text',
  unit: 'none',
  section: 'details',
  supportsUnknown: false,
  unknownMode: 'none',
}

const statusSpec: ContractFieldSpec = {
  id: 'status',
  path: 'status',
  labelKey: 'contract.status',
  label: 'Vertragsstatus',
  kind: 'select',
  unit: 'none',
  section: 'details',
  options: STATUS_OPTIONS,
  supportsUnknown: false,
  unknownMode: 'none',
}

function currentValueSpec(mirrorPaths?: readonly string[]): ContractFieldSpec {
  return {
    id: 'currentValueEUR',
    path: 'currentValueEUR',
    labelKey: 'contract.currentValue',
    label: 'Aktueller Vertragswert',
    kind: 'number',
    unit: 'EUR',
    section: 'minimum',
    min: 0,
    max: 10_000_000,
    step: 100,
    supportsUnknown: true,
    unknownMode: 'explicit-unknown',
    core: true,
    mirrorPaths,
  }
}

function contractStartYearSpec(section: ContractFieldSection): ContractFieldSpec {
  return {
    id: 'contractStartYear',
    path: 'contractStartYear',
    labelKey: 'contract.startYear',
    label: 'Vertragsbeginn (Jahr)',
    kind: 'number',
    unit: 'year',
    section,
    min: 1950,
    max: 2100,
    step: 1,
    supportsUnknown: true,
    unknownMode: 'explicit-unknown',
  }
}

function contributionSpec(
  id: string,
  label: string,
  labelKey: string,
): ContractFieldSpec {
  return {
    id,
    path: id,
    labelKey,
    label,
    kind: 'number',
    unit: 'EUR/Monat',
    section: 'minimum',
    min: 0,
    max: 100_000,
    step: 10,
    supportsUnknown: true,
    unknownMode: 'explicit-unknown',
    core: true,
  }
}

/**
 * The seven `FeeModel` fields, exactly as the engine stores them. The single
 * "Jahreskosten" slider of the mockup is deliberately **not** a replacement for
 * these (journey map: "kein Ersatz durch einen universellen Jahreskostensatz").
 */
const FEE_SPECS: readonly ContractFieldSpec[] = [
  {
    id: 'fees.wrapperAssetFee',
    path: 'fees.wrapperAssetFee',
    labelKey: 'contract.fees.wrapper',
    label: 'Mantelkosten p.a.',
    kind: 'number',
    unit: 'ratio',
    section: 'fees',
    min: 0,
    max: 0.1,
    step: 0.001,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  {
    id: 'fees.fundAssetFee',
    path: 'fees.fundAssetFee',
    labelKey: 'contract.fees.fund',
    label: 'Fondskosten p.a. (TER)',
    kind: 'number',
    unit: 'ratio',
    section: 'fees',
    min: 0,
    max: 0.1,
    step: 0.001,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  {
    id: 'fees.contributionFee',
    path: 'fees.contributionFee',
    labelKey: 'contract.fees.contribution',
    label: 'Kosten je Beitrag',
    kind: 'number',
    unit: 'ratio',
    section: 'fees',
    min: 0,
    max: 0.5,
    step: 0.001,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  {
    id: 'fees.fixedMonthlyFee',
    path: 'fees.fixedMonthlyFee',
    labelKey: 'contract.fees.fixedMonthly',
    label: 'Fixkosten pro Monat',
    kind: 'number',
    unit: 'EUR/Monat',
    section: 'fees',
    min: 0,
    max: 1000,
    step: 1,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  {
    id: 'fees.acquisitionCostPct',
    path: 'fees.acquisitionCostPct',
    labelKey: 'contract.fees.acquisition',
    label: 'Abschlusskostenquote',
    kind: 'number',
    unit: 'ratio',
    section: 'fees',
    min: 0,
    max: 0.2,
    step: 0.001,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  {
    id: 'fees.acquisitionCostSpreadYears',
    path: 'fees.acquisitionCostSpreadYears',
    labelKey: 'contract.fees.acquisitionSpread',
    label: 'Verteilung der Abschlusskosten',
    kind: 'number',
    unit: 'years',
    section: 'fees',
    min: 1,
    max: 10,
    step: 1,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  {
    id: 'fees.pensionPayoutFeePct',
    path: 'fees.pensionPayoutFeePct',
    labelKey: 'contract.fees.payout',
    label: 'Kosten in der Auszahlphase',
    kind: 'number',
    unit: 'ratio',
    section: 'fees',
    min: 0,
    max: 0.2,
    step: 0.001,
    supportsUnknown: false,
    unknownMode: 'none',
  },
]

function rentenfaktorSpec(visibleWhen?: (draft: ContractDraft) => boolean): ContractFieldSpec {
  return {
    id: 'rentenfaktor',
    path: 'rentenfaktor',
    labelKey: 'contract.rentenfaktor',
    label: 'Garantierter Rentenfaktor (€/Monat je 10 000 € Kapital)',
    kind: 'number',
    unit: 'none',
    section: 'details',
    min: 0,
    max: 200,
    step: 0.1,
    supportsUnknown: true,
    unknownMode: 'explicit-unknown',
    visibleWhen,
  }
}

function zeitrenteYearsSpec(visibleWhen: (draft: ContractDraft) => boolean): ContractFieldSpec {
  return {
    id: 'zeitrenteYears',
    path: 'zeitrenteYears',
    labelKey: 'contract.zeitrenteYears',
    label: 'Laufzeit der Zeitrente',
    kind: 'number',
    unit: 'years',
    section: 'details',
    min: 1,
    max: 60,
    step: 1,
    supportsUnknown: false,
    unknownMode: 'none',
    visibleWhen,
  }
}

const contributionGrowthSpec: ContractFieldSpec = {
  id: 'annualContributionGrowthRate',
  path: 'annualContributionGrowthRate',
  labelKey: 'contract.contributionGrowth',
  label: 'Beitragsdynamik pro Jahr',
  kind: 'number',
  unit: 'ratio',
  section: 'details',
  min: 0,
  max: 0.2,
  step: 0.005,
  supportsUnknown: false,
  unknownMode: 'none',
}

function eligibilitySpecs(withChildren: boolean): readonly ContractFieldSpec[] {
  const specs: ContractFieldSpec[] = [
    {
      id: 'eligibility.directlyEligible',
      path: 'eligibility.directlyEligible',
      labelKey: 'contract.eligibility.direct',
      label: 'Unmittelbar förderberechtigt',
      kind: 'boolean',
      unit: 'none',
      section: 'minimum',
      supportsUnknown: false,
      unknownMode: 'none',
    },
    {
      id: 'eligibility.indirectSpouseEligible',
      path: 'eligibility.indirectSpouseEligible',
      labelKey: 'contract.eligibility.indirect',
      label: 'Mittelbar über Ehepartner förderberechtigt',
      kind: 'boolean',
      unit: 'none',
      section: 'details',
      supportsUnknown: false,
      unknownMode: 'none',
    },
    {
      id: 'eligibility.ageAtContractStart',
      path: 'eligibility.ageAtContractStart',
      labelKey: 'contract.eligibility.ageAtStart',
      label: 'Alter im ersten Beitragsjahr',
      kind: 'number',
      unit: 'age',
      section: 'details',
      min: 14,
      max: 80,
      step: 1,
      supportsUnknown: false,
      unknownMode: 'none',
    },
    {
      id: 'eligibility.careerStarterBonusUsed',
      path: 'eligibility.careerStarterBonusUsed',
      labelKey: 'contract.eligibility.careerStarter',
      label: 'Berufseinsteigerbonus schon erhalten',
      kind: 'boolean',
      unit: 'none',
      section: 'details',
      supportsUnknown: false,
      unknownMode: 'none',
    },
  ]
  if (withChildren) {
    specs.splice(1, 0, {
      id: 'eligibility.eligibleChildren',
      path: 'eligibility.eligibleChildren',
      labelKey: 'contract.eligibility.children',
      label: 'Kinder mit Kindergeldanspruch',
      kind: 'number',
      unit: 'count',
      section: 'details',
      min: 0,
      max: 12,
      step: 1,
      supportsUnknown: false,
      unknownMode: 'none',
    })
  }
  return specs
}

// --- per-product tables ----------------------------------------------------

const BAV_SPECS: readonly ContractFieldSpec[] = [
  labelSpec,
  anbieterSpec,
  statusSpec,
  currentValueSpec(),
  contributionSpec(
    'monthlyGrossConversion',
    'Monatliche Entgeltumwandlung (brutto)',
    'contract.bav.grossConversion',
  ),
  contractStartYearSpec('minimum'),
  {
    id: 'durchfuehrungsweg',
    path: 'durchfuehrungsweg',
    labelKey: 'contract.bav.durchfuehrungsweg',
    label: 'Art der betrieblichen Vorsorge',
    kind: 'select',
    unit: 'none',
    section: 'minimum',
    options: DFW_OPTIONS,
    // "Weiß ich nicht" stores the model default as `assumed` (lead decision).
    supportsUnknown: true,
    unknownMode: 'assumed-default',
  },
  {
    id: 'statutoryMinimumSubsidyEnabled',
    path: 'statutoryMinimumSubsidyEnabled',
    labelKey: 'contract.bav.statutorySubsidy',
    label: 'Gesetzlicher Arbeitgeberzuschuss (15 %) wird gezahlt',
    kind: 'boolean',
    unit: 'none',
    section: 'minimum',
    supportsUnknown: false,
    unknownMode: 'none',
  },
  {
    id: 'contractualFixedMonthly',
    path: 'contractualFixedMonthly',
    labelKey: 'contract.bav.employerFixed',
    label: 'Zusätzlicher fester Arbeitgeberbeitrag',
    kind: 'number',
    unit: 'EUR/Monat',
    section: 'minimum',
    min: 0,
    max: 10_000,
    step: 10,
    supportsUnknown: true,
    unknownMode: 'explicit-unknown',
  },
  {
    id: 'contractualMatchPercent',
    path: 'contractualMatchPercent',
    labelKey: 'contract.bav.employerMatch',
    label: 'Arbeitgeberzuschuss in Prozent der Umwandlung',
    kind: 'number',
    unit: 'ratio',
    section: 'details',
    min: 0,
    max: 2,
    step: 0.01,
    supportsUnknown: true,
    unknownMode: 'explicit-unknown',
  },
  {
    id: 'pre2005EligibleTaxFree',
    path: 'pre2005EligibleTaxFree',
    labelKey: 'contract.bav.pre2005',
    label: 'Altvertrag erfüllt die Steuerfreiheits-Bedingungen (§52 Abs. 28 EStG a.F.)',
    kind: 'boolean',
    unit: 'none',
    section: 'details',
    supportsUnknown: false,
    unknownMode: 'none',
    visibleWhen: (d) => selected(d, 'durchfuehrungsweg') === 'direktversicherung_40b_alt',
  },
  {
    id: 'payoutMode',
    path: 'payoutMode',
    labelKey: 'contract.payoutMode',
    label: 'Auszahlungsform',
    kind: 'select',
    unit: 'none',
    section: 'details',
    options: PAYOUT_OPTIONS_FULL,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  rentenfaktorSpec((d) => selected(d, 'payoutMode') === 'leibrente'),
  zeitrenteYearsSpec((d) => selected(d, 'payoutMode') === 'zeitrente'),
  contributionGrowthSpec,
  ...FEE_SPECS,
]

const VERSICHERUNG_SPECS: readonly ContractFieldSpec[] = [
  labelSpec,
  anbieterSpec,
  statusSpec,
  currentValueSpec(),
  contributionSpec('monthlyContribution', 'Monatlicher Beitrag', 'contract.pav.contribution'),
  contractStartYearSpec('minimum'),
  {
    id: 'oldContractTaxFreeEligible',
    path: 'oldContractTaxFreeEligible',
    labelKey: 'contract.pav.oldContract',
    label: 'Altvertrag (vor 2005) erfüllt die Steuerfreiheits-Bedingungen',
    kind: 'boolean',
    unit: 'none',
    section: 'details',
    supportsUnknown: false,
    unknownMode: 'none',
    // §52 Abs. 28 EStG a.F.: the old-contract regime covers contracts concluded
    // *before* the boundary year, mirroring `deriveInsuranceTaxMode`.
    visibleWhen: (d) =>
      (numberOf(d, 'contractStartYear') ?? 9999) <
      legalConstants.insurance.pre2005YearBoundary,
  },
  {
    id: 'payoutMode',
    path: 'payoutMode',
    labelKey: 'contract.payoutMode',
    label: 'Auszahlungsform',
    kind: 'select',
    unit: 'none',
    section: 'details',
    options: PAYOUT_OPTIONS_FULL,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  rentenfaktorSpec((d) => selected(d, 'payoutMode') === 'leibrente'),
  zeitrenteYearsSpec((d) => selected(d, 'payoutMode') === 'zeitrente'),
  {
    id: 'surrenderHaircutPct',
    path: 'surrenderHaircutPct',
    labelKey: 'contract.pav.surrenderHaircut',
    label: 'Stornoabzug bei Kündigung',
    kind: 'number',
    unit: 'ratio',
    section: 'details',
    min: 0,
    max: 1,
    step: 0.01,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  contributionGrowthSpec,
  ...FEE_SPECS,
]

const BASISRENTE_SPECS: readonly ContractFieldSpec[] = [
  labelSpec,
  anbieterSpec,
  statusSpec,
  currentValueSpec(),
  contributionSpec(
    'monthlyGrossContribution',
    'Monatlicher Beitrag',
    'contract.basisrente.contribution',
  ),
  contractStartYearSpec('details'),
  {
    id: 'payoutMode',
    path: 'payoutMode',
    labelKey: 'contract.payoutMode',
    label: 'Auszahlungsform',
    kind: 'select',
    unit: 'none',
    section: 'details',
    options: BASISRENTE_PAYOUT_OPTIONS,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  rentenfaktorSpec(),
  ...FEE_SPECS,
]

const RIESTER_SPECS: readonly ContractFieldSpec[] = [
  labelSpec,
  anbieterSpec,
  statusSpec,
  // Riester keeps a second copy of the balance in `existingCapital` (the engine
  // reads that one). Mirror it so the two can never disagree.
  currentValueSpec(['existingCapital']),
  contributionSpec(
    'monthlyOwnContribution',
    'Monatlicher Eigenbeitrag',
    'contract.riester.ownContribution',
  ),
  contractStartYearSpec('details'),
  ...eligibilitySpecs(false),
  {
    id: 'payoutMode',
    path: 'payoutMode',
    labelKey: 'contract.payoutMode',
    label: 'Auszahlungsform',
    kind: 'select',
    unit: 'none',
    section: 'details',
    options: PAYOUT_OPTIONS_NO_KAPITAL,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  rentenfaktorSpec((d) => selected(d, 'payoutMode') === 'leibrente'),
  zeitrenteYearsSpec((d) => selected(d, 'payoutMode') === 'zeitrente'),
  ...FEE_SPECS,
]

const AVD_SPECS: readonly ContractFieldSpec[] = [
  labelSpec,
  anbieterSpec,
  statusSpec,
  currentValueSpec(),
  contributionSpec(
    'monthlyOwnContribution',
    'Monatlicher Eigenbeitrag',
    'contract.avd.ownContribution',
  ),
  contractStartYearSpec('details'),
  ...eligibilitySpecs(true),
  {
    id: 'subtype',
    path: 'subtype',
    labelKey: 'contract.avd.subtype',
    label: 'Depotvariante',
    kind: 'select',
    unit: 'none',
    section: 'details',
    options: AVD_SUBTYPE_OPTIONS,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  {
    id: 'payoutMode',
    path: 'payoutMode',
    labelKey: 'contract.payoutMode',
    label: 'Auszahlungsform',
    kind: 'select',
    unit: 'none',
    section: 'details',
    options: AVD_PAYOUT_OPTIONS,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  {
    id: 'payoutPlanEndAge',
    path: 'payoutPlanEndAge',
    labelKey: 'contract.avd.payoutPlanEndAge',
    label: 'Auszahlplan bis Alter',
    kind: 'number',
    unit: 'age',
    section: 'details',
    min: 85,
    max: 100,
    step: 1,
    supportsUnknown: false,
    unknownMode: 'none',
    visibleWhen: (d) => selected(d, 'payoutMode') === 'certified_payout_plan',
  },
  rentenfaktorSpec((d) => selected(d, 'payoutMode') !== 'certified_payout_plan'),
  ...FEE_SPECS,
]

const ETF_SPECS: readonly ContractFieldSpec[] = [
  labelSpec,
  anbieterSpec,
  statusSpec,
  currentValueSpec(),
  contributionSpec('monthlyContribution', 'Monatliche Sparrate', 'contract.etf.contribution'),
  contractStartYearSpec('details'),
  {
    id: 'annualAssetFee',
    path: 'annualAssetFee',
    labelKey: 'contract.etf.ter',
    label: 'Laufende Fondskosten p.a. (TER)',
    kind: 'number',
    unit: 'ratio',
    section: 'details',
    min: 0,
    max: 0.05,
    step: 0.0005,
    supportsUnknown: false,
    unknownMode: 'none',
  },
  contributionGrowthSpec,
]

/** Every editable field of every multi-instance product, in editor order. */
export const CONTRACT_FIELD_SPECS: Record<
  MultiInstanceProductId,
  readonly ContractFieldSpec[]
> = {
  bav: BAV_SPECS,
  versicherung: VERSICHERUNG_SPECS,
  basisrente: BASISRENTE_SPECS,
  riester: RIESTER_SPECS,
  altersvorsorgedepot: AVD_SPECS,
  etf: ETF_SPECS,
}

/**
 * The `inputStatus` key `selectResultReadiness` inspects for "has the user
 * confirmed this contract's costs?". It is a *derived* key, not a field: the
 * fee matrix has seven inputs and readiness asks one question. Stamped
 * `'entered'` by `draftToInstancePatch` as soon as any fee input carries a real
 * user status, so a fully-specified contract can reach readiness `available`.
 *
 * Mirrors `FEE_FIELD_BY_PRODUCT` in `src/app/resultReadiness.ts`.
 */
export const FEE_STATUS_KEY_BY_PRODUCT: Record<MultiInstanceProductId, string> = {
  etf: 'fees',
  versicherung: 'effektivkostenPct',
  bav: 'effektivkostenPct',
  basisrente: 'fees',
  altersvorsorgedepot: 'fees',
  riester: 'fees',
}

/** Fee inputs that stamp the derived fee status when the user edits them. */
const FEE_INPUT_IDS_BY_PRODUCT: Record<MultiInstanceProductId, readonly string[]> = {
  etf: ['annualAssetFee'],
  versicherung: FEE_SPECS.map((s) => s.id),
  bav: FEE_SPECS.map((s) => s.id),
  basisrente: FEE_SPECS.map((s) => s.id),
  altersvorsorgedepot: FEE_SPECS.map((s) => s.id),
  riester: FEE_SPECS.map((s) => s.id),
}

/** All specs for a product, including conditionally-hidden ones. */
export function fieldSpecs(productId: MultiInstanceProductId): readonly ContractFieldSpec[] {
  return CONTRACT_FIELD_SPECS[productId]
}

/** Specs whose `visibleWhen` currently holds. The UI renders exactly these. */
export function visibleFieldSpecs(draft: ContractDraft): readonly ContractFieldSpec[] {
  return fieldSpecs(draft.productId).filter((spec) => !spec.visibleWhen || spec.visibleWhen(draft))
}

function specById(
  productId: MultiInstanceProductId,
  id: string,
): ContractFieldSpec | undefined {
  return CONTRACT_FIELD_SPECS[productId].find((s) => s.id === id)
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

/** Any instance shape, as a bag of paths. Narrowed by the product registry. */
type InstanceLike = Record<string, unknown>

/**
 * What the adapters accept. Domain instance interfaces have no index signature,
 * so the public boundary takes a plain object and narrows internally.
 */
export type ContractInstanceLike = object

export interface ContractDraft {
  readonly productId: MultiInstanceProductId
  /** Set when editing an existing contract; absent for a new one. */
  readonly instanceId?: string
  /**
   * The instance this draft edits, or the registry default for a new contract.
   * Values the draft does not cover (and every `unknown` field) come from here,
   * which is what makes "unknown never writes 0" true by construction.
   */
  readonly base: InstanceLike
  readonly fields: Readonly<Record<string, Field<ContractFieldValue>>>
  /** Core field ids the user has neither answered nor explicitly declined. */
  readonly pending: readonly string[]
  readonly evidenceMap: Readonly<Record<string, EvidenceState>>
  /** Status keys carried through untouched (keys outside the spec table). */
  readonly inputStatus: Readonly<InputStatusMap>
}

/** Draft-only status. `'empty'` exists on a new contract's unanswered core fields. */
export type ContractFieldState = InputStatus | 'empty'

function getAtPath(source: InstanceLike, path: string): unknown {
  let current: unknown = source
  for (const key of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function setAtPath(target: InstanceLike, path: string, value: unknown): void {
  const keys = path.split('.')
  let current: Record<string, unknown> = target
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const next = current[key]
    // Clone nested objects on write so the base instance is never mutated.
    const cloned: Record<string, unknown> =
      next !== null && typeof next === 'object' ? { ...(next as Record<string, unknown>) } : {}
    current[key] = cloned
    current = cloned
  }
  current[keys[keys.length - 1]] = value
}

function isFieldValue(value: unknown): value is ContractFieldValue {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
}

function fallbackFor(spec: ContractFieldSpec): ContractFieldValue {
  switch (spec.kind) {
    case 'number':
      return spec.min ?? 0
    case 'boolean':
      return false
    case 'select':
      return spec.options?.[0]?.value ?? ''
    default:
      return ''
  }
}

/**
 * Build a draft from an existing instance.
 *
 * Legacy-conservative: every status goes through `resolveInputStatus`, so an
 * instance saved before this metadata existed reads back entirely `'assumed'` —
 * never `'unknown'`, never `'entered'`. Opening the editor confirms nothing.
 */
export function draftFromInstance(
  productId: MultiInstanceProductId,
  source: ContractInstanceLike,
): ContractDraft {
  const instance = source as InstanceLike
  const evidenceMap = (instance.evidenceMap ?? {}) as Record<string, EvidenceState>
  const inputStatus = (instance.inputStatus ?? {}) as InputStatusMap
  const fields: Record<string, Field<ContractFieldValue>> = {}

  for (const spec of CONTRACT_FIELD_SPECS[productId]) {
    const raw = getAtPath(instance, spec.path)
    const value = isFieldValue(raw) ? raw : fallbackFor(spec)
    const status = resolveInputStatus(inputStatus, evidenceMap[spec.id], spec.id)
    fields[spec.id] = fieldFromStatus(value, status)
  }

  return {
    productId,
    instanceId: typeof instance.instanceId === 'string' ? instance.instanceId : undefined,
    base: instance,
    fields,
    pending: [],
    evidenceMap: { ...evidenceMap },
    inputStatus: { ...inputStatus },
  }
}

export interface NewDraftContext {
  /** Used for `contractStartYear` and the Riester / AVD career-starter age. */
  readonly currentYear?: number
  /** The saver's current age, seeded into `eligibility.ageAtContractStart`. */
  readonly age?: number
}

/**
 * Build a draft for a brand-new contract.
 *
 * Every value starts from the inventory registry's default instance with status
 * `'assumed'` — an honest "this is a model value you have not reviewed". The two
 * core fields (current value and monthly contribution) start `empty` instead:
 * a new contract has no defensible default balance or contribution, so the user
 * must type a number (0 included) or tick "Weiß ich nicht". `validateDraft`
 * enforces that.
 */
export function newDraft(
  productId: MultiInstanceProductId,
  context: NewDraftContext = {},
): ContractDraft {
  const currentYear = context.currentYear ?? new Date().getFullYear()
  const entry = INVENTORY_PRODUCT_REGISTRY[productId]
  const base = entry.createDefault(currentYear, 1, () => '') as unknown as InstanceLike
  // The registry default carries a generated name ("ETF #1"). A brand-new
  // contract has no name until the user types one — otherwise the generated
  // string looks like the user's own input and survives into the workspace as
  // "ETF #1", which then gets numbered a second time on add.
  setAtPath(base, 'label', '')

  if (context.age !== undefined && getAtPath(base, 'eligibility') !== undefined) {
    setAtPath(base, 'eligibility.ageAtContractStart', context.age)
  }

  const fields: Record<string, Field<ContractFieldValue>> = {}
  const pending: string[] = []
  for (const spec of CONTRACT_FIELD_SPECS[productId]) {
    const raw = getAtPath(base, spec.path)
    fields[spec.id] = assumed(isFieldValue(raw) ? raw : fallbackFor(spec))
    if (spec.core) pending.push(spec.id)
  }

  return {
    productId,
    base: { ...base, instanceId: undefined, label: '', anbieter: undefined },
    fields,
    pending,
    evidenceMap: {},
    inputStatus: {},
  }
}

/** Convenience wrapper: seeds the saver's age from the workspace baseline profile. */
export function newDraftFromWorkspace(
  productId: MultiInstanceProductId,
  workspace: Workspace,
  currentYear?: number,
): ContractDraft {
  return newDraft(productId, { currentYear, age: workspace.baseline.profile.age })
}

// --- reads -----------------------------------------------------------------

/** The field's value, or `null` for an explicit unknown or an unanswered core field. */
export function draftFieldValue(
  draft: ContractDraft,
  id: string,
): ContractFieldValue | null {
  if (draft.pending.includes(id)) return null
  const field = draft.fields[id]
  if (!field) return null
  return field.status === 'unknown' ? null : field.value
}

/** The field's state, including the draft-only `'empty'`. */
export function draftFieldState(draft: ContractDraft, id: string): ContractFieldState {
  if (draft.pending.includes(id)) return 'empty'
  return draft.fields[id]?.status ?? 'assumed'
}

/** `true` when the user explicitly declined this field. */
export function isDraftFieldUnknown(draft: ContractDraft, id: string): boolean {
  const field = draft.fields[id]
  return field !== undefined && isUnknown(field) && !draft.pending.includes(id)
}

// --- writes ----------------------------------------------------------------

/**
 * Set one field. Neighbours are never touched, and typing a value — `0`
 * included — always clears both `unknown` and `empty`.
 */
export function patchDraftField(
  draft: ContractDraft,
  id: string,
  value: ContractFieldValue,
  status: FieldStatus = 'entered',
): ContractDraft {
  const current = draft.fields[id]
  if (!current) return draft
  return {
    ...draft,
    fields: { ...draft.fields, [id]: setValue(current, value, status) },
    pending: draft.pending.filter((key) => key !== id),
  }
}

/**
 * Mark one field "Weiß ich nicht".
 *
 * For a field whose `unknownMode` is `'assumed-default'` (bAV Durchführungsweg)
 * this writes the registry default with status `'assumed'` instead — the user
 * gets a labelled assumption, not a hole. Every other field becomes an explicit
 * `'unknown'` that keeps its previous value in `previousValue`.
 */
export function setDraftFieldUnknown(draft: ContractDraft, id: string): ContractDraft {
  const spec = specById(draft.productId, id)
  const current = draft.fields[id]
  if (!spec || !current || spec.unknownMode === 'none') return draft

  if (spec.unknownMode === 'assumed-default') {
    const fallback = getAtPath(draft.base, spec.path)
    const value = isFieldValue(fallback) ? fallback : fallbackFor(spec)
    return {
      ...draft,
      fields: { ...draft.fields, [id]: assumed(value) },
      pending: draft.pending.filter((key) => key !== id),
    }
  }

  return {
    ...draft,
    fields: { ...draft.fields, [id]: setUnknown(current) },
    pending: draft.pending.filter((key) => key !== id),
  }
}

// ---------------------------------------------------------------------------
// Validation — rejects, never clips
// ---------------------------------------------------------------------------

export type ContractDraftErrors = Record<string, string>

/**
 * Validate a draft. Out-of-range values are **rejected**, never silently
 * clamped: an existing contract whose Eigenbeitrag already exceeds a threshold
 * must not be quietly cut down by opening the editor (journey map, AVD row).
 */
export function validateDraft(draft: ContractDraft): ContractDraftErrors {
  const errors: ContractDraftErrors = {}

  for (const spec of visibleFieldSpecs(draft)) {
    if (draft.pending.includes(spec.id)) {
      errors[spec.id] = 'Bitte einen Wert eintragen oder „Weiß ich nicht" wählen.'
      continue
    }
    const field = draft.fields[spec.id]
    if (!field || field.status === 'unknown') continue
    const value = field.value

    if (spec.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors[spec.id] = 'Bitte eine Zahl eintragen.'
        continue
      }
      if (spec.min !== undefined && value < spec.min) {
        errors[spec.id] = `Wert darf nicht kleiner als ${spec.min} sein.`
        continue
      }
      if (spec.max !== undefined && value > spec.max) {
        errors[spec.id] = `Wert darf nicht größer als ${spec.max} sein.`
      }
      continue
    }

    if (spec.kind === 'select') {
      const allowed = spec.options?.some((option) => option.value === value)
      if (!allowed) errors[spec.id] = 'Bitte eine der angebotenen Optionen wählen.'
    }
  }

  return errors
}

/** `true` when no field carries an error. */
export function isDraftValid(errors: ContractDraftErrors): boolean {
  return Object.keys(errors).length === 0
}

/** `true` when any field differs from the draft it was seeded with. */
export function contractDraftDirty(draft: ContractDraft, initial: ContractDraft): boolean {
  if (draft.pending.length !== initial.pending.length) return true
  for (const spec of CONTRACT_FIELD_SPECS[draft.productId]) {
    const a = draft.fields[spec.id]
    const b = initial.fields[spec.id]
    if (a?.status !== b?.status) return true
    if (draftFieldValue(draft, spec.id) !== draftFieldValue(initial, spec.id)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export interface ContractDraftPatch {
  /** Instance fields to write. Nested objects (`fees`, `eligibility`) are complete. */
  patch: Record<string, unknown>
  inputStatus: InputStatusMap
  evidenceMap: Record<string, EvidenceState>
}

/**
 * Turn a draft into an instance patch plus its metadata.
 *
 * Binding semantics:
 *
 *  - **Unknown never writes a value.** The engine field keeps whatever the base
 *    instance holds (the existing value, or the registry default for a new
 *    contract) and the status map records `'unknown'`. The evidence key is
 *    *deleted*, because `EvidenceState` has no unknown variant and a stale
 *    `model_estimate` would misreport the answer.
 *  - **A typed 0 is a real answer.** It writes 0 with status `'entered'`.
 *  - **Neighbours are untouched.** Only the fields in the spec table are
 *    written; every other status key on the instance survives.
 *  - **Fees.** The derived readiness key (`FEE_STATUS_KEY_BY_PRODUCT`) is
 *    stamped `'entered'` as soon as one fee input carries a user status.
 *    Untouched fee metadata stays `'assumed'`.
 */
export function draftToInstancePatch(draft: ContractDraft): ContractDraftPatch {
  const patch: Record<string, unknown> = {}
  const inputStatus: InputStatusMap = { ...draft.inputStatus }
  const evidenceMap: Record<string, EvidenceState> = { ...draft.evidenceMap }

  // Seed nested containers from the base so a partial write cannot drop siblings.
  for (const spec of CONTRACT_FIELD_SPECS[draft.productId]) {
    const root = spec.path.split('.')[0]
    if (root !== spec.path && patch[root] === undefined) {
      const existing = getAtPath(draft.base, root)
      patch[root] =
        existing !== null && typeof existing === 'object'
          ? { ...(existing as Record<string, unknown>) }
          : {}
    }
  }

  for (const spec of CONTRACT_FIELD_SPECS[draft.productId]) {
    const field = draft.fields[spec.id]
    if (!field) continue

    if (draft.pending.includes(spec.id)) {
      // Unanswered on a draft that was committed anyway (caller skipped
      // validation): keep the base value and label it for what it is.
      inputStatus[spec.id] = 'assumed'
      continue
    }

    if (field.status === 'unknown') {
      inputStatus[spec.id] = 'unknown'
      delete evidenceMap[spec.id]
      continue
    }

    setAtPath(patch, spec.path, field.value)
    for (const mirror of spec.mirrorPaths ?? []) setAtPath(patch, mirror, field.value)
    inputStatus[spec.id] = field.status
    const evidence = inputStatusToEvidenceState(field.status)
    if (evidence) evidenceMap[spec.id] = evidence
    else delete evidenceMap[spec.id]
  }

  // Derived fee readiness key.
  const feeKey = FEE_STATUS_KEY_BY_PRODUCT[draft.productId]
  const feeTouched = FEE_INPUT_IDS_BY_PRODUCT[draft.productId].some((id) => {
    const status = draft.fields[id]?.status
    return status === 'entered' || status === 'document'
  })
  if (feeTouched) {
    inputStatus[feeKey] = 'entered'
    const evidence = inputStatusToEvidenceState('entered')
    if (evidence) evidenceMap[feeKey] = evidence
  }

  return { patch, inputStatus, evidenceMap }
}

/**
 * Build a complete, id-bearing instance from a draft for a new contract.
 *
 * The base is the registry default, so every engine field the editor does not
 * expose still arrives fully populated.
 */
export function draftToNewInstance(
  draft: ContractDraft,
  makeId: (productId: string) => string = newInstanceId,
): Record<string, unknown> {
  const { patch, inputStatus, evidenceMap } = draftToInstancePatch(draft)
  const instanceId = makeId(draft.productId)
  const labelValue = draftFieldValue(draft, 'label')
  const anbieterValue = draftFieldValue(draft, 'anbieter')
  const anbieter = typeof anbieterValue === 'string' && anbieterValue !== '' ? anbieterValue : undefined
  const label =
    typeof labelValue === 'string' && labelValue.trim() !== ''
      ? labelValue
      : defaultInstanceLabel(draft.productId, 1, anbieter)

  return {
    ...draft.base,
    ...patch,
    instanceId,
    label,
    anbieter,
    evidenceMap,
    inputStatus,
  }
}

/**
 * The contribution field id for a product — the same map the readiness selector
 * uses, re-exported so the editor and the readiness reasons cannot drift.
 */
export function contributionFieldId(productId: MultiInstanceProductId): string {
  return CONTRIBUTION_FIELD_BY_PRODUCT[productId]
}
