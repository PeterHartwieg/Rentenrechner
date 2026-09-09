/**
 * Editor bounds vs. persisted validators.
 *
 * The contract editor writes straight into the v2 workspace, and the load path
 * runs every instance through `INSTANCE_VALIDATOR_BY_PRODUCT`. When the editor
 * accepts a value the validator rejects, that instance is dropped on the next
 * load — so a value the user typed and saved disappears. These tests pin the
 * two directions of that contract:
 *
 *  1. every numeric spec, driven to its own `min` and `max`, produces an
 *     instance the real validator accepts;
 *  2. every field whose validator uses `intInRange` is rejected by
 *     `validateDraft` when given a fractional value.
 */

import { describe, expect, it } from 'vitest'
import {
  CONTRACT_FIELD_SPECS,
  FORM_ERROR_KEY,
  SHARED_FIELD_BOUNDS,
  draftPassesInstanceValidator,
  fieldSpecs,
  isDraftValid,
  newDraft,
  patchDraftField,
  validateDraft,
  type ContractDraft,
  type ContractFieldSpec,
} from './contractDraft'
import type { MultiInstanceProductId } from './inventoryProductRegistry'
import { AVD_UI_SELECTABLE_PAYOUT_MODES } from '../../engine/products/altersvorsorgedepot.validation'

const PRODUCT_IDS = Object.keys(CONTRACT_FIELD_SPECS) as MultiInstanceProductId[]

/** Units whose engine field is validated with `intInRange`. */
const INTEGER_UNITS = new Set(['year', 'age', 'years', 'count'])

function baseDraft(productId: MultiInstanceProductId): ContractDraft {
  let draft = newDraft(productId, { currentYear: 2026, age: 40 })
  // Answer the core fields so `validateDraft` reports bound violations rather
  // than the "still empty" message.
  for (const spec of fieldSpecs(productId)) {
    if (spec.core) draft = patchDraftField(draft, spec.id, 100)
  }
  return draft
}

/**
 * The error the editor reports for one spec. A spec hidden behind a
 * `visibleWhen` predicate is reported form-level (there is no input to attach
 * the message to), so both keys count.
 */
function errorFor(draft: ContractDraft, spec: ContractFieldSpec): string | undefined {
  const errors = validateDraft(draft)
  return errors[spec.id] ?? errors[FORM_ERROR_KEY]
}

function numericSpecs(productId: MultiInstanceProductId): ContractFieldSpec[] {
  return fieldSpecs(productId).filter(
    (spec): spec is ContractFieldSpec =>
      spec.kind === 'number' && spec.min !== undefined && spec.max !== undefined,
  )
}

describe('spec bounds are derived from the persisted validators', () => {
  it('never widens a shared bound', () => {
    for (const productId of PRODUCT_IDS) {
      for (const spec of fieldSpecs(productId)) {
        const bound = SHARED_FIELD_BOUNDS[spec.id]
        if (!bound) continue
        expect(spec.min, `${productId}.${spec.id} min`).toBeGreaterThanOrEqual(bound.min)
        expect(spec.max, `${productId}.${spec.id} max`).toBeLessThanOrEqual(bound.max)
        expect(spec.integer === true, `${productId}.${spec.id} integer`).toBe(
          bound.integer === true,
        )
      }
    }
  })

  it('marks every year / age / years / count field as an integer field', () => {
    for (const productId of PRODUCT_IDS) {
      for (const spec of fieldSpecs(productId)) {
        if (spec.kind !== 'number' || !INTEGER_UNITS.has(spec.unit)) continue
        expect(spec.integer, `${productId}.${spec.id}`).toBe(true)
      }
    }
  })
})

describe('every spec bound round-trips through the real instance validator', () => {
  for (const productId of PRODUCT_IDS) {
    for (const spec of numericSpecs(productId)) {
      for (const edge of ['min', 'max'] as const) {
        it(`${productId}.${spec.id} at ${edge}`, () => {
          const value = edge === 'min' ? spec.min! : spec.max!
          const draft = patchDraftField(baseDraft(productId), spec.id, value)
          // The editor accepts it …
          expect(isDraftValid(validateDraft(draft))).toBe(true)
          // … and so does the validator the load path runs.
          expect(draftPassesInstanceValidator(draft)).toBe(true)
        })
      }
    }
  }
})

describe('validateDraft rejects fractional input for integer fields', () => {
  for (const productId of PRODUCT_IDS) {
    for (const spec of numericSpecs(productId)) {
      if (!spec.integer) continue
      it(`${productId}.${spec.id}`, () => {
        const draft = patchDraftField(baseDraft(productId), spec.id, spec.min! + 0.5)
        expect(errorFor(draft, spec)).toContain('Bitte eine ganze Zahl eintragen.')
      })
    }
  }
})

describe('the four bounds that used to drift', () => {
  // Each of these was wider in the editor than in its validator, so a value the
  // editor accepted discarded the whole saved workspace on the next load.
  it('rejects a Beitragsdynamik above the validator ceiling', () => {
    const draft = patchDraftField(baseDraft('bav'), 'annualContributionGrowthRate', 0.15)
    expect(validateDraft(draft)['annualContributionGrowthRate']).toBeDefined()
  })

  it('rejects a Zeitrente runtime above the validator ceiling', () => {
    let draft = patchDraftField(baseDraft('bav'), 'payoutMode', 'zeitrente')
    draft = patchDraftField(draft, 'zeitrenteYears', 55)
    expect(validateDraft(draft)['zeitrenteYears']).toBeDefined()
  })

  it('rejects a Rentenfaktor above the validator ceiling', () => {
    let draft = patchDraftField(baseDraft('versicherung'), 'payoutMode', 'leibrente')
    draft = patchDraftField(draft, 'rentenfaktor', 120)
    expect(validateDraft(draft)['rentenfaktor']).toBeDefined()
  })

  it('rejects an employer match above the validator ceiling', () => {
    const draft = patchDraftField(baseDraft('bav'), 'contractualMatchPercent', 1.5)
    expect(validateDraft(draft)['contractualMatchPercent']).toBeDefined()
  })
})

describe('AVD payout options stay behind the gh#63 gate', () => {
  const avdPayoutSpec = fieldSpecs('altersvorsorgedepot').find((s) => s.id === 'payoutMode')!

  it('offers exactly the UI-selectable modes', () => {
    expect(avdPayoutSpec.options?.map((o) => o.value)).toEqual([
      ...AVD_UI_SELECTABLE_PAYOUT_MODES,
    ])
  })

  it('does not offer hybrid_80_annuity', () => {
    // `hybrid_80_annuity` still validates (legacy saved state keeps working),
    // but the engine truncates its 80 % lifelong sleeve at `payoutEndAge`, so
    // it must not be newly selectable. See altersvorsorgedepot.validation.ts.
    expect(avdPayoutSpec.options?.map((o) => o.value)).not.toContain('hybrid_80_annuity')
    const draft = patchDraftField(
      baseDraft('altersvorsorgedepot'),
      'payoutMode',
      'hybrid_80_annuity',
    )
    expect(validateDraft(draft)['payoutMode']).toBe('Bitte eine der angebotenen Optionen wählen.')
  })
})
