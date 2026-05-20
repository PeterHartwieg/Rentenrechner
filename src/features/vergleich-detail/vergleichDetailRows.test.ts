import { describe, expect, it } from 'vitest'
import type {
  BavFundingResult,
  ProductId,
  ProductResult,
  ScenarioAssumptions,
} from '../../domain'
import { PRODUCT_REGISTRY } from '../../engine/productRegistry'
import { buildVergleichDetailCardData } from './vergleichDetailRows'

// ---------------------------------------------------------------------------
// vergleichDetailRows — per-product row composition.
//
// These tests pin:
//   - Steuer-line label routing (the data-flow decision the handoff calls
//     out as the key per-product behaviour):
//       - bAV: "+ Arbeitgeber" + "+ Steuer- & SV-Vorteil"
//       - ETF / pAV: no Steuer line
//       - Basisrente / AVD / Riester: "+ Steuerrückerstattung"
//   - Monthly conversion of the lifetime-accumulated `taxAndSvSavings`
//     (PR 290 Codex P1): `value / (12 * yearsToRetirement)`, not `value / 12`.
//   - bAV income-tax derivation with `includeGrvReduction` (PR 290 Codex P2):
//     the GRV-loss estimate must be added back to net before deriving
//     `gross − net − kvPv`, otherwise it surfaces as "− Einkommensteuer".
//   - Dynamic-retirement-age section heading, plus the income-tax
//     derivation (gross − net − kvPv) for non-bAV products.
// ---------------------------------------------------------------------------

const DEFAULT_YEARS_TO_RETIREMENT = 30

function makeResult(
  overrides: Partial<ProductResult> & { productId: ProductResult['productId'] },
): ProductResult {
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

// Minimal `ScenarioAssumptions` shape with the only fields the row builder
// reads (`bav.includeGrvReduction` for Fix 2). Keep this narrow so the cast
// stays honest — extend when the row builder grows new assumption reads.
const ASSUMPTIONS = {
  retirementEndAge: 87,
  bav: { includeGrvReduction: false },
} as unknown as ScenarioAssumptions

// `BavFundingResult` stub for Fix 2 tests. Only `estimatedMonthlyGrvReduction`
// is consumed by the row builder; other fields are present for shape
// completeness (cast guards against accidental over-reads).
function makeBavFunding(estimatedMonthlyGrvReduction: number): BavFundingResult {
  return { estimatedMonthlyGrvReduction } as BavFundingResult
}

describe('buildVergleichDetailCardData', () => {
  it('returns three sections in canonical order', () => {
    const result = makeResult({ productId: 'etf' })
    const data = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    expect(data).not.toBeNull()
    expect(data!.sections).toHaveLength(3)
    expect(data!.sections[0].heading).toBe('Ansparphase, pro Monat')
    expect(data!.sections[1].heading).toBe('Mit 67, einmalig')
    expect(data!.sections[2].heading).toBe('Im Alter, pro Monat')
  })

  it('uses the dynamic retirementAge in the § 2 heading (never hardcoded 67)', () => {
    const result = makeResult({ productId: 'etf' })
    const d63 = buildVergleichDetailCardData({
      result,
      retirementAge: 63,
      yearsToRetirement: 25,
      assumptions: ASSUMPTIONS,
    })
    const d70 = buildVergleichDetailCardData({
      result,
      retirementAge: 70,
      yearsToRetirement: 35,
      assumptions: ASSUMPTIONS,
    })
    expect(d63!.sections[1].heading).toBe('Mit 63, einmalig')
    expect(d70!.sections[1].heading).toBe('Mit 70, einmalig')
  })

  it('ETF: no Steuer line in Ansparphase — Du selbst + effektiv investiert only', () => {
    const result = makeResult({ productId: 'etf', taxAndSvSavings: 0 })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    const labels = d!.sections[0].rows.map((r) => r.label)
    expect(labels).toEqual(['Du selbst', '= effektiv investiert'])
  })

  it('pAV: no Steuer line in Ansparphase even when taxAndSvSavings > 0', () => {
    // Defensive: even if upstream code populates taxAndSvSavings for pAV, the
    // row builder must not render it — pAV has no Sonderausgaben deduction
    // mechanism in compare-mode.
    const result = makeResult({ productId: 'versicherung', taxAndSvSavings: 600 })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    const labels = d!.sections[0].rows.map((r) => r.label)
    expect(labels).toEqual(['Du selbst', '= effektiv investiert'])
  })

  it('bAV: surfaces "+ Arbeitgeber" + "+ Steuer- & SV-Vorteil"', () => {
    // taxAndSvSavings is **lifetime** (annualSaving × yearsToRetirement). With
    // 30 years of accumulation, 1200 EUR/year × 30 = 36 000 lifetime savings;
    // the section divides by (12 × 30) for the monthly display.
    const annualSaving = 1200
    const result = makeResult({
      productId: 'bav',
      monthlyEmployerContribution: 30,
      taxAndSvSavings: annualSaving * DEFAULT_YEARS_TO_RETIREMENT,
    })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    const labels = d!.sections[0].rows.map((r) => r.label)
    expect(labels).toEqual(['Du selbst', '+ Arbeitgeber', '+ Steuer- & SV-Vorteil', '= effektiv investiert'])
    const taxRow = d!.sections[0].rows.find((r) => r.label === '+ Steuer- & SV-Vorteil')!
    // 1200 / 12 = 100 — the annual saving, expressed as monthly.
    expect(taxRow.value).toBe(100)
  })

  it('bAV: omits "+ Arbeitgeber" when the employer contribution is zero', () => {
    const result = makeResult({
      productId: 'bav',
      monthlyEmployerContribution: 0,
      // Lifetime: 600 EUR/year × 30 years = 18 000.
      taxAndSvSavings: 600 * DEFAULT_YEARS_TO_RETIREMENT,
    })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    const labels = d!.sections[0].rows.map((r) => r.label)
    expect(labels).toEqual(['Du selbst', '+ Steuer- & SV-Vorteil', '= effektiv investiert'])
  })

  it.each(['basisrente', 'altersvorsorgedepot', 'riester'] as const)(
    '%s: surfaces "+ Steuerrückerstattung" (not "Steuer- & SV-Vorteil")',
    (productId) => {
      const annualSaving = 240
      const result = makeResult({
        productId,
        taxAndSvSavings: annualSaving * DEFAULT_YEARS_TO_RETIREMENT,
      })
      const d = buildVergleichDetailCardData({
        result,
        retirementAge: 67,
        yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
        assumptions: ASSUMPTIONS,
      })
      const labels = d!.sections[0].rows.map((r) => r.label)
      expect(labels).toEqual(['Du selbst', '+ Steuerrückerstattung', '= effektiv investiert'])
      const taxRow = d!.sections[0].rows.find((r) => r.label === '+ Steuerrückerstattung')!
      // 240 / 12 = 20.
      expect(taxRow.value).toBe(20)
    },
  )

  // -----------------------------------------------------------------------
  // Regression: PR 290 Codex P1 — `taxAndSvSavings` is lifetime, not annual.
  // -----------------------------------------------------------------------
  it('bAV: monthly Steuer-Vorteil is in the right order of magnitude (not inflated by yearsToRetirement)', () => {
    // Real-world parameters: 30-year accumulation, 500 EUR/year tax savings.
    // Lifetime accumulated = 500 × 30 = 15 000. Correct monthly value is
    // 500 / 12 ≈ 41.67 EUR/month, NOT 15 000 / 12 = 1250 EUR/month (the bug).
    const annualSaving = 500
    const yearsToRetirement = 30
    const result = makeResult({
      productId: 'bav',
      monthlyEmployerContribution: 0,
      taxAndSvSavings: annualSaving * yearsToRetirement, // 15 000 lifetime
    })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement,
      assumptions: ASSUMPTIONS,
    })
    const taxRow = d!.sections[0].rows.find((r) => r.label === '+ Steuer- & SV-Vorteil')!
    // Right order of magnitude: ~41 EUR/month, not ~1250 EUR/month.
    expect(taxRow.value).toBeCloseTo(annualSaving / 12, 2)
    expect(taxRow.value).toBeLessThan(100)
    expect(taxRow.value).toBeGreaterThan(20)
  })

  it.each(['basisrente', 'altersvorsorgedepot', 'riester'] as const)(
    '%s: monthly Steuerrückerstattung divides lifetime savings by 12 × yearsToRetirement',
    (productId) => {
      // Pin the §10 Sonderausgaben products to the same monthly-conversion
      // rule as bAV. With 35 years and 600 EUR/year refund, expect ~50/month.
      const annualSaving = 600
      const yearsToRetirement = 35
      const result = makeResult({
        productId,
        taxAndSvSavings: annualSaving * yearsToRetirement,
      })
      const d = buildVergleichDetailCardData({
        result,
        retirementAge: 67,
        yearsToRetirement,
        assumptions: ASSUMPTIONS,
      })
      const row = d!.sections[0].rows.find((r) => r.label === '+ Steuerrückerstattung')!
      expect(row.value).toBeCloseTo(annualSaving / 12, 2)
    },
  )

  it('drops the Steuer line gracefully when yearsToRetirement is zero (defensive)', () => {
    // Defensive: yearsToRetirement = 0 would otherwise divide by zero and
    // surface as Infinity. The helper clamps to 0, dropping the row.
    const result = makeResult({
      productId: 'bav',
      taxAndSvSavings: 12_000,
    })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: 0,
      assumptions: ASSUMPTIONS,
    })
    const labels = d!.sections[0].rows.map((r) => r.label)
    expect(labels).not.toContain('+ Steuer- & SV-Vorteil')
  })

  it('§ Ansparphase total equals the sum of contributing rows', () => {
    const annualSaving = 1200
    const result = makeResult({
      productId: 'bav',
      monthlyUserCost: 200,
      monthlyEmployerContribution: 30,
      taxAndSvSavings: annualSaving * DEFAULT_YEARS_TO_RETIREMENT, // 100 EUR/month after divide
    })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    const total = d!.sections[0].rows.find((r) => r.kind === 'total')!
    expect(total.value).toBe(330) // 200 + 30 + 100
  })

  it('§ Mit X surfaces Kapital brutto + Kosten gesamt + Effektivkosten p. a. info', () => {
    const result = makeResult({
      productId: 'etf',
      capitalAtRetirement: 250_000,
      totalFees: 8_500,
      accumulationRiy: 0.0085,
    })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
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
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
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
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    const rows = d!.sections[2].rows
    const kvPv = rows.find((r) => r.label === '− KV / PV')!
    expect(kvPv.value).toBe(0)
    // Income tax = 500 − 480 − 0 = 20. ETF is Abgeltungsteuer (§20 Abs. 1
    // Nr. 1 EStG + §43 EStG), not Einkommensteuer.
    const tax = rows.find((r) => r.label === '− Abgeltungsteuer')!
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
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    const tax = d!.sections[2].rows.find((r) => r.label === '− Abgeltungsteuer')!
    expect(tax.value).toBe(0)
  })

  // -----------------------------------------------------------------------
  // Regression: PR 290 Codex P2 — bAV `includeGrvReduction` mislabels GRV
  // loss as income tax.
  // -----------------------------------------------------------------------
  it('bAV: includeGrvReduction does NOT inflate "− Einkommensteuer" with the GRV-loss estimate', () => {
    // Setup: gross 800, net 480, kvPv 120 — by raw derivation the tax row
    // would be 800 − 480 − 120 = 200. But 50 EUR/month of that "gap" is the
    // GRV reduction the bAV simulator subtracts at `bav.ts:82-84` when
    // `includeGrvReduction = true`. The tax row must surface only the actual
    // marginal tax: 800 − (480 + 50) − 120 = 150.
    const result = makeResult({
      productId: 'bav',
      grossMonthlyPayout: 800,
      netMonthlyPayout: 480,
      kvPvMonthly: 120,
    })
    const includeGrvAssumptions = {
      retirementEndAge: 87,
      bav: { includeGrvReduction: true },
    } as unknown as ScenarioAssumptions
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: includeGrvAssumptions,
      bavFunding: makeBavFunding(50),
    })
    const tax = d!.sections[2].rows.find((r) => r.label === '− Einkommensteuer')!
    // Without the fix this would be 200 (= 800 − 480 − 120). With the fix it
    // is 150 (= 800 − (480 + 50) − 120) because the 50 EUR of GRV reduction
    // is added back to net before the derivation.
    expect(tax.value).toBe(150)
    // Net is still surfaced as the engine-computed value (the user-facing
    // "what lands in your account" figure).
    const net = d!.sections[2].rows.find((r) => r.label === '= Netto-Rente')!
    expect(net.value).toBe(480)
  })

  it('bAV: includeGrvReduction = false leaves the legacy derivation unchanged', () => {
    // Sanity check: when the flag is off, even passing a non-zero
    // `bavFunding.estimatedMonthlyGrvReduction` must not affect the tax row.
    const result = makeResult({
      productId: 'bav',
      grossMonthlyPayout: 800,
      netMonthlyPayout: 600,
      kvPvMonthly: 120,
    })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS, // includeGrvReduction: false
      bavFunding: makeBavFunding(80),
    })
    const tax = d!.sections[2].rows.find((r) => r.label === '− Einkommensteuer')!
    expect(tax.value).toBe(80) // 800 − 600 − 120
  })

  it('non-bAV products ignore bavFunding even when passed', () => {
    // ETF / pAV / Schicht-1 / Schicht-2 / Riester payouts have no GRV
    // reduction in their net derivation. The row builder must not touch the
    // tax row based on `bavFunding`.
    const result = makeResult({
      productId: 'basisrente',
      grossMonthlyPayout: 800,
      netMonthlyPayout: 600,
      kvPvMonthly: 120,
    })
    const includeGrvAssumptions = {
      retirementEndAge: 87,
      bav: { includeGrvReduction: true },
    } as unknown as ScenarioAssumptions
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: includeGrvAssumptions,
      bavFunding: makeBavFunding(50),
    })
    const tax = d!.sections[2].rows.find((r) => r.label === '− Einkommensteuer')!
    expect(tax.value).toBe(80) // 800 − 600 − 120, no GRV-add-back
  })

  // -----------------------------------------------------------------------
  // Regression: PR 290 R3 CodeRabbit — surface the bAV GRV reduction as its
  // own deduction row so Im-Alter rows reconcile to `= Netto-Rente`.
  // -----------------------------------------------------------------------
  it('bAV with includeGrvReduction: surfaces "− GRV-Reduktion" row equal to the funding estimate', () => {
    // Setup: gross 800, net 480, kvPv 120, GRV estimate 50. The visible
    // cascade must include a "− GRV-Reduktion 50" row BEFORE "= Netto-Rente"
    // so the user can audit: 800 − 150 (tax) − 120 (KV/PV) − 50 (GRV) = 480.
    const result = makeResult({
      productId: 'bav',
      grossMonthlyPayout: 800,
      netMonthlyPayout: 480,
      kvPvMonthly: 120,
    })
    const includeGrvAssumptions = {
      retirementEndAge: 87,
      bav: { includeGrvReduction: true },
    } as unknown as ScenarioAssumptions
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: includeGrvAssumptions,
      bavFunding: makeBavFunding(50),
    })
    const rows = d!.sections[2].rows
    const grv = rows.find((r) => r.label === '− GRV-Reduktion')
    expect(grv).toBeDefined()
    expect(grv!.value).toBe(50)
    expect(grv!.kind).toBe('sub')
    // Row order: Brutto → tax → KV/PV → GRV → Netto.
    const labels = rows.map((r) => r.label)
    expect(labels).toEqual([
      'Brutto-Rente',
      '− Einkommensteuer',
      '− KV / PV',
      '− GRV-Reduktion',
      '= Netto-Rente',
    ])
  })

  it('bAV with includeGrvReduction: Im-Alter rows reconcile to = Netto-Rente', () => {
    // Reconciliation invariant — the visible cascade must close exactly:
    //   gross − tax − KV/PV − GRV ≡ netMonthlyPayout (within rounding).
    // Without surfacing the GRV row, the previous 4-row layout was off by
    // exactly the GRV-loss estimate.
    const result = makeResult({
      productId: 'bav',
      grossMonthlyPayout: 800,
      netMonthlyPayout: 480,
      kvPvMonthly: 120,
    })
    const includeGrvAssumptions = {
      retirementEndAge: 87,
      bav: { includeGrvReduction: true },
    } as unknown as ScenarioAssumptions
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: includeGrvAssumptions,
      bavFunding: makeBavFunding(50),
    })
    const rows = d!.sections[2].rows
    const gross = rows.find((r) => r.label === 'Brutto-Rente')!.value
    const tax = rows.find((r) => r.label === '− Einkommensteuer')!.value
    const kvPv = rows.find((r) => r.label === '− KV / PV')!.value
    const grv = rows.find((r) => r.label === '− GRV-Reduktion')!.value
    const net = rows.find((r) => r.label === '= Netto-Rente')!.value
    expect(gross - tax - kvPv - grv).toBeCloseTo(net, 6)
  })

  it('bAV with includeGrvReduction = false: NO "− GRV-Reduktion" row is inserted', () => {
    // When the flag is off, even passing a non-zero `bavFunding` must leave
    // the legacy 4-row layout untouched (no GRV row). Defensive against
    // accidental over-rendering.
    const result = makeResult({
      productId: 'bav',
      grossMonthlyPayout: 800,
      netMonthlyPayout: 600,
      kvPvMonthly: 120,
    })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS, // includeGrvReduction: false
      bavFunding: makeBavFunding(80),
    })
    const labels = d!.sections[2].rows.map((r) => r.label)
    expect(labels).not.toContain('− GRV-Reduktion')
    expect(labels).toEqual([
      'Brutto-Rente',
      '− Einkommensteuer',
      '− KV / PV',
      '= Netto-Rente',
    ])
  })

  it('bAV with includeGrvReduction but zero estimate: NO "− GRV-Reduktion" row is inserted', () => {
    // Edge case: flag on but engine produced a 0 reduction (e.g. user with
    // §1 SvEV portion only). Don't surface a row with value 0 — the visible
    // cascade should remain the legacy 4-row layout.
    const result = makeResult({
      productId: 'bav',
      grossMonthlyPayout: 800,
      netMonthlyPayout: 600,
      kvPvMonthly: 120,
    })
    const includeGrvAssumptions = {
      retirementEndAge: 87,
      bav: { includeGrvReduction: true },
    } as unknown as ScenarioAssumptions
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: includeGrvAssumptions,
      bavFunding: makeBavFunding(0),
    })
    const labels = d!.sections[2].rows.map((r) => r.label)
    expect(labels).not.toContain('− GRV-Reduktion')
  })

  it.each(['etf', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'] as const)(
    '%s: NO "− GRV-Reduktion" row even with bavFunding + includeGrvReduction',
    (productId) => {
      // Non-bAV products must never surface the GRV row — the reduction is
      // a bAV-payout-only phenomenon. Defensive coverage for the
      // `result.productId === 'bav'` guard inside `buildPayoutSection`.
      const result = makeResult({
        productId,
        grossMonthlyPayout: 600,
        netMonthlyPayout: 500,
        kvPvMonthly: 50,
      })
      const includeGrvAssumptions = {
        retirementEndAge: 87,
        bav: { includeGrvReduction: true },
      } as unknown as ScenarioAssumptions
      const d = buildVergleichDetailCardData({
        result,
        retirementAge: 67,
        yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
        assumptions: includeGrvAssumptions,
        bavFunding: makeBavFunding(50),
      })
      const labels = d!.sections[2].rows.map((r) => r.label)
      expect(labels).not.toContain('− GRV-Reduktion')
    },
  )

  it('ETF surfaces "− Abgeltungsteuer" in Im Alter (§20 Abs. 1 Nr. 1 EStG + §43 EStG)', () => {
    // The ETF payout deduction is statutorily Abgeltungsteuer — labeling it
    // "Einkommensteuer" misnames the legal basis. Other products keep
    // Einkommensteuer (marginal rate via §22 / cohort tables).
    const result = makeResult({
      productId: 'etf',
      grossMonthlyPayout: 600,
      netMonthlyPayout: 500,
      kvPvMonthly: 50,
    })
    const d = buildVergleichDetailCardData({
      result,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    const labels = d!.sections[2].rows.map((r) => r.label)
    expect(labels).toContain('− Abgeltungsteuer')
    expect(labels).not.toContain('− Einkommensteuer')
  })

  // -----------------------------------------------------------------------
  // Registry-driven payout tax-label routing (CodeRabbit Minor on PR 290):
  // derive the product list from PRODUCT_REGISTRY directly. `entry.metadata.id`
  // is the canonical source of `ProductId` (non-nullable on a registry entry),
  // so no null-guard / silent-drop is needed — a future seventh product surfaces
  // missing tax-label coverage as a test failure rather than silent drift.
  // -----------------------------------------------------------------------
  const nonEtfProductIds: ProductId[] = PRODUCT_REGISTRY
    .map((entry) => entry.metadata.id)
    .filter((id): id is ProductId => id !== 'etf')

  it.each(nonEtfProductIds)(
    '%s surfaces "− Einkommensteuer" in Im Alter (not Abgeltungsteuer)',
    (productId) => {
      const result = makeResult({
        productId,
        grossMonthlyPayout: 600,
        netMonthlyPayout: 500,
        kvPvMonthly: 50,
      })
      const d = buildVergleichDetailCardData({
        result,
        retirementAge: 67,
        yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
        assumptions: ASSUMPTIONS,
      })
      const labels = d!.sections[2].rows.map((r) => r.label)
      expect(labels).toContain('− Einkommensteuer')
      expect(labels).not.toContain('− Abgeltungsteuer')
    },
  )

  it('returns null when the registry has no metadata for the product id', () => {
    const bogus = makeResult({ productId: 'etf' })
    // Force an unknown id via double cast — the registry's null-guard branch
    // can only fire on out-of-band ids that bypass the type system at runtime
    // (e.g. forward-compat scenarios where a saved scenario references a
    // product newer than the registry). Use a `as unknown as ProductResult`
    // hop to evade the discriminated-union exactness check.
    const fake = { ...bogus, productId: 'unknown' } as unknown as ProductResult
    const d = buildVergleichDetailCardData({
      result: fake,
      retirementAge: 67,
      yearsToRetirement: DEFAULT_YEARS_TO_RETIREMENT,
      assumptions: ASSUMPTIONS,
    })
    expect(d).toBeNull()
  })
})
