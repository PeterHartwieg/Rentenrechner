import type { EtfPayoutRow } from '../../domain'

export interface LifecyclePayoutRow {
  age: number
  grossAnnualPayout: number
  netAnnualPayout: number
  capitalAtEnd: number
}

export interface LifecycleSeriesResult {
  /**
   * Product family discriminant — drives ETF-specific payout-row handling in
   * `annualNetPayoutAt` / `annualGrossPayoutAt` (which read `etfPayoutRows`
   * only when `productId === 'etf'`). MUST stay the real product family id;
   * callers that need a unique key across multiple instances of the same
   * product (combine-mode print, per-contract Wendepunkte) set `seriesKey`
   * instead of overwriting `productId`.
   */
  productId: string
  label: string
  rows: Array<{ age: number; balance: number }>
  etfPayoutRows?: EtfPayoutRow[]
  lifecyclePayoutRows?: LifecyclePayoutRow[]
  monthlyUserCost: number
  totalUserCost: number
  capitalAtRetirement: number
  grossMonthlyPayout: number
  netMonthlyPayout: number
  payoutEndAge?: number
  leibrenteBreakEvenAge?: number
  /**
   * Optional override for the per-series chart data-keys + cumulative-payout
   * map keys. Defaults to `productId`. Set this in combine-mode contexts
   * where the same `productId` (e.g. two ETF instances) would otherwise
   * collide on the shared dataKey namespace. The discriminant (`productId`)
   * still drives ETF-specific payout-row reads; only the dataKey namespace
   * is overridden.
   */
  seriesKey?: string
}

/**
 * Per-series dataKey lookup. Pass either a string (legacy: the productId)
 * or a `LifecycleSeriesResult` so the caller can opt into `seriesKey`
 * disambiguation without changing the call shape. When `seriesKey` is
 * present on the result, it wins; otherwise `productId` is the key.
 */
export function lifecycleLineKeys(
  resultOrId: string | Pick<LifecycleSeriesResult, 'productId' | 'seriesKey'>,
) {
  const key =
    typeof resultOrId === 'string'
      ? resultOrId
      : (resultOrId.seriesKey ?? resultOrId.productId)
  return {
    paidIn: `${key}__paidIn`,
    balance: `${key}__balance`,
    payout: `${key}__payout`,
  }
}

/**
 * Build per-age data for the lifecycle line chart.
 *
 * Three positive lines per product:
 * - Netto eingezahlt: cumulative net user cost paid into the product.
 * - Restkapital: contract/depot balance. It rises during accumulation and
 *   depletes during retirement at the gross payout rate.
 * - Netto ausgezahlt: cumulative net payouts received after tax and KV/PV.
 */
export function buildLifecycleLineSeries(
  results: LifecycleSeriesResult[],
  startAge: number,
  retirementAge: number,
  horizonAge: number,
): Record<string, number>[] {
  const series: Record<string, number>[] = []
  // Map keys are the per-series dataKey namespace (seriesKey ?? productId)
  // so combine-mode print can pass two instances of the same productId
  // without colliding on cumulative-payout accumulators.
  const seriesKeyOf = (r: LifecycleSeriesResult) => r.seriesKey ?? r.productId
  const cumGrossPayouts = new Map<string, number>(results.map((r) => [seriesKeyOf(r), 0]))
  const cumNetPayouts = new Map<string, number>(results.map((r) => [seriesKeyOf(r), 0]))

  for (let age = startAge; age <= horizonAge; age++) {
    const point: Record<string, number> = { age }
    for (const r of results) {
      const keys = lifecycleLineKeys(r)
      const accumulatorKey = seriesKeyOf(r)
      let balance: number
      let paidIn: number
      let cumNet: number

      if (age <= retirementAge) {
        // Accumulation: real depot/contract balance from rows.
        if (age === startAge) {
          balance = 0
        } else {
          const row = r.rows.find((row) => row.age === age)
          balance = row?.balance ?? r.capitalAtRetirement
        }
        const yearsElapsed = Math.max(0, age - startAge)
        paidIn = Math.min(r.totalUserCost, yearsElapsed * r.monthlyUserCost * 12)
        cumNet = 0
      } else {
        // Retirement: balance depletes at the gross rate (gross = what leaves
        // the contract); the payout line tracks the net the user actually
        // pockets after tax and KV/PV.
        const yearIndex = age - retirementAge - 1
        const annualGross = annualGrossPayoutAt(r, retirementAge, yearIndex)
        const annualNet = annualNetPayoutAt(r, retirementAge, yearIndex)
        const cumGross = (cumGrossPayouts.get(accumulatorKey) ?? 0) + annualGross
        cumGrossPayouts.set(accumulatorKey, cumGross)
        cumNet = (cumNetPayouts.get(accumulatorKey) ?? 0) + annualNet
        cumNetPayouts.set(accumulatorKey, cumNet)
        const lifecycleRow = r.lifecyclePayoutRows?.[yearIndex]
        if (lifecycleRow) {
          balance = Math.max(0, lifecycleRow.capitalAtEnd)
        } else if (r.productId === 'etf') {
          const row = r.etfPayoutRows?.[yearIndex]
          balance = row ? Math.max(0, row.capitalAtEnd) : 0
        } else {
          balance = Math.max(0, r.capitalAtRetirement - cumGross)
        }
        paidIn = r.totalUserCost
      }

      point[keys.paidIn] = Math.round(paidIn)
      point[keys.balance] = Math.round(balance)
      point[keys.payout] = Math.round(cumNet)
    }
    series.push(point)
  }
  return series
}

function annualNetPayoutAt(
  result: LifecycleSeriesResult,
  retirementAge: number,
  yearIndex: number,
): number {
  const lifecycleRow = result.lifecyclePayoutRows?.[yearIndex]
  if (lifecycleRow) return lifecycleRow.netAnnualPayout
  if (result.payoutEndAge !== undefined) {
    const ageAtYearStart = retirementAge + yearIndex
    if (ageAtYearStart >= result.payoutEndAge) return 0
  }
  if (result.productId === 'etf') {
    const row = result.etfPayoutRows?.[yearIndex]
    if (row) return row.netAnnualPayout
    return 0
  }
  return result.netMonthlyPayout * 12
}

function annualGrossPayoutAt(
  result: LifecycleSeriesResult,
  retirementAge: number,
  yearIndex: number,
): number {
  const lifecycleRow = result.lifecyclePayoutRows?.[yearIndex]
  if (lifecycleRow) return lifecycleRow.grossAnnualPayout
  if (result.payoutEndAge !== undefined) {
    const ageAtYearStart = retirementAge + yearIndex
    if (ageAtYearStart >= result.payoutEndAge) return 0
  }
  return result.grossMonthlyPayout * 12
}

/**
 * Pairwise crossover: the age at which a Leibrente product's cumulative net
 * payouts overtake a non-Leibrente (Kapitalverzehr / Zeitrente / certified)
 * product's cumulative net payouts. Surfaces the longevity trade-off — a
 * lifelong annuity pays less per month but eventually catches up once the
 * drawdown product depletes.
 */
export interface LeibrenteCrossover {
  leibrenteId: string
  drawDownId: string
  age: number
  amount: number
}

/** Search cap for crossover detection — covers German lifespans well beyond
 *  the typical chart horizon so the text callout still reports a meaningful
 *  crossover age when ETF is far ahead at depletion. */
export const LEIBRENTE_CROSSOVER_SEARCH_CAP = 120

/**
 * Detect crossovers between Leibrente (lifelong) and non-Leibrente (finite-
 * horizon) products. Returns the first age at which a Leibrente product's
 * cumulative net payout reaches or exceeds a non-Leibrente product's
 * cumulative net payout, given the Leibrente was strictly behind in the
 * preceding year (so the trivial age-0 tie at retirement is not reported).
 *
 * The search runs internally up to `searchCapAge` (default 120), independent
 * of the chart's visible horizon — so callers get a concrete crossover age
 * even when the longevity catch-up happens past the lifecycle chart's
 * horizon.
 */
export function findLeibrenteCrossovers(
  results: LifecycleSeriesResult[],
  startAge: number,
  retirementAge: number,
  searchCapAge: number = LEIBRENTE_CROSSOVER_SEARCH_CAP,
): LeibrenteCrossover[] {
  const leibrenteResults = results.filter(
    (r) => r.leibrenteBreakEvenAge !== undefined && r.payoutEndAge === undefined,
  )
  const drawDownResults = results.filter((r) => r.payoutEndAge !== undefined)
  if (leibrenteResults.length === 0 || drawDownResults.length === 0) return []

  const data = buildLifecycleLineSeries(results, startAge, retirementAge, searchCapAge)
  const out: LeibrenteCrossover[] = []
  for (const lb of leibrenteResults) {
    const lbKey = lifecycleLineKeys(lb).payout
    for (const dd of drawDownResults) {
      const ddKey = lifecycleLineKeys(dd).payout
      let prevDelta: number | null = null
      for (const point of data) {
        const lbVal = Number(point[lbKey] ?? 0)
        const ddVal = Number(point[ddKey] ?? 0)
        const delta = lbVal - ddVal
        if (prevDelta !== null && prevDelta < 0 && delta >= 0) {
          out.push({
            leibrenteId: lb.productId,
            drawDownId: dd.productId,
            age: Number(point.age),
            amount: lbVal,
          })
          break
        }
        prevDelta = delta
      }
    }
  }
  return out
}
