import { lifecycleLineKeys, type LifecycleSeriesResult } from '../results/breakEvenSeries'

// ---------------------------------------------------------------------------
// Wendepunkte ("turning points") — pure builder for the § 1 table on the
// `/kapital` page (PR 8).
//
// Each row pulls a single age out of the lifecycle line-series and reports
// the aggregate Kapital / Eingezahlt / Ausgezahlt across the visible
// selection of products. The page passes whatever `selectedResults` set the
// filter chips chose — the builder is mode-agnostic (works for compare-mode
// per-product results and combine-mode aggregated portfolio views).
//
// Surface convention follows the mock:
//   1. Halbzeit der Ansparphase  (age = currentAge + (retirementAge−currentAge)/2)
//   2. Renteneintritt — Auszahlung beginnt  (age = retirementAge)
//   3. Break-even — Auszahlungen ≥ Einzahlungen  (first age where cumulative
//      net payouts ≥ cumulative net paid-in)
//   4. Voraussichtliches Vertragsende  (age = retirementEndAge)
//
// Rows where the age is out of range or the data is unavailable are still
// emitted (with a `capital`/`paidIn`/`payout` of `null`) so the table layout
// stays stable across selections — the renderer formats nullish cells as `–`.
// ---------------------------------------------------------------------------

export type WendepunktKind =
  | 'halbzeit-anspar'
  | 'renteneintritt'
  | 'break-even'
  | 'modell-ende'

export interface WendepunktRow {
  kind: WendepunktKind
  /** Age in years at which the event happens. `null` when not applicable
   *  (e.g. break-even never reached within the data window). */
  age: number | null
  /** German label rendered in the "Ereignis" column. */
  label: string
  /** Aggregate Kapital (Restwert) at this age across `selectedResults`. */
  capital: number | null
  /** Aggregate cumulative Netto-Einzahlung at this age. */
  paidIn: number | null
  /** Aggregate cumulative Netto-Auszahlung at this age. */
  payout: number | null
}

export interface BuildWendepunkteInput {
  /** The visible product selection. Aggregate is summed across these. */
  selectedResults: LifecycleSeriesResult[]
  /** Lifecycle line-series rows from `buildLifecycleLineSeries`. */
  data: Record<string, number>[]
  /** User's current age (lifecycle start). */
  startAge: number
  /** Planned retirement age. */
  retirementAge: number
  /** Modell-Endalter from `assumptions.retirementEndAge`. */
  retirementEndAge: number
}

const LABELS: Record<WendepunktKind, string> = {
  'halbzeit-anspar': 'Halbzeit der Ansparphase',
  renteneintritt: 'Renteneintritt — Auszahlung beginnt',
  'break-even': 'Break-even — Auszahlungen ≥ Einzahlungen',
  'modell-ende': 'Voraussichtliches Vertragsende',
}

/**
 * Build the ordered Wendepunkte row list. Stable shape: always emits the
 * four kinds in the same order, even when individual rows have null age /
 * values, so the table rendering does not jump between selections.
 */
export function buildWendepunkte({
  selectedResults,
  data,
  startAge,
  retirementAge,
  retirementEndAge,
}: BuildWendepunkteInput): WendepunktRow[] {
  if (selectedResults.length === 0) return []

  const halfwayAge = clampAgeToSeries(
    data,
    Math.round(startAge + Math.max(0, retirementAge - startAge) / 2),
  )
  const renteneintrittAge = clampAgeToSeries(data, retirementAge)
  const modellEndeAge = clampAgeToSeries(data, retirementEndAge)
  const breakEvenAge = findBreakEvenAge(selectedResults, data)

  return [
    rowAt('halbzeit-anspar', halfwayAge, selectedResults, data),
    rowAt('renteneintritt', renteneintrittAge, selectedResults, data),
    rowAt('break-even', breakEvenAge, selectedResults, data),
    rowAt('modell-ende', modellEndeAge, selectedResults, data),
  ]
}

/**
 * Locate a data row whose `age` field matches exactly. Returns `null` when
 * no exact match exists — callers fall back to a `null` value cell rather
 * than interpolating, because the lifecycle series is integer-aged.
 */
function clampAgeToSeries(data: Record<string, number>[], age: number): number | null {
  if (!Number.isFinite(age)) return null
  const exists = data.some((row) => Number(row.age) === age)
  return exists ? age : null
}

/**
 * Aggregate (capital / paid-in / payout) across `selectedResults` at the
 * given age. Returns nulls when `age` is null or the lookup fails — the
 * table renderer formats nulls as `–`.
 */
function rowAt(
  kind: WendepunktKind,
  age: number | null,
  selectedResults: LifecycleSeriesResult[],
  data: Record<string, number>[],
): WendepunktRow {
  const label = LABELS[kind]
  if (age === null) {
    return { kind, age: null, label, capital: null, paidIn: null, payout: null }
  }
  const row = data.find((r) => Number(r.age) === age)
  if (!row) {
    return { kind, age, label, capital: null, paidIn: null, payout: null }
  }
  let capital = 0
  let paidIn = 0
  let payout = 0
  for (const result of selectedResults) {
    const keys = lifecycleLineKeys(result)
    capital += Number(row[keys.balance] ?? 0)
    paidIn += Number(row[keys.paidIn] ?? 0)
    payout += Number(row[keys.payout] ?? 0)
  }
  return { kind, age, label, capital, paidIn, payout }
}

/**
 * First age where the aggregate cumulative net payout reaches the aggregate
 * cumulative net paid-in. Returns `null` when the event never occurs within
 * the data window (the table cell will render as `–`).
 *
 * The threshold uses `>=`, so a row where both sides are zero (entirely
 * pre-retirement) does NOT register — we require `paidIn > 0` to ensure
 * the user has actually contributed something before claiming "break-even".
 */
function findBreakEvenAge(
  selectedResults: LifecycleSeriesResult[],
  data: Record<string, number>[],
): number | null {
  for (const row of data) {
    let paidIn = 0
    let payout = 0
    for (const result of selectedResults) {
      const keys = lifecycleLineKeys(result)
      paidIn += Number(row[keys.paidIn] ?? 0)
      payout += Number(row[keys.payout] ?? 0)
    }
    if (paidIn > 0 && payout >= paidIn) return Number(row.age)
  }
  return null
}
