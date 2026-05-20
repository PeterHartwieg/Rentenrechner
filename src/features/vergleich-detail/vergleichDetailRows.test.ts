import { describe, expect, it } from 'vitest'
import type { ProductResult, ScenarioAssumptions } from '../../domain'
import { buildVergleichDetailCardData } from './vergleichDetailRows'

// ---------------------------------------------------------------------------
// vergleichDetailRows — per-product row composition.
//
// These tests pin the Steuer-line label routing (the data-flow decision the
// handoff calls out as the key per-product behaviour):
//   - bAV: "+ Arbeitgeber" + "+ Steuer- & SV-Vorteil"
//   - ETF / pAV: no Steuer line
//   - Basisrente / AVD / Riester: "+ Steuerrückerstattung"
// and the dynamic-retirement-age section heading, plus the income-tax
// derivation (gross − net − kvPv).
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<ProductResult> & { productId: ProductResult['productId'] }): ProductResult {
  const base = {
    label: 'Test',
    scenarioId: 'basis' as const,
    scenarioLabel: 'Basis',
    annualReturn: 0.05,
    monthlyUserCost: 200,
    monthlyProductContribution: 200,
    monthlyEmployerContribution: 0,
    totalUserCost: 60000,
    totalProductContributions: 60000,
    totalContributionsBeforeFees: 60000,
    totalEmployerContributions: 0,
    totalFees: 5000,
    capitalAtRetirement: 120000,
    realCapitalAtRetirement: 90000,
    afterTaxLumpSum: 100000,
    grossMonthlyPayout: 500,
    netMonthlyPayout: 400,
    kvPvMonthly: 60,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: 1.5,
    capitalMultipleAnnualized: 0.04,
    accumulationRiy: 0.012,
    rows: [],
  }
  return { ...base, ...overrides } as ProductResult
}

const ASSUMPTIONS = { retirementEndAge: 87 } as unknown as ScenarioAssumptions

describe('buildVergleichDetailCardData', () => {
  it('returns three sections in canonical order', () => {
    const result = makeResult({ productId: 'etf' })
    const data = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    expect(data).not.toBeNull()
    expect(data!.sections).toHaveLength(3)
    expect(data!.sections[0].heading).toBe('Ansparphase, pro Monat')
    expect(data!.sections[1].heading).toBe('Mit 67, einmalig')
    expect(data!.sections[2].heading).toBe('Im Alter, pro Monat')
  })

  it('uses the dynamic retirementAge in the § 2 heading (never hardcoded 67)', () => {
    const result = makeResult({ productId: 'etf' })
    const d63 = buildVergleichDetailCardData({ result, retirementAge: 63, assumptions: ASSUMPTIONS })
    const d70 = buildVergleichDetailCardData({ result, retirementAge: 70, assumptions: ASSUMPTIONS })
    expect(d63!.sections[1].heading).toBe('Mit 63, einmalig')
    expect(d70!.sections[1].heading).toBe('Mit 70, einmalig')
  })

  it('ETF: no Steuer line in Ansparphase — Du selbst + effektiv investiert only', () => {
    const result = makeResult({ productId: 'etf', taxAndSvSavings: 0 })
    const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    const labels = d!.sections[0].rows.map((r) => r.label)
    expect(labels).toEqual(['Du selbst', '= effektiv investiert'])
  })

  it('pAV: no Steuer line in Ansparphase even when taxAndSvSavings > 0', () => {
    // Defensive: even if upstream code populates taxAndSvSavings for pAV, the
    // row builder must not render it — pAV has no Sonderausgaben deduction
    // mechanism in compare-mode.
    const result = makeResult({ productId: 'versicherung', taxAndSvSavings: 600 })
    const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    const labels = d!.sections[0].rows.map((r) => r.label)
    expect(labels).toEqual(['Du selbst', '= effektiv investiert'])
  })

  it('bAV: surfaces "+ Arbeitgeber" + "+ Steuer- & SV-Vorteil"', () => {
    const result = makeResult({
      productId: 'bav',
      monthlyEmployerContribution: 30,
      taxAndSvSavings: 1200, // EUR/year — section divides by 12 for monthly display
    })
    const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    const labels = d!.sections[0].rows.map((r) => r.label)
    expect(labels).toEqual(['Du selbst', '+ Arbeitgeber', '+ Steuer- & SV-Vorteil', '= effektiv investiert'])
    const taxRow = d!.sections[0].rows.find((r) => r.label === '+ Steuer- & SV-Vorteil')!
    expect(taxRow.value).toBe(100) // 1200 / 12
  })

  it('bAV: omits "+ Arbeitgeber" when the employer contribution is zero', () => {
    const result = makeResult({
      productId: 'bav',
      monthlyEmployerContribution: 0,
      taxAndSvSavings: 600,
    })
    const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    const labels = d!.sections[0].rows.map((r) => r.label)
    expect(labels).toEqual(['Du selbst', '+ Steuer- & SV-Vorteil', '= effektiv investiert'])
  })

  it.each(['basisrente', 'altersvorsorgedepot', 'riester'] as const)(
    '%s: surfaces "+ Steuerrückerstattung" (not "Steuer- & SV-Vorteil")',
    (productId) => {
      const result = makeResult({ productId, taxAndSvSavings: 240 })
      const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
      const labels = d!.sections[0].rows.map((r) => r.label)
      expect(labels).toEqual(['Du selbst', '+ Steuerrückerstattung', '= effektiv investiert'])
      const taxRow = d!.sections[0].rows.find((r) => r.label === '+ Steuerrückerstattung')!
      expect(taxRow.value).toBe(20) // 240 / 12
    },
  )

  it('§ Ansparphase total equals the sum of contributing rows', () => {
    const result = makeResult({
      productId: 'bav',
      monthlyUserCost: 200,
      monthlyEmployerContribution: 30,
      taxAndSvSavings: 1200, // 100 EUR/month
    })
    const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    const total = d!.sections[0].rows.find((r) => r.kind === 'total')!
    expect(total.value).toBe(330)
  })

  it('§ Mit X surfaces Kapital brutto + Kosten gesamt + Effektivkosten p. a. info', () => {
    const result = makeResult({
      productId: 'etf',
      capitalAtRetirement: 250_000,
      totalFees: 8_500,
      accumulationRiy: 0.0085,
    })
    const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    const rows = d!.sections[1].rows
    expect(rows[0]).toMatchObject({ label: 'Kapital brutto', value: 250_000, kind: 'add' })
    expect(rows[1]).toMatchObject({ label: '− Kosten gesamt', value: 8_500, kind: 'sub' })
    expect(rows[2]).toMatchObject({ label: 'Effektivkosten p. a.', value: 0.0085, kind: 'info' })
  })

  it('§ Im Alter derives income tax as gross − net − kvPv', () => {
    const result = makeResult({
      productId: 'bav',
      grossMonthlyPayout: 800,
      netMonthlyPayout: 600,
      kvPvMonthly: 120,
    })
    const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    const rows = d!.sections[2].rows
    expect(rows[0]).toMatchObject({ label: 'Brutto-Rente', value: 800 })
    // 800 − 600 − 120 = 80
    expect(rows[1]).toMatchObject({ label: '− Einkommensteuer', value: 80, kind: 'sub' })
    expect(rows[2]).toMatchObject({ label: '− KV / PV', value: 120, kind: 'sub' })
    expect(rows[3]).toMatchObject({ label: '= Netto-Rente', value: 600, kind: 'total', accent: true })
  })

  it('§ Im Alter treats missing kvPvMonthly as 0 (legacy paths)', () => {
    const result = makeResult({
      productId: 'etf',
      grossMonthlyPayout: 500,
      netMonthlyPayout: 480,
      kvPvMonthly: undefined,
    })
    const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    const rows = d!.sections[2].rows
    const kvPv = rows.find((r) => r.label === '− KV / PV')!
    expect(kvPv.value).toBe(0)
    // Income tax = 500 − 480 − 0 = 20
    const tax = rows.find((r) => r.label === '− Einkommensteuer')!
    expect(tax.value).toBe(20)
  })

  it('clamps a negative income-tax derivation to 0 (defensive against rounding drift)', () => {
    // If the cascade leaves `gross − net − kvPv` slightly negative due to
    // accumulated float error, surfacing a "− -2 EUR" cell is confusing.
    // Clamp at 0 in the row builder.
    const result = makeResult({
      productId: 'etf',
      grossMonthlyPayout: 100,
      netMonthlyPayout: 110, // intentionally inconsistent
      kvPvMonthly: 0,
    })
    const d = buildVergleichDetailCardData({ result, retirementAge: 67, assumptions: ASSUMPTIONS })
    const tax = d!.sections[2].rows.find((r) => r.label === '− Einkommensteuer')!
    expect(tax.value).toBe(0)
  })

  it('returns null when the registry has no metadata for the product id', () => {
    const bogus = makeResult({ productId: 'etf' })
    // Force an unknown id via double cast — the registry's null-guard branch
    // can only fire on out-of-band ids that bypass the type system at runtime
    // (e.g. forward-compat scenarios where a saved scenario references a
    // product newer than the registry). Use a `as unknown as ProductResult`
    // hop to evade the discriminated-union exactness check.
    const fake = { ...bogus, productId: 'unknown' } as unknown as ProductResult
    const d = buildVergleichDetailCardData({ result: fake, retirementAge: 67, assumptions: ASSUMPTIONS })
    expect(d).toBeNull()
  })
})
