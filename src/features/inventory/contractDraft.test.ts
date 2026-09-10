/**
 * Contract-draft adapter tests (2B mechanical).
 *
 * The load-bearing property is that four states stay distinct all the way to
 * the engine: a typed value, a typed `0`, an explicit "weiß ich nicht", and an
 * absent answer on a legacy contract. Every test below pins one of those.
 */

import { describe, expect, it } from 'vitest'
import { defaultWorkspace } from '../../storage'
import { addInstanceToWorkspace } from '../../app/workspaceIdentity'
import type {
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
} from '../../domain/instances'
import { legalConstants } from '../../rules/legalConstants'
import {
  CONTRACT_FIELD_SPECS,
  contractDraftDirty,
  draftFieldState,
  draftFieldValue,
  draftFromInstance,
  draftToInstancePatch,
  draftToNewInstance,
  fieldSpecs,
  isDraftValid,
  newDraft,
  newDraftFromWorkspace,
  patchDraftField,
  setDraftFieldUnknown,
  validateDraft,
  visibleFieldSpecs,
} from './contractDraft'
import { INVENTORY_PRODUCT_REGISTRY } from './inventoryProductRegistry'

function bavInstance(overrides: Partial<BavInstance> = {}): BavInstance {
  const base = INVENTORY_PRODUCT_REGISTRY.bav.createDefault(2026, 1, () => 'bav-test0001')
  return { ...base, ...overrides }
}

function insuranceInstance(): InsuranceInstance {
  return INVENTORY_PRODUCT_REGISTRY.versicherung.createDefault(2026, 1, () => 'pav-test0001')
}

function etfInstance(overrides: Partial<EtfInstance> = {}): EtfInstance {
  const base = INVENTORY_PRODUCT_REGISTRY.etf.createDefault(2026, 1, () => 'etf-test0001')
  return { ...base, ...overrides }
}

// ---------------------------------------------------------------------------
// Spec table
// ---------------------------------------------------------------------------

describe('CONTRACT_FIELD_SPECS', () => {
  it.each(['riester', 'altersvorsorgedepot'] as const)(
    'shows the %s child allowance claim only for profiles with children',
    (productId) => {
      const id = 'eligibility.claimsChildAllowance'
      for (const childBirthYears of [[], [2020]]) {
        const workspace = structuredClone(defaultWorkspace)
        workspace.baseline.profile.childBirthYears = childBirthYears
        const draft = newDraftFromWorkspace(productId, workspace, 2026)
        const spec = visibleFieldSpecs(draft).find((field) => field.id === id)
        if (childBirthYears.length > 0) {
          expect(spec).toMatchObject({
            labelKey: 'contract.eligibility.claimsChildAllowance',
            kind: 'boolean',
            section: 'details',
            supportsUnknown: false,
          })
        } else {
          expect(spec).toBeUndefined()
        }
      }
    },
  )

  it('declares a core current value and a core contribution for every product', () => {
    for (const [productId, specs] of Object.entries(CONTRACT_FIELD_SPECS)) {
      const core = specs.filter((s) => s.core).map((s) => s.id)
      expect(core, productId).toContain('currentValueEUR')
      expect(core.length, productId).toBe(2)
    }
  })

  it('uses unique field ids per product', () => {
    for (const [productId, specs] of Object.entries(CONTRACT_FIELD_SPECS)) {
      const ids = specs.map((s) => s.id)
      expect(new Set(ids).size, productId).toBe(ids.length)
    }
  })

  it('never offers an unknown control for a field that cannot be unknown', () => {
    for (const specs of Object.values(CONTRACT_FIELD_SPECS)) {
      for (const spec of specs) {
        expect(spec.supportsUnknown).toBe(spec.unknownMode !== 'none')
      }
    }
  })

  it('hides the Rentenfaktor until the payout mode needs it', () => {
    const draft = draftFromInstance('bav', bavInstance({ payoutMode: 'kapitalverzehr' }))
    const visible = visibleFieldSpecs(draft).map((s) => s.id)
    expect(visible).not.toContain('rentenfaktor')

    const leibrente = patchDraftField(draft, 'payoutMode', 'leibrente')
    expect(visibleFieldSpecs(leibrente).map((s) => s.id)).toContain('rentenfaktor')
  })

  it('offers the pAV old-contract question only below the §52 Abs. 28 boundary year', () => {
    const draft = draftFromInstance('versicherung', insuranceInstance())
    const has = (year: number) =>
      visibleFieldSpecs(patchDraftField(draft, 'contractStartYear', year))
        .map((s) => s.id)
        .includes('oldContractTaxFreeEligible')

    expect(legalConstants.insurance.pre2005YearBoundary).toBe(2005)
    expect(has(2004)).toBe(true)
    expect(has(2005)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Legacy reads
// ---------------------------------------------------------------------------

describe('draftFromInstance', () => {
  it('defaults the child allowance claim to true and preserves explicit toggles', () => {
    const id = 'eligibility.claimsChildAllowance'
    const instance = INVENTORY_PRODUCT_REGISTRY.altersvorsorgedepot.createDefault(
      2026, 1, () => 'avd-test0001',
    )
    const draft = draftFromInstance('altersvorsorgedepot', instance)
    expect(draftFieldValue(draft, id)).toBe(true)
    for (const checked of [false, true]) {
      const { patch } = draftToInstancePatch(patchDraftField(draft, id, checked))
      expect(patch).toMatchObject({ eligibility: { claimsChildAllowance: checked } })
      expect(draftFieldValue(draftFromInstance('altersvorsorgedepot', {
        ...instance, ...patch,
      }), id)).toBe(checked)
    }
  })

  it('reads a legacy instance with no metadata as entirely assumed, values intact', () => {
    const instance = bavInstance({ monthlyGrossConversion: 250, currentValueEUR: 4200 })
    const draft = draftFromInstance('bav', instance)

    for (const spec of fieldSpecs('bav')) {
      expect(draftFieldState(draft, spec.id), spec.id).toBe('assumed')
    }
    expect(draftFieldValue(draft, 'monthlyGrossConversion')).toBe(250)
    expect(draftFieldValue(draft, 'currentValueEUR')).toBe(4200)
  })

  it('restores an explicit unknown from inputStatus without inventing a value', () => {
    const instance = bavInstance({
      currentValueEUR: 4200,
      inputStatus: { currentValueEUR: 'unknown', monthlyGrossConversion: 'entered' },
    })
    const draft = draftFromInstance('bav', instance)

    expect(draftFieldState(draft, 'currentValueEUR')).toBe('unknown')
    expect(draftFieldValue(draft, 'currentValueEUR')).toBeNull()
    expect(draftFieldState(draft, 'monthlyGrossConversion')).toBe('entered')
  })

  it('falls back to evidenceMap when inputStatus is absent', () => {
    const instance = bavInstance({ evidenceMap: { currentValueEUR: 'statement' } })
    const draft = draftFromInstance('bav', instance)
    expect(draftFieldState(draft, 'currentValueEUR')).toBe('document')
  })
})

// ---------------------------------------------------------------------------
// New drafts and validation
// ---------------------------------------------------------------------------

describe('newDraft', () => {
  it('leaves the name field empty rather than prefilling the generated "#1" label', () => {
    const draft = newDraft('etf', { currentYear: 2026 })
    expect(draft.fields.label.value).toBe('')
  })

  it('leaves the two core fields unanswered and everything else assumed', () => {
    const draft = newDraft('etf', { currentYear: 2026 })
    expect(draftFieldState(draft, 'currentValueEUR')).toBe('empty')
    expect(draftFieldState(draft, 'monthlyContribution')).toBe('empty')
    expect(draftFieldValue(draft, 'currentValueEUR')).toBeNull()
    expect(draftFieldState(draft, 'annualAssetFee')).toBe('assumed')
  })

  it('rejects an unanswered core field, and accepts it once answered', () => {
    const draft = newDraft('etf', { currentYear: 2026 })
    const errors = validateDraft(draft)
    expect(isDraftValid(errors)).toBe(false)
    expect(errors.currentValueEUR).toBeDefined()

    const answered = patchDraftField(
      patchDraftField(draft, 'currentValueEUR', 0),
      'monthlyContribution',
      200,
    )
    expect(isDraftValid(validateDraft(answered))).toBe(true)
  })

  it('accepts an explicit unknown in place of a typed core value', () => {
    const draft = setDraftFieldUnknown(
      patchDraftField(newDraft('etf', { currentYear: 2026 }), 'monthlyContribution', 200),
      'currentValueEUR',
    )
    expect(isDraftValid(validateDraft(draft))).toBe(true)
    expect(draftFieldState(draft, 'currentValueEUR')).toBe('unknown')
  })

  it('rejects an out-of-range value instead of clipping it', () => {
    const draft = patchDraftField(newDraft('etf', { currentYear: 2026 }), 'annualAssetFee', 0.9)
    const errors = validateDraft(draft)
    expect(errors['annualAssetFee']).toBeDefined()
    // The value is preserved so the user can see and correct what they typed.
    expect(draftFieldValue(draft, 'annualAssetFee')).toBe(0.9)
  })

  it('seeds the saver age into the AVD eligibility block', () => {
    const draft = newDraft('altersvorsorgedepot', { currentYear: 2026, age: 41 })
    expect(draftFieldValue(draft, 'eligibility.ageAtContractStart')).toBe(41)
  })
})

// ---------------------------------------------------------------------------
// Unknown ≠ 0 (the binding rule)
// ---------------------------------------------------------------------------

describe('unknown is not zero', () => {
  it('leaves the engine value untouched and records unknown', () => {
    const instance = bavInstance({ currentValueEUR: 4200, monthlyGrossConversion: 250 })
    const draft = setDraftFieldUnknown(draftFromInstance('bav', instance), 'currentValueEUR')
    const { patch, inputStatus, evidenceMap } = draftToInstancePatch(draft)

    expect(patch.currentValueEUR).toBeUndefined()
    expect(inputStatus.currentValueEUR).toBe('unknown')
    expect(evidenceMap.currentValueEUR).toBeUndefined()
    // The instance keeps its old number; nothing was zeroed.
    expect({ ...instance, ...patch }.currentValueEUR).toBe(4200)
  })

  it('deletes a stale evidence entry when the user declines', () => {
    const instance = bavInstance({
      currentValueEUR: 4200,
      evidenceMap: { currentValueEUR: 'user_confirmed' },
    })
    const draft = setDraftFieldUnknown(draftFromInstance('bav', instance), 'currentValueEUR')
    expect(draftToInstancePatch(draft).evidenceMap.currentValueEUR).toBeUndefined()
  })

  it('a typed 0 clears the unknown and writes a real 0', () => {
    const instance = bavInstance({ contractualFixedMonthly: 50 })
    const declined = setDraftFieldUnknown(
      draftFromInstance('bav', instance),
      'contractualFixedMonthly',
    )
    const typed = patchDraftField(declined, 'contractualFixedMonthly', 0)

    const { patch, inputStatus } = draftToInstancePatch(typed)
    expect(patch.contractualFixedMonthly).toBe(0)
    expect(inputStatus.contractualFixedMonthly).toBe('entered')
  })

  it('declining one field does not disturb its neighbours', () => {
    const instance = bavInstance({ currentValueEUR: 4200, monthlyGrossConversion: 250 })
    const draft = patchDraftField(
      draftFromInstance('bav', instance),
      'monthlyGrossConversion',
      300,
    )
    const declined = setDraftFieldUnknown(draft, 'currentValueEUR')

    const { patch, inputStatus } = draftToInstancePatch(declined)
    expect(patch.monthlyGrossConversion).toBe(300)
    expect(inputStatus.monthlyGrossConversion).toBe('entered')
    expect(inputStatus.currentValueEUR).toBe('unknown')
  })

  it('the bAV Durchführungsweg stores the model default as assumed instead', () => {
    const draft = setDraftFieldUnknown(
      draftFromInstance('bav', bavInstance()),
      'durchfuehrungsweg',
    )
    expect(draftFieldState(draft, 'durchfuehrungsweg')).toBe('assumed')

    const { patch, inputStatus } = draftToInstancePatch(draft)
    expect(patch.durchfuehrungsweg).toBe('direktversicherung_3_63')
    expect(inputStatus.durchfuehrungsweg).toBe('assumed')
  })
})

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

describe('draftToInstancePatch', () => {
  it('writes complete nested objects so siblings cannot be dropped', () => {
    const instance = bavInstance()
    const draft = patchDraftField(
      draftFromInstance('bav', instance),
      'fees.wrapperAssetFee',
      0.011,
    )
    const { patch } = draftToInstancePatch(draft)
    const fees = patch.fees as Record<string, number>

    expect(fees.wrapperAssetFee).toBe(0.011)
    expect(fees.acquisitionCostSpreadYears).toBe(
      instance.fees.acquisitionCostSpreadYears,
    )
  })

  it('stamps the derived fee readiness key once a fee input is entered', () => {
    const untouched = draftToInstancePatch(draftFromInstance('bav', bavInstance()))
    expect(untouched.inputStatus['effektivkostenPct']).toBeUndefined()

    const edited = draftToInstancePatch(
      patchDraftField(draftFromInstance('bav', bavInstance()), 'fees.fundAssetFee', 0.002),
    )
    expect(edited.inputStatus['effektivkostenPct']).toBe('entered')
  })

  it('mirrors the Riester balance onto existingCapital', () => {
    const base = INVENTORY_PRODUCT_REGISTRY.riester.createDefault(2026, 1, () => 'riester-x')
    const draft = patchDraftField(
      draftFromInstance('riester', base as RiesterInstance),
      'currentValueEUR',
      7500,
    )
    const { patch } = draftToInstancePatch(draft)
    expect(patch.currentValueEUR).toBe(7500)
    expect(patch.existingCapital).toBe(7500)
  })

  it('carries status keys it does not own through untouched', () => {
    const instance = etfInstance({ inputStatus: { somethingElse: 'document' } })
    const { inputStatus } = draftToInstancePatch(draftFromInstance('etf', instance))
    expect(inputStatus['somethingElse']).toBe('document')
  })
})

describe('draftToNewInstance', () => {
  it('produces a complete instance, named after the product (never "#1")', () => {
    const draft = patchDraftField(
      patchDraftField(newDraft('etf', { currentYear: 2026 }), 'currentValueEUR', 1000),
      'monthlyContribution',
      250,
    )
    const instance = draftToNewInstance(draft, () => 'etf-abc12345') as unknown as EtfInstance

    expect(instance.instanceId).toBe('etf-abc12345')
    expect(instance.label).toBe('ETF-Depot')
    expect(instance.monthlyContribution).toBe(250)
    expect(instance.currentValueEUR).toBe(1000)
    // Fields the editor never exposes still arrive populated from the registry.
    expect(instance.equityPartialExemption).toBeGreaterThan(0)
  })

  it('prefers the user-supplied name over the fallback', () => {
    const draft = patchDraftField(
      patchDraftField(
        patchDraftField(newDraft('etf', { currentYear: 2026 }), 'currentValueEUR', 0),
        'monthlyContribution',
        100,
      ),
      'label',
      'Weltdepot',
    )
    const instance = draftToNewInstance(draft, () => 'etf-abc12345') as { label: string }
    expect(instance.label).toBe('Weltdepot')
  })

  it('prefers the Anbieter over the plain product name', () => {
    const draft = patchDraftField(
      patchDraftField(
        patchDraftField(newDraft('etf', { currentYear: 2026 }), 'currentValueEUR', 0),
        'monthlyContribution',
        100,
      ),
      'anbieter',
      'Trade Republic',
    )
    const instance = draftToNewInstance(draft, () => 'etf-abc12345') as { label: string }
    expect(instance.label).toBe('ETF – Trade Republic')
  })
})

describe('contractDraftDirty', () => {
  it('is false for an untouched draft and true after any edit', () => {
    const initial = draftFromInstance('bav', bavInstance())
    expect(contractDraftDirty(initial, initial)).toBe(false)
    expect(contractDraftDirty(patchDraftField(initial, 'rentenfaktor', 31), initial)).toBe(true)
  })

  it('counts a switch to unknown as an edit even though the value is unchanged', () => {
    const initial = draftFromInstance('bav', bavInstance())
    const declined = setDraftFieldUnknown(initial, 'currentValueEUR')
    expect(contractDraftDirty(declined, initial)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Compare-mode singleton path (paired assertion, CLAUDE.md cron guardrail)
// ---------------------------------------------------------------------------

describe('compare-mode singleton path is untouched', () => {
  it('editing a combine instance never reaches compare-mode scenario assumptions', () => {
    const ws = addInstanceToWorkspace(defaultWorkspace, 'etf')
    const instance = ws.baseline.assumptions.etf[0]
    const draft = patchDraftField(
      draftFromInstance('etf', instance),
      'monthlyContribution',
      777,
    )
    const { patch } = draftToInstancePatch(draft)

    // The patch addresses instance fields only — no scenario-level key such as
    // `equalInputAmountEUR` or `visibleProducts` appears anywhere in it.
    expect(Object.keys(patch)).not.toContain('equalInputAmountEUR')
    expect(Object.keys(patch)).not.toContain('visibleProducts')
    expect(defaultWorkspace.baseline.assumptions.etf).toHaveLength(0)
  })
})


describe('offered bAV contribution provenance (issue 349)', () => {
  it('draft creation discards document provenance for the zeroed €200 conversion', () => {
    let draft = patchDraftField(newDraft('bav'), 'status', 'offered')
    draft = patchDraftField(draft, 'monthlyGrossConversion', 200, 'document')
    draft = patchDraftField(draft, 'currentValueEUR', 4200, 'document')

    const { patch, inputStatus, evidenceMap } = draftToInstancePatch(draft)
    expect(patch.monthlyGrossConversion).toBe(0)
    expect(inputStatus).not.toHaveProperty('monthlyGrossConversion')
    expect(evidenceMap).not.toHaveProperty('monthlyGrossConversion')
    const instance = draftToNewInstance(draft, () => 'bav-offer001')
    expect(instance.monthlyGrossConversion).toBe(0)
    expect(instance.inputStatus).not.toHaveProperty('monthlyGrossConversion')
    expect(instance.evidenceMap).not.toHaveProperty('monthlyGrossConversion')
    expect(instance.inputStatus).toHaveProperty('currentValueEUR', 'document')
    expect(instance.evidenceMap).toHaveProperty('currentValueEUR', 'statement')
    expect(draft.fields.monthlyGrossConversion).toMatchObject({ value: 200, status: 'document' })
  })
})
