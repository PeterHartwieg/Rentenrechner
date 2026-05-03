import { describe, expect, it } from 'vitest'
import { defaultAssumptions, defaultProfile } from '../data/defaultScenario'
import type { ProductId, ProductResult, ScenarioAssumptions } from '../domain'
import { de2026Rules } from '../rules/de2026'
import { simulateRetirementComparison } from './simulate'
import { runMonteCarlo } from './monteCarlo'

function assumptionsForMonteCarlo(
  overrides: Partial<ScenarioAssumptions['monteCarlo']>,
  visibleProducts: ProductId[] = ['etf', 'bav'],
): ScenarioAssumptions {
  return {
    ...defaultAssumptions,
    visibleProducts,
    monteCarlo: {
      ...defaultAssumptions.monteCarlo,
      runs: 301,
      seed: 12345,
      ...overrides,
    },
  }
}

function comparableCapital(product: ProductResult): number {
  return product.afterTaxLumpSum ?? product.capitalAtRetirement
}

describe('runMonteCarlo', () => {
  it('is reproducible for the same seed and assumptions', () => {
    const assumptions = assumptionsForMonteCarlo({ annualVolatility: 0.18 })

    const first = runMonteCarlo({
      profile: defaultProfile,
      assumptions,
      rules: de2026Rules,
      scenarioId: 'basis',
      visibleProducts: assumptions.visibleProducts,
    })
    const second = runMonteCarlo({
      profile: defaultProfile,
      assumptions,
      rules: de2026Rules,
      scenarioId: 'basis',
      visibleProducts: assumptions.visibleProducts,
    })

    expect(first).toEqual(second)
  })

  it('matches deterministic results when volatility is zero', () => {
    const assumptions = assumptionsForMonteCarlo({ annualVolatility: 0, runs: 101 })
    const deterministic = simulateRetirementComparison(defaultProfile, assumptions, de2026Rules)
    const mc = runMonteCarlo({
      profile: defaultProfile,
      assumptions,
      rules: de2026Rules,
      scenarioId: 'basis',
      visibleProducts: assumptions.visibleProducts,
    })

    expect(mc).not.toBeNull()
    for (const summary of mc!.summaries) {
      const expected = deterministic.products.find(
        (product) => product.productId === summary.productId && product.scenarioId === 'basis',
      )
      expect(expected).toBeDefined()
      expect(summary.capital.p50).toBeCloseTo(comparableCapital(expected!), 2)
      expect(summary.netMonthlyPayout.p50).toBeCloseTo(expected!.netMonthlyPayout, 2)
      expect(summary.capital.p10).toBeCloseTo(summary.capital.p90, 8)
    }
  })

  it('produces ordered percentile bands under volatile returns', () => {
    const assumptions = assumptionsForMonteCarlo(
      { annualVolatility: 0.2, runs: 501 },
      ['etf'],
    )
    const mc = runMonteCarlo({
      profile: defaultProfile,
      assumptions,
      rules: de2026Rules,
      scenarioId: 'basis',
      visibleProducts: assumptions.visibleProducts,
    })

    expect(mc).not.toBeNull()
    const etf = mc!.summaries[0]
    expect(etf.productId).toBe('etf')
    expect(etf.capital.p10).toBeLessThan(etf.capital.p50)
    expect(etf.capital.p50).toBeLessThan(etf.capital.p90)
    expect(etf.bestCapitalProbability).toBe(1)
    expect(mc!.marketAnnualReturn.p10).toBeLessThan(mc!.marketAnnualReturn.p90)
    expect(mc!.yearlyBands.length).toBe(defaultProfile.retirementAge - defaultProfile.age)
  })

  it('reports when a product guarantee floors bad market paths', () => {
    const assumptions: ScenarioAssumptions = {
      ...assumptionsForMonteCarlo({ annualVolatility: 0, runs: 101 }, ['versicherung']),
      returnScenarios: defaultAssumptions.returnScenarios.map((scenario) =>
        scenario.id === 'basis'
          ? { ...scenario, annualReturn: -0.05 }
          : scenario,
      ),
      insurance: {
        ...defaultAssumptions.insurance,
        capitalGuarantee: {
          enabled: true,
          floorPctOfContributions: 1,
        },
      },
    }

    const mc = runMonteCarlo({
      profile: defaultProfile,
      assumptions,
      rules: de2026Rules,
      scenarioId: 'basis',
      visibleProducts: assumptions.visibleProducts,
    })

    expect(mc).not.toBeNull()
    expect(mc!.summaries[0].guaranteeFloor).not.toBeNull()
    expect(mc!.summaries[0].guaranteeLabel).toBe('100% Beitragsgarantie')
    expect(mc!.summaries[0].guaranteeAppliedProbability).toBe(1)
  })

  it('returns null when no products are visible', () => {
    const assumptions = assumptionsForMonteCarlo({ annualVolatility: 0.15 }, [])
    expect(
      runMonteCarlo({
        profile: defaultProfile,
        assumptions,
        rules: de2026Rules,
        scenarioId: 'basis',
        visibleProducts: [],
      }),
    ).toBeNull()
  })
})
