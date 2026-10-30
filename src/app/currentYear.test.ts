import { afterEach, describe, expect, it, vi } from 'vitest'
import { RULES_YEAR } from '../rules'
import { defaultWorkspace } from '../storage'
import { addInstanceToWorkspace } from './workspaceIdentity'
import { buildWorkspaceFromDraft } from '../features/inventory/inventoryHelpers'
import { INVENTORY_PRODUCT_REGISTRY } from '../features/inventory/inventoryProductRegistry'
import { newDraft } from '../features/inventory/contractDraft'

describe('calendar rollover with the existing rules baseline', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps new contract calculation inputs on the rules year in January 2027', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-02'))
    for (const entry of Object.values(INVENTORY_PRODUCT_REGISTRY)) {
      const workspace = addInstanceToWorkspace(defaultWorkspace, entry.id)
      const instances = workspace.baseline.assumptions[entry.wsKey] as { contractStartYear: number }[]
      expect(instances.at(-1)?.contractStartYear, entry.id).toBe(RULES_YEAR)
      expect(newDraft(entry.id).fields.contractStartYear.value, entry.id).toBe(RULES_YEAR)
    }
  })

  it('uses calendar age and historical contract age, but rules year for bonus usage', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-02'))
    const workspace = buildWorkspaceFromDraft({
      grvDraft: { productId: 'grv', yearsWorked: 0, currentEntgeltpunkte: 0, useYearsEstimate: false },
      bavDraft: null,
      pavDraft: null,
      riesterDraft: {
        productId: 'riester', status: 'active', contractStartYear: RULES_YEAR,
        monthlyContribution: 100, payoutMode: 'leibrente', zulageStatus: '',
      },
      basisrenteDraft: null,
      avdDraft: {
        productId: 'altersvorsorgedepot', status: 'active', contractStartYear: RULES_YEAR,
        monthlyContribution: 100, subtype: 'standarddepot', useGlidepath: true,
      },
      etfDraft: null,
      grossSalaryYear: 50_000,
      personalDetails: {
        birthYear: 2003,
        grossSalaryYear: 50_000,
        ehegattensplitting: false,
        retirementAge: 67,
        publicHealthInsurance: true,
        childBirthYears: [],
        pensionBaseline: 'grv',
        manualMonthlyGrossPension: 0,
      },
    })
    expect(workspace.baseline.profile.age).toBe(24)
    for (const instance of [
      ...workspace.baseline.assumptions.riester,
      ...workspace.baseline.assumptions.altersvorsorgedepot,
    ]) {
      expect(instance.contractStartYear).toBe(RULES_YEAR)
      expect(instance.eligibility.ageAtContractStart).toBe(RULES_YEAR - 2003)
      expect(instance.eligibility.careerStarterBonusUsed).toBe(false)
    }
  })
})
