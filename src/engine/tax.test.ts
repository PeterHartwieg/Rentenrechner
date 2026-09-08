import { afterEach, describe, expect, it } from 'vitest'
import type { GermanRules } from '../domain'
import { de2026Rules } from '../rules/de2026'
import { legalConstants } from '../rules/legalConstants'
import {
  bmfEinkommensteuerRechner2026GoldenCases,
  incomeTax2026GoldenCases,
} from '../test/externalGoldenFixtures'
import { calculateIncomeTax2026, calculateSolidarityTax } from './tax'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withIncomeTax(overrides: Partial<GermanRules['incomeTax']>): GermanRules {
  return { ...de2026Rules, incomeTax: { ...de2026Rules.incomeTax, ...overrides } }
}

function withTariff(
  overrides: Partial<GermanRules['incomeTax']['tariff']>,
): GermanRules {
  return withIncomeTax({ tariff: { ...de2026Rules.incomeTax.tariff, ...overrides } })
}

const goldenIncomeTaxCases = [...incomeTax2026GoldenCases, ...bmfEinkommensteuerRechner2026GoldenCases]

/** True when at least one official BMF capture no longer matches under `rules`. */
function deviatesFromOfficialGoldens(rules: GermanRules): boolean {
  return goldenIncomeTaxCases.some(
    (fixture) => calculateIncomeTax2026(fixture.taxableIncome, rules) !== fixture.expectedIncomeTax,
  )
}

// ---------------------------------------------------------------------------
// Official goldens — the default rule set must reproduce them exactly
// ---------------------------------------------------------------------------

describe('calculateIncomeTax2026 — official BMF 2026 tariff goldens via the active rules', () => {
  it.each(incomeTax2026GoldenCases)('$id', (fixture) => {
    expect(calculateIncomeTax2026(fixture.taxableIncome, de2026Rules)).toBe(
      fixture.expectedIncomeTax,
    )
  })

  it.each(bmfEinkommensteuerRechner2026GoldenCases)('$id', (fixture) => {
    const incomeTax = calculateIncomeTax2026(fixture.taxableIncome, de2026Rules)
    // Compare against the fixture's own EUR tolerance (BMF shows 2-decimal
    // soli; captures carry up to 0.01 EUR rounding).
    expect(Math.abs(incomeTax - fixture.expectedIncomeTax)).toBeLessThanOrEqual(
      fixture.toleranceEUR,
    )
    const soli = calculateSolidarityTax(incomeTax, de2026Rules)
    expect(Math.abs(soli - fixture.expectedSolidarityTax)).toBeLessThanOrEqual(
      fixture.toleranceEUR,
    )
  })
})

// ---------------------------------------------------------------------------
// Statutory pins — changing these literals requires a law-amendment citation
// ---------------------------------------------------------------------------

describe('statutory pins for the centralized tariff + soli constants (#376)', () => {
  it('2026 tariff coefficients live in the year file, byte-identical to §32a Abs. 1 Satz 2', () => {
    expect(de2026Rules.incomeTax.tariff).toEqual({
      zoneBQuadratic: 914.51,
      zoneBLinear: 1_400,
      zoneCQuadratic: 173.1,
      zoneCLinear: 2_397,
      zoneCConstant: 1_034.87,
      proportionalRate: 0.42,
      proportionalDeduction: 11_135.63,
      topRate: 0.45,
      topRateDeduction: 19_470.38,
      progressionDenominator: 10_000,
    })
  })

  it('soli rate is 5.5 % — §4 SolzG 1995', () => {
    expect(legalConstants.soli.rate).toBe(0.055)
  })

  it('Milderungszone slope is 11.9 % — §4 SolzG 1995', () => {
    expect(legalConstants.soli.milderungszoneRate).toBe(0.119)
  })

  it('capital-gains soli rate is the same cross-year constant, not a second 5.5 % literal', () => {
    expect(de2026Rules.capitalGains.solidarityRate).toBe(legalConstants.soli.rate)
  })
})

// ---------------------------------------------------------------------------
// Injection — every tariff input is rules-driven
// ---------------------------------------------------------------------------

describe('injected tariff parameters steer the output (#376)', () => {
  it('zone b follows the injected coefficients (longhand expectation)', () => {
    const x = 15_000
    const modified = withTariff({ zoneBQuadratic: 950, zoneBLinear: 1_500 })
    const y = (x - de2026Rules.incomeTax.basicAllowance) / 10_000
    expect(calculateIncomeTax2026(x, modified)).toBe(Math.floor((950 * y + 1_500) * y))
    expect(calculateIncomeTax2026(x, modified)).not.toBe(calculateIncomeTax2026(x, de2026Rules))
  })

  it('coefficient names match their role in the expanded polynomial', () => {
    const { tariff } = de2026Rules.incomeTax
    const y = (15_000 - de2026Rules.incomeTax.basicAllowance) / tariff.progressionDenominator
    // Engine evaluates the Horner form; the names must read correctly in the
    // expanded form too — same algebra, different association order.
    const horner = (tariff.zoneBQuadratic * y + tariff.zoneBLinear) * y
    const expanded = tariff.zoneBQuadratic * y * y + tariff.zoneBLinear * y
    expect(horner).toBeCloseTo(expanded, 6)
    const actual = calculateIncomeTax2026(15_000, de2026Rules)
    expect(actual).toBe(Math.floor(horner))
  })

  it('zone c follows the injected coefficients (longhand expectation)', () => {
    const x = 30_000
    const modified = withTariff({ zoneCQuadratic: 200, zoneCLinear: 2_500, zoneCConstant: 1_200 })
    const z = (x - de2026Rules.incomeTax.firstProgressionEnd) / 10_000
    expect(calculateIncomeTax2026(x, modified)).toBe(
      Math.floor((200 * z + 2_500) * z + 1_200),
    )
  })

  it('proportional-zone rate and deduction are both honored', () => {
    const x = 75_000
    // Deduction delta passes straight through: 0.42·x stays fixed, so the
    // floored result shifts by exactly the injected −1 000 EUR.
    const deductionShifted = withTariff({ proportionalDeduction: 10_135.63 })
    expect(calculateIncomeTax2026(x, deductionShifted)).toBe(
      calculateIncomeTax2026(x, de2026Rules) + 1_000,
    )
    const rateShifted = withTariff({ proportionalRate: 0.44 })
    expect(calculateIncomeTax2026(x, rateShifted)).toBe(Math.floor(0.44 * x - 11_135.63))
    expect(calculateIncomeTax2026(x, rateShifted)).not.toBe(calculateIncomeTax2026(x, de2026Rules))
  })

  it('top zone honors the injected rate and deduction without touching the 42 % zone', () => {
    const x = 300_000
    const modified = withTariff({ topRate: 0.48, topRateDeduction: 21_470.38 })
    expect(calculateIncomeTax2026(x, modified)).toBe(Math.floor(0.48 * x - 21_470.38))
    // The proportional zone is unaffected by top-zone coefficients.
    expect(calculateIncomeTax2026(75_000, modified)).toBe(
      calculateIncomeTax2026(75_000, de2026Rules),
    )
  })

  it('progression denominator rescales the y/z variables', () => {
    const x = 15_000
    const modified = withTariff({ progressionDenominator: 20_000 })
    const y = (x - de2026Rules.incomeTax.basicAllowance) / 20_000
    expect(calculateIncomeTax2026(x, modified)).toBe(
      Math.floor((914.51 * y + 1_400) * y),
    )
    expect(calculateIncomeTax2026(x, modified)).not.toBe(calculateIncomeTax2026(x, de2026Rules))
  })

  it('zone boundaries move with the injected thresholds', () => {
    const raisedAllowance = withIncomeTax({ basicAllowance: 13_000 })
    // 12,700 is taxable today but falls under the injected higher Grundfreibetrag.
    expect(calculateIncomeTax2026(12_700, de2026Rules)).toBeGreaterThan(0)
    expect(calculateIncomeTax2026(12_700, raisedAllowance)).toBe(0)

    const loweredTopStart = withIncomeTax({ topTaxStart: 200_000 })
    // 250,000 stays in the 42 % zone today; under the injected threshold it pays 45 %.
    const inTopZone = calculateIncomeTax2026(250_000, loweredTopStart)
    expect(inTopZone).toBe(Math.floor(0.45 * 250_000 - 19_470.38))
    expect(inTopZone).not.toBe(calculateIncomeTax2026(250_000, de2026Rules))
  })

  it('a fully synthetic rule set replaces the whole tariff — no hidden literals', () => {
    const flatTaxRules: GermanRules = withIncomeTax({
      basicAllowance: 0,
      firstProgressionEnd: 0,
      secondProgressionEnd: 0,
      topTaxStart: 1,
      tariff: { ...de2026Rules.incomeTax.tariff, topRate: 0.25, topRateDeduction: 0 },
    })
    expect(calculateIncomeTax2026(40_000, flatTaxRules)).toBe(10_000)
    expect(calculateIncomeTax2026(0, flatTaxRules)).toBe(0)
  })

  it('each injected coefficient change breaks at least one official BMF capture', () => {
    const perturbations: Array<[string, GermanRules]> = [
      ['zoneBQuadratic +40', withTariff({ zoneBQuadratic: 914.51 + 40 })],
      ['zoneBLinear +200', withTariff({ zoneBLinear: 1_600 })],
      ['zoneCQuadratic +20', withTariff({ zoneCQuadratic: 193.1 })],
      ['zoneCLinear +500', withTariff({ zoneCLinear: 2_897 })],
      ['zoneCConstant +500', withTariff({ zoneCConstant: 1_534.87 })],
      ['proportionalRate +2 pp', withTariff({ proportionalRate: 0.44 })],
      ['proportionalDeduction +1 000', withTariff({ proportionalDeduction: 12_135.63 })],
      ['topRate +3 pp', withTariff({ topRate: 0.48 })],
      ['topRateDeduction +2 000', withTariff({ topRateDeduction: 21_470.38 })],
      ['progressionDenominator ×2', withTariff({ progressionDenominator: 20_000 })],
      ['basicAllowance → 13 000', withIncomeTax({ basicAllowance: 13_000 })],
      ['firstProgressionEnd → 17 700', withIncomeTax({ firstProgressionEnd: 17_700 })],
      ['secondProgressionEnd → 55 000', withIncomeTax({ secondProgressionEnd: 55_000 })],
      ['topTaxStart +1 000 000', withIncomeTax({ topTaxStart: 1_277_826 })],
    ]

    for (const [name, rules] of perturbations) {
      expect(deviatesFromOfficialGoldens(rules), name).toBe(true)
    }
  })

  it('the active rule set does NOT deviate from the official captures (control)', () => {
    expect(deviatesFromOfficialGoldens(de2026Rules)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Soli injection
// ---------------------------------------------------------------------------

describe('injected soli parameters steer the output (#376)', () => {
  // `legalConstants.soli` is typed readonly but is a plain object at runtime;
  // the engine consumes it directly, so mutating it is the end-to-end proof
  // that no soli literal is baked into the engine. Restored in afterEach.
  type MutableSoli = { rate: number; milderungszoneRate: number }
  const soliRef = legalConstants.soli as MutableSoli
  const originalSoli: MutableSoli = { ...soliRef }

  function setSoli(rate: number, milderungszoneRate: number): void {
    soliRef.rate = rate
    soliRef.milderungszoneRate = milderungszoneRate
  }

  afterEach(() => {
    setSoli(originalSoli.rate, originalSoli.milderungszoneRate)
  })

  it('an injected soli rate scales the regular branch (while the Milderungszone still caps it)', () => {
    const incomeTax = 60_000 // regular branch binds at the statutory 5.5 %
    const freeTax = de2026Rules.incomeTax.solidarityFreeTax

    expect(calculateSolidarityTax(incomeTax, de2026Rules)).toBeCloseTo(60_000 * 0.055, 9)

    // Raise the rate with the statutory 11.9 % slope kept: the transition cap
    // now binds instead — exactly the statutory min() shape.
    setSoli(0.08, 0.119)
    expect(calculateSolidarityTax(incomeTax, de2026Rules)).toBeCloseTo(
      (incomeTax - freeTax) * 0.119,
      9,
    )

    // Raise the slope too: the injected rate passes through un-capped.
    setSoli(0.08, 0.5)
    expect(calculateSolidarityTax(incomeTax, de2026Rules)).toBeCloseTo(60_000 * 0.08, 9)
  })

  it('an injected Milderungszone slope changes the transition branch and flips the crossover', () => {
    const freeTax = de2026Rules.incomeTax.solidarityFreeTax

    const justAbove = freeTax + 100
    expect(calculateSolidarityTax(justAbove, de2026Rules)).toBeCloseTo(100 * 0.119, 9)
    setSoli(0.055, 0.25)
    expect(calculateSolidarityTax(justAbove, de2026Rules)).toBeCloseTo(100 * 0.25, 9)

    // At 1.5 × Freigrenze the binding branch flips when the slope rises:
    // 20 350 × 1.859 crossover (11.9 %) sits above 1.5 ×, 30 525 × 1.282 (25 %) below.
    const mid = Math.round(freeTax * 1.5)
    setSoli(0.055, 0.119)
    const originalMid = calculateSolidarityTax(mid, de2026Rules)
    expect(originalMid).toBeCloseTo((mid - freeTax) * 0.119, 6)
    setSoli(0.055, 0.25)
    const mutatedMid = calculateSolidarityTax(mid, de2026Rules)
    expect(mutatedMid).toBeCloseTo(mid * 0.055, 6)
    expect(mutatedMid).not.toBeCloseTo(originalMid, 3)
  })

  it('the married Freigrenze comes from the rules, not a hardcoded constant', () => {
    const incomeTax = 45_000
    expect(calculateSolidarityTax(incomeTax, de2026Rules, 'married')).toBeGreaterThan(0)
    const raisedMarriedFreeTax = withIncomeTax({ solidarityFreeTaxMarried: 50_000 })
    expect(calculateSolidarityTax(incomeTax, raisedMarriedFreeTax, 'married')).toBe(0)
  })

  it('below the injected Freigrenze the soli stays zero', () => {
    const raisedFreeTax = withIncomeTax({ solidarityFreeTax: 60_000 })
    expect(calculateSolidarityTax(45_000, raisedFreeTax)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Statutory floor + zone continuity
// ---------------------------------------------------------------------------

describe('statutory floor and zone continuity are preserved (#376)', () => {
  it('floors taxable income to full euros before applying the tariff', () => {
    expect(calculateIncomeTax2026(75_000.99, de2026Rules)).toBe(
      calculateIncomeTax2026(75_000, de2026Rules),
    )
    expect(calculateIncomeTax2026(15_000.5, de2026Rules)).toBe(
      calculateIncomeTax2026(15_000, de2026Rules),
    )
  })

  it('clamps negative taxable income to zero', () => {
    expect(calculateIncomeTax2026(-5_000, de2026Rules)).toBe(0)
  })

  it('returns whole euros in every zone', () => {
    for (const x of [12_349, 15_000, 17_799, 30_000, 69_879, 150_000, 277_826, 500_000]) {
      expect(Number.isInteger(calculateIncomeTax2026(x, de2026Rules))).toBe(true)
    }
  })

  it('stays continuous at the progression boundaries under the statutory coefficients', () => {
    // Continuity is a property of the statutory 2026 coefficient set (the law
    // constructs the zones to mesh). Arbitrarily injected coefficients need
    // not preserve it — which is exactly why the BMF goldens pin the real set.
    const { firstProgressionEnd, secondProgressionEnd } = de2026Rules.incomeTax
    for (const boundary of [firstProgressionEnd, secondProgressionEnd]) {
      const jump = Math.abs(
        calculateIncomeTax2026(boundary + 1, de2026Rules) -
          calculateIncomeTax2026(boundary, de2026Rules),
      )
      expect(jump, `boundary ${boundary}`).toBeLessThanOrEqual(2)
    }
  })
})
