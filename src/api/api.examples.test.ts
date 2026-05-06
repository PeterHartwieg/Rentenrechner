// @vitest-environment node
/**
 * RentenWiki.de — Pure Front-End API: Executable Examples
 *
 * This file is the source of truth for API usage examples.
 * Every example is an executable test — examples cannot drift silently.
 *
 * This is a pure TypeScript/browser API, not an HTTP API or backend service.
 * No fetch, no localStorage, no cookies, no React dependency.
 * All numeric outputs are exact (no display rounding); callers own formatting.
 *
 * Coverage: manifest, tax primitives, salary/payroll, retirement tax, and
 * comparison simulation (summary path). Detail-level and Monte Carlo examples
 * are covered separately in comparison.test.ts after those slices landed.
 */
import { describe, it, expect } from 'vitest'
import {
  getManifest,
  calculateIncomeTax,
  calculateSolidarity,
  calculateCapitalGains,
  calculateSalary,
  calculateRetirementTaxApi,
  runComparison,
} from './index'

// ---------------------------------------------------------------------------
// 1. Manifest — discover API version, products, defaults, and rule year
// ---------------------------------------------------------------------------

describe('Manifest example', () => {
  it('returns API version, active rule year, supported products, and defaults', () => {
    const result = getManifest()

    // Every response is wrapped in an envelope with `ok`, `meta`, and `data`.
    expect(result.ok).toBe(true)
    expect(result.meta.apiVersion).toBe('v1')
    expect(typeof result.meta.ruleYear).toBe('number')

    const { data } = result

    // Active rule year comes from the rules module, not hardcoded.
    expect(data.activeRuleYear).toBe(result.meta.ruleYear)
    expect(data.supportedRuleYears).toContain(data.activeRuleYear)

    // Product manifest — IDs, labels, order, colors.
    expect(data.products.length).toBeGreaterThan(0)
    expect(data.productIds).toContain('etf')
    expect(data.productIds).toContain('bav')

    // Canonical defaults — callers can seed inputs from these.
    expect(data.defaultProfile['age']).toBeGreaterThan(0)
    expect((data.defaultAssumptions['returnScenarios'] as unknown[]).length).toBeGreaterThan(0)
    expect(data.defaultMonthlyNettoBelastungEur).toBeGreaterThan(0)

    // Comparison capabilities.
    expect(data.comparisonCapabilities.detailLevels).toContain('summary')
    expect(data.comparisonCapabilities.detailLevels).toContain('standard')
    expect(data.comparisonCapabilities.detailLevels).toContain('full')

    // Not-advice disclaimer — must remain visible in downstream exports.
    expect(data.disclaimer.type).toBe('not_advice')
    expect(data.disclaimer.text.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Income tax — statutory 2026 tariff
// ---------------------------------------------------------------------------

describe('Income tax example', () => {
  it('calculates income tax for a given taxable income', () => {
    const result = calculateIncomeTax({ taxableIncome: 50_000 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Envelope metadata echoes the rule year used.
    expect(result.meta.apiVersion).toBe('v1')
    expect(typeof result.meta.ruleYear).toBe('number')

    // Exact numeric output — no display rounding.
    expect(result.data.taxableIncome).toBe(50_000)
    expect(result.data.incomeTax).toBeGreaterThan(0)
  })

  it('returns a structured error for invalid input', () => {
    const result = calculateIncomeTax({ taxableIncome: -1 })

    expect(result.ok).toBe(false)
    if (result.ok) return

    // Machine-readable error code and field path.
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].path).toBe('taxableIncome')
    expect(result.errors[0].severity).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// 3. Solidarity surcharge
// ---------------------------------------------------------------------------

describe('Solidarity surcharge example', () => {
  it('calculates soli from income tax', () => {
    const result = calculateSolidarity({ incomeTax: 12_000 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.solidarityTax).toBeGreaterThanOrEqual(0)
    expect(result.data.filingStatus).toBe('single')
  })
})

// ---------------------------------------------------------------------------
// 4. Capital gains tax — with partial exemption and saver allowance
// ---------------------------------------------------------------------------

describe('Capital gains tax example', () => {
  it('calculates capital gains tax with equity partial exemption', () => {
    const result = calculateCapitalGains({
      gain: 10_000,
      partialExemption: 0.3, // Equity-fund Teilfreistellung
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.capitalGainsTax).toBeGreaterThan(0)
    expect(result.data.partialExemption).toBe(0.3)
    // Saver allowance defaults from rules when omitted.
    expect(result.data.annualAllowance).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 5. Salary / payroll — full breakdown
// ---------------------------------------------------------------------------

describe('Salary example', () => {
  it('calculates annual salary breakdown from a personal profile', () => {
    const result = calculateSalary({
      profile: {
        age: 30,
        retirementAge: 67,
        grossSalaryYear: 60_000,
        taxClass: 1,
        childBirthYears: [],
        churchTax: false,
        publicHealthInsurance: true,
        healthAdditionalContributionPct: 2.9,
        pkvMonthlyPremium: 0,
        pPVMonthlyPremium: 0,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const s = result.data
    expect(s.annualGross).toBe(60_000)
    expect(s.annualNet).toBeGreaterThan(0)
    expect(s.annualNet).toBeLessThan(60_000)
    expect(s.annualIncomeTax).toBeGreaterThan(0)
    expect(typeof s.socialContributions.healthInsurance).toBe('number')
    expect(typeof s.socialContributions.pensionInsurance).toBe('number')
    expect(typeof s.monthlyNet).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// 6. Retirement tax — statutory tax pipeline over income components
// ---------------------------------------------------------------------------

describe('Retirement tax example', () => {
  it('calculates retirement tax from explicit income sources', () => {
    const result = calculateRetirementTaxApi({
      components: {
        retirementYear: 2059,
        statutoryPensionAnnual: 18_000,
        bavPensionAnnual: 6_000,
        bavIsLumpSum: false,
        privateInsuranceTaxableAnnual: 0,
        privateInsuranceTaxMode: 'halbeinkuenfte',
        otherTaxableAnnual: 0,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const d = result.data
    expect(d.zuVersteuerndesEinkommen).toBeGreaterThan(0)
    expect(d.einkommensteuer).toBeGreaterThanOrEqual(0)
    expect(d.totalTaxAnnual).toBeGreaterThanOrEqual(0)
    expect(d.netRetirementIncomeAnnual).toBeGreaterThan(0)
    // Rule-year metadata.
    expect(result.meta.apiVersion).toBe('v1')
  })
})

// ---------------------------------------------------------------------------
// 7. Comparison simulation — summary path (default detail level)
// ---------------------------------------------------------------------------

describe('Comparison example', () => {
  it('runs a full comparison with defaults and returns summary results', () => {
    const result = runComparison({})

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const d = result.data

    // Envelope + detail level.
    expect(result.meta.apiVersion).toBe('v1')
    expect(d.detailLevel).toBe('summary')

    // Effective scenario — falls back to 'basis' when not specified.
    expect(d.effectiveScenarioId).toBe('basis')

    // Statutory pension baseline.
    expect(d.statutoryPension.grossMonthlyPension).toBeGreaterThan(0)

    // Product results — array shape ready for future instanceId discriminator.
    expect(Array.isArray(d.selectedResults)).toBe(true)
    expect(d.selectedResults.length).toBeGreaterThan(0)
    for (const r of d.selectedResults) {
      expect(typeof r.productId).toBe('string')
      expect(r.capitalAtRetirement).toBeGreaterThan(0)
      expect(r.netMonthlyPayout).toBeGreaterThan(0)
    }

    // Funding summaries.
    expect(typeof d.fundingSummaries.bav.monthlyNetCost).toBe('number')

    // Best capital / pension.
    expect(d.bestCapital === null || typeof d.bestCapital.productId === 'string').toBe(true)
    expect(d.bestPension === null || typeof d.bestPension.productId === 'string').toBe(true)

    // Tax diagnostics.
    expect(typeof d.taxDiagnostics.insuranceTaxMode).toBe('string')

    // Summary omits heavy payloads.
    expect(d.allScenarioResults).toBeUndefined()
    expect(d.yearlyRows).toBeUndefined()
    expect(d.monteCarlo).toBeUndefined()
  })

  it('accepts a custom Netto-Belastung anchor and scenario', () => {
    const result = runComparison({
      monthlyNettoBelastungEur: 400,
      selectedScenarioId: 'konservativ',
      assumptions: {
        visibleProducts: ['etf', 'bav', 'basisrente'],
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data.effectiveMonthlyNettoBelastungEur).toBe(400)
    expect(result.data.effectiveScenarioId).toBe('konservativ')
    expect(result.data.selectedResults.length).toBe(3)
  })

  it('returns an error envelope for unsupported rule year', () => {
    const result = runComparison({ ruleYear: 9999 })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_RULE_YEAR')).toBe(true)
  })
})
