// Production-shaped flow test for the Calculator-built combine-export bundle.
//
// Issue #86: combine-mode CSV Section 3 left "Kapital n. St." blank for
// `altersvorsorgedepot` and `riester` instances. The csvExport.ts side was
// fixed by adding new branches; the gap that PR #193 round 1 missed was that
// the bundle wiring in Calculator.tsx never populated `perInstanceTaxModes`
// for AVD/Riester, so the outer guard (`if (rules && taxModes)`) skipped the
// new branches in production.
//
// This file pins the wiring contract: every product-instance array on the
// workspace assumptions must contribute a `perInstanceTaxModes` entry, so the
// Section 3 after-tax derivation cannot reopen.

import { describe, it, expect } from 'vitest'
import type {
  AltersvorsorgedepotInstance,
  BasisrenteInstance,
  BavInstance,
  EtfInstance,
  InsuranceInstance,
  RiesterInstance,
} from '../domain/instances'
import type { WorkspaceAssumptionsV2 } from '../domain/workspace'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import { defaultWorkspace } from '../storage'
import { buildCombinePortfolioCsv } from '../utils/csvExport'
import type { ProductResult, YearlyProjection } from '../domain'
import type { CombinedResult } from '../engine/portfolioCombine'
import { de2026Rules } from '../rules/de2026'
import { deriveCombinePerInstanceTaxModes } from './combineCsvWiring'

const FIXTURE_YEAR = de2026Rules.year

function makeWorkspaceWith(opts: {
  bav?: BavInstance[]
  etf?: EtfInstance[]
  insurance?: InsuranceInstance[]
  basisrente?: BasisrenteInstance[]
  altersvorsorgedepot?: AltersvorsorgedepotInstance[]
  riester?: RiesterInstance[]
}): WorkspaceAssumptionsV2 {
  return {
    ...defaultWorkspace.baseline.assumptions,
    bav: opts.bav ?? [],
    etf: opts.etf ?? [],
    insurance: opts.insurance ?? [],
    basisrente: opts.basisrente ?? [],
    altersvorsorgedepot: opts.altersvorsorgedepot ?? [],
    riester: opts.riester ?? [],
  }
}

function makeAvdInstance(id: string, monthlyOtherIncome = 0): AltersvorsorgedepotInstance {
  return {
    instanceId: id,
    label: `AVD ${id}`,
    status: 'active',
    contractStartYear: FIXTURE_YEAR,
    evidenceMap: {},
    ...defaultAssumptions.altersvorsorgedepot,
    monthlyOtherRetirementIncome: monthlyOtherIncome,
  } as AltersvorsorgedepotInstance
}

function makeRiesterInstance(id: string, monthlyOtherIncome = 0): RiesterInstance {
  return {
    instanceId: id,
    label: `Riester ${id}`,
    status: 'active',
    contractStartYear: FIXTURE_YEAR,
    evidenceMap: {},
    ...defaultAssumptions.riester,
    monthlyOtherRetirementIncome: monthlyOtherIncome,
  } as RiesterInstance
}

describe('deriveCombinePerInstanceTaxModes — gh#86 production-flow regression', () => {
  it('emits a perInstanceTaxModes entry for AVD instances (production wiring, not just test harness)', () => {
    const wa = makeWorkspaceWith({
      altersvorsorgedepot: [makeAvdInstance('avd-prod-1')],
    })
    const out = deriveCombinePerInstanceTaxModes(wa, defaultProfile)
    expect(out['avd-prod-1']).toBeDefined()
  })

  it('emits a perInstanceTaxModes entry for Riester instances (production wiring, not just test harness)', () => {
    const wa = makeWorkspaceWith({
      riester: [makeRiesterInstance('riester-prod-1')],
    })
    const out = deriveCombinePerInstanceTaxModes(wa, defaultProfile)
    expect(out['riester-prod-1']).toBeDefined()
  })

  it('forwards monthlyOtherRetirementIncome × 12 into avdOtherAnnualIncome', () => {
    const wa = makeWorkspaceWith({
      altersvorsorgedepot: [makeAvdInstance('avd-other-income', 250)],
    })
    const out = deriveCombinePerInstanceTaxModes(wa, defaultProfile)
    expect(out['avd-other-income']?.avdOtherAnnualIncome).toBe(3000)
  })

  it('forwards monthlyOtherRetirementIncome × 12 into riesterOtherAnnualIncome', () => {
    const wa = makeWorkspaceWith({
      riester: [makeRiesterInstance('riester-other-income', 100)],
    })
    const out = deriveCombinePerInstanceTaxModes(wa, defaultProfile)
    expect(out['riester-other-income']?.riesterOtherAnnualIncome).toBe(1200)
  })

  it('production-shaped flow: Calculator-derived bundle drives Section 3 to non-blank for AVD/Riester', () => {
    // This is the regression test the PR #193 review asked for: build
    // perInstanceTaxModes the way Calculator.tsx does (no test-only forced
    // entries), then push that bundle through buildCombinePortfolioCsv and
    // verify the AVD/Riester Section 3 "Kapital n. St." cell is non-blank.
    const wa = makeWorkspaceWith({
      altersvorsorgedepot: [makeAvdInstance('avd-prod-flow')],
      riester: [makeRiesterInstance('riester-prod-flow')],
    })
    const perInstanceTaxModes = deriveCombinePerInstanceTaxModes(wa, defaultProfile)

    const balance = 50_000
    const realBalance = 40_000
    const fixtureRow: YearlyProjection = {
      year: FIXTURE_YEAR,
      age: 67,
      productId: 'altersvorsorgedepot',
      scenarioId: 'basis',
      balance,
      realBalance,
      yearlyUserCost: 0,
      yearlyProductContribution: 0,
      yearlyEmployerContribution: 0,
      yearlyFees: 0,
      cumulativeFees: 0,
      cumulativeProductContributions: 30_000,
      cumulativeVorabpauschale: 0,
    }

    const makeProductResult = (productId: 'altersvorsorgedepot' | 'riester', instanceId: string): ProductResult =>
      ({
        productId,
        label: `${productId} prod-flow`,
        instanceId,
        scenarioId: 'basis',
        scenarioLabel: 'Basis',
        rows: [{ ...fixtureRow, productId }],
        capitalAtRetirement: balance,
        grossMonthlyPayout: 0,
        netMonthlyPayout: 0,
        totalFees: 0,
        monthlyUserCost: 0,
        monthlyProductContribution: 0,
        inputConfidence: 'estimated',
      }) as unknown as ProductResult

    const fixtureCombined: CombinedResult = {
      monthlyNetIncome: 0,
      statutoryPensionMonthlyNet: 0,
      monthlyGrossPayouts: {
        statutoryPension: 0,
        bav: 0,
        privateInsurance: 0,
        basisrente: 0,
        altersvorsorgedepot: 0,
        riester: 0,
        etf: 0,
      },
      aggregateTax: { totalTaxAnnual: 0 } as unknown as CombinedResult['aggregateTax'],
      aggregateKvPv: {} as unknown as CombinedResult['aggregateKvPv'],
      byInstance: {},
    } as unknown as CombinedResult

    const csv = buildCombinePortfolioCsv({
      perInstance: {
        'avd-prod-flow': [makeProductResult('altersvorsorgedepot', 'avd-prod-flow')],
        'riester-prod-flow': [makeProductResult('riester', 'riester-prod-flow')],
      },
      combinedByScenarioId: { basis: fixtureCombined },
      scenarioLabels: { basis: 'Basis' },
      perInstanceTaxModes,
      rules: de2026Rules,
    })
    const lines = csv.split('\n')
    const sectionIdx = lines.findIndex((l) => l === 'Jahres-Cashflows je Instanz')
    const sectionBlock = lines.slice(sectionIdx + 2)
    const avdRow = sectionBlock.find((l) => l.startsWith('avd-prod-flow,'))
    const riesterRow = sectionBlock.find((l) => l.startsWith('riester-prod-flow,'))
    expect(avdRow).toBeDefined()
    expect(riesterRow).toBeDefined()
    // Column 10 = Kapital n. St. — must be non-blank in production wiring.
    const avdCols = avdRow!.split(',')
    const riesterCols = riesterRow!.split(',')
    expect(avdCols[10]).not.toBe('')
    expect(Number(avdCols[10])).toBeGreaterThan(0)
    expect(Number(avdCols[10])).toBeLessThan(balance)
    expect(riesterCols[10]).not.toBe('')
    expect(Number(riesterCols[10])).toBeGreaterThan(0)
    expect(Number(riesterCols[10])).toBeLessThan(balance)
  })
})
