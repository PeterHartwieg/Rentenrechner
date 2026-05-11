import { describe, expect, it } from 'vitest'
import type { ProductResult } from '../domain'
import type { CombinedResult } from '../engine/portfolioCombine'
import {
  projectCombineInstanceExportRows,
  projectCompareExportRows,
} from './exportProjection'

const BASE_PRODUCT: ProductResult = {
  productId: 'bav',
  label: 'bAV',
  scenarioId: 'basis',
  scenarioLabel: 'Basis',
  monthlyUserCost: 100,
  monthlyProductContribution: 150,
  capitalAtRetirement: 120_000,
  afterTaxLumpSum: 90_000,
  grossMonthlyPayout: 600,
  netMonthlyPayout: 420,
  totalFees: 1_200,
  accumulationRiy: 0.012,
  rows: [],
  inputConfidence: 'user_confirmed',
  valueMultipleOnUserCost: 2.1,
  leibrenteBreakEvenAge: 82,
  lumpSumDeductions: null,
}

const COMBINED: CombinedResult = {
  scenarioId: 'basis',
  scenarioLabel: 'Basis',
  monthlyNetIncome: 1_800,
  statutoryPensionMonthlyNet: 1_200,
  privatePensionMonthlyNet: 600,
  taxMonthly: 200,
  kvPvMonthly: 100,
  byInstance: {
    'bav-1': {
      monthlyGross: 600,
      monthlyNet: 390,
      taxShareAnnual: 1_800,
      kvPvShare: 60,
    },
  },
}

describe('export projection layer', () => {
  it('projects compare-mode rows from ProductResult without recalculating after-tax capital', () => {
    const [row] = projectCompareExportRows([BASE_PRODUCT])

    expect(row).toMatchObject({
      productId: 'bav',
      productLabel: 'bAV',
      scenarioId: 'basis',
      scenarioLabel: 'Basis',
      capitalAtRetirement: 120_000,
      afterTaxLumpSum: 90_000,
      netMonthlyPayout: 420,
      inputConfidence: 'user_confirmed',
    })
  })

  it('projects combine-mode instance rows using aggregate byInstance monthly net', () => {
    const [row] = projectCombineInstanceExportRows({
      perInstance: { 'bav-1': [BASE_PRODUCT] },
      combinedByScenarioId: { basis: COMBINED },
    })

    expect(row).toMatchObject({
      instanceId: 'bav-1',
      productId: 'bav',
      productLabel: 'bAV',
      scenarioId: 'basis',
      scenarioLabel: 'Basis',
      capitalAtRetirement: 120_000,
      afterTaxLumpSum: 90_000,
      netMonthlyPayout: 390,
      inputConfidence: 'user_confirmed',
    })
  })
})
