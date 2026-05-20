import type { ProductId, ScenarioAssumptions } from '../../domain'
import type { ProductResult } from '../../domain/results'
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
   * Scenario assumptions for the current run. Currently unused by the row
   * helpers but reserved as the extension point for future Verfügbarkeit
   * adjustments that depend on retirementEndAge or contract-start year.
   * Kept in the signature so callers don't have to rewire when those
   * helpers gain assumption-driven branches.
   */
  assumptions: ScenarioAssumptions
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
  // `args.assumptions` is intentionally accepted but currently unused by the
  // section helpers; see the interface comment above. Destructure narrowly
  // so the unused field doesn't trip @typescript-eslint/no-unused-vars
  // (the project's default config rejects leading-underscore params too).
  const { result, retirementAge } = args
  const meta = getProductMeta(result.productId)
  if (!meta) return null

  return {
    productId: result.productId,
    label: meta.label,
    shortLabel: meta.shortLabel,
    sections: [
      buildAnsparSection(result),
      buildKapitalSection(result, retirementAge),
      buildPayoutSection(result),
    ],
    effectiveAnnualCost: result.accumulationRiy,
  }
}

// ---------------------------------------------------------------------------
// Section 1 — § Ansparphase, pro Monat
// ---------------------------------------------------------------------------

function buildAnsparSection(result: ProductResult): VergleichDetailSection {
  const rows: VergleichDetailRow[] = [
    { label: 'Du selbst', value: result.monthlyUserCost, kind: 'add' },
  ]

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
    if (result.taxAndSvSavings > 0) {
      rows.push({
        label: '+ Steuer- & SV-Vorteil',
        value: result.taxAndSvSavings / 12,
        kind: 'add',
      })
    }
  } else if (
    result.productId === 'basisrente' ||
    result.productId === 'altersvorsorgedepot' ||
    result.productId === 'riester'
  ) {
    if (result.taxAndSvSavings > 0) {
      rows.push({
        label: '+ Steuerrückerstattung',
        value: result.taxAndSvSavings / 12,
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

function buildPayoutSection(result: ProductResult): VergleichDetailSection {
  // Per CLAUDE.md "Non-obvious architecture": ProductResult exposes
  // `grossMonthlyPayout`, `netMonthlyPayout`, and `kvPvMonthly?`. There is no
  // dedicated `incomeTaxMonthly` field. The cascade
  // `gross → marginal-tax → KV/PV → net` is owned by
  // `calculateMonthlyRetirementPayout`, so monthly income tax can be derived
  // as `gross − net − kvPv` (KV/PV defaults to 0 on legacy paths).
  const kvPvMonthly = result.kvPvMonthly ?? 0
  const incomeTaxMonthly = Math.max(
    0,
    result.grossMonthlyPayout - result.netMonthlyPayout - kvPvMonthly,
  )

  return {
    heading: 'Im Alter, pro Monat',
    rows: [
      { label: 'Brutto-Rente', value: result.grossMonthlyPayout, kind: 'add' },
      { label: '− Einkommensteuer', value: incomeTaxMonthly, kind: 'sub' },
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
