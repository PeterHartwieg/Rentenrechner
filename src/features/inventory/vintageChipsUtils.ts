/**
 * Non-React utilities shared between VintageChips.tsx and its consumers.
 * Kept separate to satisfy react-refresh/only-export-components.
 */

import type { Atom, AtomId } from '../../app/recommendations'
import { deriveInsuranceTaxMode, computeRuntimeYearsAtRetirement } from '../../engine/insurancePayout'
import { deriveBavLumpSumTaxMode } from '../../engine/bavPayout'
import { activeRules } from '../../rules'
import type { BavDraft, PavDraft, RiesterDraft } from './types'

const PRIVILEGE_ATOM_IDS: ReadonlySet<AtomId> = new Set<AtomId>([
  'pre_2005_pav_taxfree_capital',
  'halbeinkuenfte_pav_eligible',
  'bav_40b_alt_eligible',
])

const CAVEAT_ATOM_IDS: ReadonlySet<AtomId> = new Set<AtomId>([
  'bav_40b_alt_conditions_unmet',
  'pre_2005_pav_high_garantiezins',
  'riester_pre_2008_zulage',
])

export const VINTAGE_ATOM_IDS: ReadonlySet<AtomId> = new Set<AtomId>([
  ...PRIVILEGE_ATOM_IDS,
  ...CAVEAT_ATOM_IDS,
  'bav_durchfuehrungsweg_direktzusage',
])

export function chipVariant(atomId: AtomId): 'privilege' | 'caveat' | 'info' {
  if (PRIVILEGE_ATOM_IDS.has(atomId)) return 'privilege'
  if (CAVEAT_ATOM_IDS.has(atomId)) return 'caveat'
  return 'info'
}

/** Returns true when the atom id is one of the vintage-detection atom ids. */
export function isVintageAtomId(id: AtomId): boolean {
  return VINTAGE_ATOM_IDS.has(id)
}

// ---------------------------------------------------------------------------
// Draft preview — derive vintage atoms for wizard drafts without instanceId
//
// Uses the same engine helpers as the live vintage rules (pavVintageRule,
// bavVintageRule, riesterVintageRule in recommendations.ts) so the chip text
// shown in the wizard is byte-identical to the chip text shown in the
// dashboard after commit.
// ---------------------------------------------------------------------------

const RULES_YEAR = activeRules.year

// Stable draft-scope sentinel — the wizard uses this as the atom context key
// instead of a real instanceId. VintageChips renders it correctly because
// it only reads `atom.id` for chip text (via renderAtom) and the variant.
const DRAFT_INSTANCE_SENTINEL = 'draft-preview'

/**
 * Derive vintage-detection atoms for a pAV wizard draft.
 * Mirrors pavVintageRule in recommendations.ts.
 * Returns an empty array for non-vintage drafts.
 */
export function pavDraftVintageAtoms(draft: PavDraft, age: number, retirementAge: number): Atom[] {
  const runtimeYears = computeRuntimeYearsAtRetirement(
    draft.contractStartYear,
    RULES_YEAR,
    age,
    retirementAge,
  )
  const oldContractTaxFreeEligible = draft.contractStartYear <= 2004
  const taxMode = deriveInsuranceTaxMode(
    draft.contractStartYear,
    runtimeYears,
    retirementAge,
    oldContractTaxFreeEligible,
  )

  const atoms: Atom[] = []

  if (taxMode === 'pre2005') {
    atoms.push({
      id: 'pre_2005_pav_taxfree_capital',
      priority: 'high',
      context: {
        instanceId: DRAFT_INSTANCE_SENTINEL,
        contractStartYear: draft.contractStartYear,
        runtimeYearsAtRetirement: runtimeYears,
        productId: 'versicherung',
      },
    })
  } else if (taxMode === 'halbeinkuenfte') {
    atoms.push({
      id: 'halbeinkuenfte_pav_eligible',
      priority: 'medium',
      context: { instanceId: DRAFT_INSTANCE_SENTINEL, productId: 'versicherung' },
    })
  }

  if (draft.contractStartYear <= 2003) {
    atoms.push({
      id: 'pre_2005_pav_high_garantiezins',
      priority: 'medium',
      context: { instanceId: DRAFT_INSTANCE_SENTINEL, productId: 'versicherung' },
    })
  }

  return atoms
}

/**
 * Derive vintage-detection atoms for a bAV wizard draft.
 * Mirrors bavVintageRule in recommendations.ts.
 * Returns an empty array for non-vintage drafts.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function bavDraftVintageAtoms(draft: BavDraft, _age: number, _retirementAge: number): Atom[] {
  // pre2005EligibleTaxFree is only set on committed instances. For drafts,
  // derive it from contractStartYear (same heuristic as pavDraftToInstance for
  // oldContractTaxFreeEligible — the user can refine via evidence after commit).
  const pre2005EligibleTaxFree = draft.contractStartYear <= 2004
  const lumpSumTaxMode = deriveBavLumpSumTaxMode(draft.durchfuehrungsweg, pre2005EligibleTaxFree)

  const atoms: Atom[] = []

  if (draft.durchfuehrungsweg === 'direktversicherung_40b_alt') {
    if (lumpSumTaxMode === 'pre2005_steuerfrei') {
      atoms.push({
        id: 'bav_40b_alt_eligible',
        priority: 'high',
        context: { instanceId: DRAFT_INSTANCE_SENTINEL, productId: 'bav' },
      })
    } else {
      atoms.push({
        id: 'bav_40b_alt_conditions_unmet',
        priority: 'medium',
        context: { instanceId: DRAFT_INSTANCE_SENTINEL, productId: 'bav' },
      })
    }
  }

  if (
    draft.durchfuehrungsweg === 'direktzusage' ||
    draft.durchfuehrungsweg === 'unterstuetzungskasse'
  ) {
    atoms.push({
      id: 'bav_durchfuehrungsweg_direktzusage',
      priority: 'low',
      context: {
        instanceId: DRAFT_INSTANCE_SENTINEL,
        durchfuehrungsweg: draft.durchfuehrungsweg,
        productId: 'bav',
      },
    })
  }

  return atoms
}

/**
 * Derive vintage-detection atoms for a Riester wizard draft.
 * Mirrors riesterVintageRule in recommendations.ts.
 * Returns an empty array for non-vintage drafts.
 */
export function riesterDraftVintageAtoms(
  draft: RiesterDraft,
  childBirthYears: readonly number[],
  _age: number, // eslint-disable-line @typescript-eslint/no-unused-vars
  _retirementAge: number, // eslint-disable-line @typescript-eslint/no-unused-vars
): Atom[] {
  if (
    draft.contractStartYear <= 2007 &&
    childBirthYears.some((y) => y >= 2008)
  ) {
    return [{
      id: 'riester_pre_2008_zulage',
      priority: 'medium',
      context: { instanceId: DRAFT_INSTANCE_SENTINEL, productId: 'riester' },
    }]
  }
  return []
}
