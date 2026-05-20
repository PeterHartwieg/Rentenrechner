import type { BavFundingResult, ProductId, ProductResult, ScenarioAssumptions } from '../../domain'
import { getProductMeta } from '../../engine/productRegistry'

// ---------------------------------------------------------------------------
// vergleichDetailRows — pure data layer for the `/vergleich/details` cards.
//
// Each `ProductResult` (filtered to one scenario) produces a typed
// `VergleichDetailCardData` blob with three section row-lists. The card
// component is presentational; the per-product Steuer-line routing — bAV
// shows "+ Arbeitgeber" + "+ Steuer- & SV-Vorteil", Schicht-1/2/Riester show
// "+ Steuerrückerstattung", ETF / pAV show no Steuer line — happens here.
//
// All monetary values stay in full engine precision; the card formats them
// via `formatCurrency` at the display boundary (CLAUDE.md "UI rounding").
// ---------------------------------------------------------------------------

/** A single monetary line inside a card section. */
export interface VergleichDetailRow {
  /** German label, e.g. `"Du selbst"` or `"+ Steuerrückerstattung"`. */
  readonly label: string
  /** Engine-precision euro value (formatted by the card). */
  readonly value: number
  /**
   * `'add'` rows are summands of the section's effektiv-line.
   * `'sub'` rows are deductions (rendered with a leading `−`).
   * `'total'` is the bold closing row (e.g. `= effektiv investiert`).
   * `'info'` is a non-monetary annotation (e.g. cost percentage).
   */
  readonly kind: 'add' | 'sub' | 'total' | 'info'
  /** Optional pre-formatted display string for `'info'` rows (e.g. `"1,20 %"`). */
  readonly display?: string
  /** When `true`, the row is rendered with the oxblood accent (net-payout closing line only). */
  readonly accent?: boolean
}

/** A labeled section inside one product card. */
export interface VergleichDetailSection {
  /** Mono section heading (e.g. `"Ansparphase, pro Monat"`). */
  readonly heading: string
  readonly rows: ReadonlyArray<VergleichDetailRow>
}

/** Per-card data structure consumed by `VergleichDetailCard`. */
export interface VergleichDetailCardData {
  readonly productId: ProductId
  readonly label: string
  readonly shortLabel: string
  readonly sections: ReadonlyArray<VergleichDetailSection>
  /** Effektivkosten p. a. (decimal — e.g. `0.012` for 1.2 %). */
  readonly effectiveAnnualCost: number
}

interface BuildArgs {
  result: ProductResult
  retirementAge: number
  /**
   * Years of accumulation between contract start (current age) and the
   * configured retirement age. Required to convert the lifetime-accumulated
   * `ProductResult.taxAndSvSavings` (bAV: `annualTaxAndSvSavings × yearsToRetirement`;
   * Basisrente / AVD / Riester: per-year `reduce` summed across accumulation
   * years) into a monthly display figure: `value / (12 * yearsToRetirement)`.
   *
   * Threaded from the page via `profile.retirementAge - profile.age`.
   * See `src/engine/products/bav.ts` (line 41) and the §10 Sonderausgaben
   * funding helpers (`salaryPhaseFunding.ts`) for the engine semantics.
   */
  yearsToRetirement: number
  /**
   * Scenario assumptions for the current run. Used to gate the bAV
   * Fix 2 path: when `assumptions.bav.includeGrvReduction` is `true`,
   * `netMonthlyPayout` has the bAV-funding GRV-loss estimate subtracted on
   * top of tax + KV/PV (see `src/engine/products/bav.ts:82-84`). The income-tax
   * derivation must add that estimate back to net before doing the
   * `gross − net − kvPv` arithmetic; otherwise the "− Einkommensteuer" row
   * mislabels the GRV reduction as tax.
   */
  assumptions: ScenarioAssumptions
  /**
   * Compare-mode `SimulationResult.bavFunding`. Required for the bAV Fix 2
   * path so we can read `estimatedMonthlyGrvReduction`. Optional because
   * non-bAV cards never consult it; if omitted, the bAV GRV adjustment is
   * skipped (so the row falls back to the legacy `gross − net − kvPv`
   * derivation — defensive against test fixtures that don't construct a
   * full bavFunding).
   */
  bavFunding?: BavFundingResult
}

/**
 * Build the three-section card data for one product. Returns `null` when the
 * registry has no metadata for the product (defensive — `getProductMeta`
 * returns `ProductManifestEntry | undefined` and every UI call-site must
 * null-guard, per CLAUDE.md "Non-obvious architecture").
 */
export function buildVergleichDetailCardData(
  args: BuildArgs,
): VergleichDetailCardData | null {
  const { result, retirementAge, yearsToRetirement, assumptions, bavFunding } = args
  const meta = getProductMeta(result.productId)
  if (!meta) return null

  return {
    productId: result.productId,
    label: meta.label,
    shortLabel: meta.shortLabel,
    sections: [
      buildAnsparSection(result, yearsToRetirement),
      buildKapitalSection(result, retirementAge),
      buildPayoutSection(result, assumptions, bavFunding),
    ],
    effectiveAnnualCost: result.accumulationRiy,
  }
}

// ---------------------------------------------------------------------------
// Section 1 — § Ansparphase, pro Monat
// ---------------------------------------------------------------------------

function buildAnsparSection(
  result: ProductResult,
  yearsToRetirement: number,
): VergleichDetailSection {
  const rows: VergleichDetailRow[] = [
    { label: 'Du selbst', value: result.monthlyUserCost, kind: 'add' },
  ]

  // `ProductResult.taxAndSvSavings` is the **lifetime** tax-and-SV benefit over
  // the whole accumulation phase, NOT a per-year figure. The engine populates
  // it as `annualSaving × yearsToRetirement` for bAV
  // (`src/engine/products/bav.ts:41`) and as a `reduce` summing each year's
  // funding for §10 products (`basisrente.ts:38`, `altersvorsorgedepot.ts:135`,
  // `riester.ts:111`). To surface the monthly contribution effect, divide by
  // (12 × yearsToRetirement); dividing by 12 alone inflates the displayed
  // benefit by `yearsToRetirement` (e.g. ~30×) and overstates "= effektiv
  // investiert". Fixes PR 290 Codex P1.
  const monthlyTaxBenefit = monthlyTaxBenefitOf(result.taxAndSvSavings, yearsToRetirement)

  // bAV uniquely surfaces the employer contribution and labels the §3 Nr. 63 /
  // §1 SvEV tax + SV delta as "Steuer- & SV-Vorteil". The §10 Sonderausgaben
  // products (Basisrente / AVD / Riester) label theirs as
  // "Steuerrückerstattung". ETF / pAV have no Ansparphase Steuer line.
  if (result.productId === 'bav') {
    if (result.monthlyEmployerContribution > 0) {
      rows.push({
        label: '+ Arbeitgeber',
        value: result.monthlyEmployerContribution,
        kind: 'add',
      })
    }
    if (monthlyTaxBenefit > 0) {
      rows.push({
        label: '+ Steuer- & SV-Vorteil',
        value: monthlyTaxBenefit,
        kind: 'add',
      })
    }
  } else if (
    result.productId === 'basisrente' ||
    result.productId === 'altersvorsorgedepot' ||
    result.productId === 'riester'
  ) {
    if (monthlyTaxBenefit > 0) {
      rows.push({
        label: '+ Steuerrückerstattung',
        value: monthlyTaxBenefit,
        kind: 'add',
      })
    }
  }
  // ETF + pAV (`'versicherung'`): no Ansparphase Steuer line — omit row.

  // Total = sum of all `add` rows in this section.
  const totalValue = rows.reduce((sum, row) => (row.kind === 'add' ? sum + row.value : sum), 0)
  rows.push({
    label: '= effektiv investiert',
    value: totalValue,
    kind: 'total',
  })

  return { heading: 'Ansparphase, pro Monat', rows }
}

/**
 * Convert lifetime-accumulated `taxAndSvSavings` (engine convention) into a
 * per-month display value. Defensive against `yearsToRetirement <= 0` (would
 * yield `Infinity` otherwise — surfaces as 0 to drop the row). See `buildAnsparSection`.
 */
function monthlyTaxBenefitOf(lifetimeTaxAndSvSavings: number, yearsToRetirement: number): number {
  if (yearsToRetirement <= 0) return 0
  return lifetimeTaxAndSvSavings / (12 * yearsToRetirement)
}

// ---------------------------------------------------------------------------
// Section 2 — § Mit {retirementAge}, einmalig
// ---------------------------------------------------------------------------

function buildKapitalSection(
  result: ProductResult,
  retirementAge: number,
): VergleichDetailSection {
  return {
    heading: `Mit ${retirementAge}, einmalig`,
    rows: [
      { label: 'Kapital brutto', value: result.capitalAtRetirement, kind: 'add' },
      // Cumulative fees over the accumulation period — paired with the
      // Effektivkosten p. a. info row so the user sees both the headline % and
      // the integrated euro figure.
      { label: '− Kosten gesamt', value: result.totalFees, kind: 'sub' },
      // `accumulationRiy` is a decimal (0.012 = 1.2 % p.a.). The card formats
      // via `formatPercent(value, 2)` — we store the ratio, the card renders
      // the display string.
      {
        label: 'Effektivkosten p. a.',
        value: result.accumulationRiy,
        kind: 'info',
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Section 3 — § Im Alter, pro Monat
// ---------------------------------------------------------------------------

function buildPayoutSection(
  result: ProductResult,
  assumptions: ScenarioAssumptions,
  bavFunding: BavFundingResult | undefined,
): VergleichDetailSection {
  // Per CLAUDE.md "Non-obvious architecture": ProductResult exposes
  // `grossMonthlyPayout`, `netMonthlyPayout`, and `kvPvMonthly?`. The
  // `calculateMonthlyRetirementPayout` cascade returns `marginalTaxAnnual`
  // internally, but **does not propagate it** through `buildProductResult`
  // onto `ProductResult` (see `src/engine/buildResult.ts:222-259`). So we
  // derive monthly income tax as `gross − net − kvPv` at the display layer,
  // matching what the engine internally computes.
  const kvPvMonthly = result.kvPvMonthly ?? 0

  // PR 290 Codex P2 fix: for bAV with `assumptions.bav.includeGrvReduction =
  // true`, `netMonthlyPayout` has an additional deduction beyond tax + KV/PV
  // — `bavFunding.estimatedMonthlyGrvReduction` — subtracted at
  // `src/engine/products/bav.ts:82-84`. Without compensating, the naive
  // derivation `gross − net − kvPv` rolls that GRV-loss estimate into the
  // "− Einkommensteuer" row, mislabeling a pension-system reduction as a tax.
  // Add the GRV reduction back to net before deriving income tax so the row
  // surfaces only the marginal-tax delta produced by the canonical
  // retirement-tax cascade. (Architectural invariant: monthly retirement
  // payouts go through `calculateMonthlyRetirementPayout`; the display layer
  // consumes what the cascade produces rather than re-deriving.)
  const grvReductionMonthly =
    result.productId === 'bav' &&
    assumptions.bav.includeGrvReduction &&
    bavFunding
      ? bavFunding.estimatedMonthlyGrvReduction
      : 0
  const netForTaxDerivation = result.netMonthlyPayout + grvReductionMonthly
  const incomeTaxMonthly = Math.max(
    0,
    result.grossMonthlyPayout - netForTaxDerivation - kvPvMonthly,
  )

  return {
    heading: 'Im Alter, pro Monat',
    rows: [
      { label: 'Brutto-Rente', value: result.grossMonthlyPayout, kind: 'add' },
      { label: getPayoutTaxLabel(result.productId), value: incomeTaxMonthly, kind: 'sub' },
      { label: '− KV / PV', value: kvPvMonthly, kind: 'sub' },
      {
        label: '= Netto-Rente',
        value: result.netMonthlyPayout,
        kind: 'total',
        accent: true,
      },
    ],
  }
}

/**
 * Per-product payout tax-line label routing (PR 290 Codex P2 fix).
 *
 * ETF payouts are taxed under §20 Abs. 1 Nr. 1 EStG + §43 EStG as
 * Abgeltungsteuer (flat 25 % on Kapitalverzehr exit gains after the
 * Sparerpauschbetrag). Every other product taxes the payout at the
 * marginal income-tax rate — Einkommensteuer.
 *
 * Note: for pAV with Leibrente the legal basis is §22 Nr. 1 Satz 3 a EStG
 * (Ertragsanteil-style income tax) but the surface label "Einkommensteuer"
 * stays correct since it is still a marginal-rate income-tax deduction.
 *
 * Exhaustive switch with `_exhaustive: never` so a future seventh product
 * forces a type error here — same convention as
 * `vergleichDetailAvailability.ts`.
 */
function getPayoutTaxLabel(productId: ProductId): string {
  switch (productId) {
    case 'etf':
      return '− Abgeltungsteuer'
    case 'bav':
    case 'versicherung':
    case 'basisrente':
    case 'altersvorsorgedepot':
    case 'riester':
      return '− Einkommensteuer'
    default: {
      const _exhaustive: never = productId
      return _exhaustive
    }
  }
}
