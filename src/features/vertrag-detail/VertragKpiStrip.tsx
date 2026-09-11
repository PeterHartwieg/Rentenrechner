import { useMemo } from 'react'
import type { InstanceCommon } from '../../domain/instances'
import type { ProductId } from '../../domain/products/common'
import type { ProductResult } from '../../domain/results'
import { formatCurrency } from '../../utils/format'

interface Props {
  instance: InstanceCommon
  productId: ProductId
  /** Per-instance simulation result for the selected scenario; undefined when no result exists yet. */
  instanceResult: ProductResult | undefined
  /** Retirement age from `workspace.baseline.profile.retirementAge`. */
  retirementAge: number
  /** Current age from `workspace.baseline.profile.age`. */
  currentAge: number
  /**
   * Multiply a nominal retirement-year figure by this to get heutige Euro.
   * The plan's shared deflator (`realDeflator` in `planSummary.ts`); `1`
   * or undefined means no inflation assumption, so no second figure is shown.
   */
  deflator?: number
  /**
   * This contract's back-allocated share of the household net income
   * (`CombinedResult.byInstance[id].monthlyNet`), i.e. the number the plan
   * overview shows for this row. Differs from the tile, which taxes the
   * contract on its own.
   */
  inPlanMonthlyNet?: number
}

/**
 * VertragKpiStrip — § 1 of Vertrag-Detail.
 *
 * Four KPI tiles in a row: Beitrag pro Monat, Einzahlungen, Kapital mit
 * Renteneintritt, Netto-Rente. The accumulation tiles are sourced from the
 * instance's contribution field (slot-specific) and from the simulation
 * `ProductResult`. Phone breakpoint collapses to 2×2; CSS handles the
 * responsive grid via `vertrag-kpi-strip` modifiers.
 *
 * Every money tile names its unit (nominal, Euro of the retirement year)
 * and its scope (this contract alone). The line under the strip bridges to
 * the plan overview, which shows this contract taxed together with all
 * other income and, by default, in heutige Euro. Both figures are engine
 * outputs; the deflator is the plan's shared one, so nothing is re-derived.
 */
export function VertragKpiStrip({
  instance,
  productId,
  instanceResult,
  retirementAge,
  currentAge,
  deflator,
  inPlanMonthlyNet,
}: Props) {
  const monthlyContribution = useMemo(
    () => extractMonthlyContribution(instance, productId),
    [instance, productId],
  )

  const yearsContributing = Math.max(0, retirementAge - currentAge)
  // Einzahlungen estimate: monthly × 12 × years. Pulled from
  // `result.totalUserCost` when available (engine-accurate, accounts for
  // beitragsfrei / contribution growth); falls back to the naive product
  // only when the simulation result is unavailable (degraded test path).
  const totalContributions = instanceResult?.totalUserCost
    ?? monthlyContribution * 12 * yearsContributing

  const capitalAtRetirement = instanceResult?.capitalAtRetirement ?? 0
  const netMonthlyPayout = instanceResult?.netMonthlyPayout ?? 0
  const hasDeflator = typeof deflator === 'number' && Number.isFinite(deflator) && deflator > 0 && deflator < 1
  const hasInPlan = typeof inPlanMonthlyNet === 'number' && Number.isFinite(inPlanMonthlyNet)

  const tiles: ReadonlyArray<{ label: string; value: string; sublabel: string; accent: 'ink' | 'capital' | 'rente' }> = [
    {
      label: 'Beitrag pro Monat',
      value: monthlyContribution === 0 ? 'beitragsfrei' : `${formatCurrency(monthlyContribution, 0)}`,
      sublabel: monthlyContribution === 0 ? 'derzeit keine Einzahlungen' : 'heute',
      accent: 'ink',
    },
    {
      label: 'Einzahlungen',
      value: `${formatCurrency(totalContributions, 0)}`,
      sublabel: `über ${yearsContributing} ${yearsContributing === 1 ? 'Jahr' : 'Jahre'} · Summe der Beiträge`,
      accent: 'ink',
    },
    {
      label: 'Voraussichtl. Kapital',
      value: `${formatCurrency(capitalAtRetirement, 0)}`,
      sublabel: `mit ${retirementAge} · nominal`,
      accent: 'capital',
    },
    {
      label: 'Netto-Rente',
      value: `${formatCurrency(netMonthlyPayout, 0)}`,
      sublabel: 'pro Monat · nominal · nur dieser Vertrag',
      accent: 'rente',
    },
  ]

  return (
    <>
      <section className="vertrag-kpi-strip" aria-label="Kennzahlen des Vertrags">
        {tiles.map((tile, idx) => (
          <div key={tile.label} className={`vertrag-kpi-tile vertrag-kpi-tile--${tile.accent}`} data-idx={idx}>
            <div className="vertrag-kpi-label">{tile.label}</div>
            <div className={`vertrag-kpi-value vertrag-kpi-value--${tile.accent}`}>{tile.value}</div>
            <div className="vertrag-kpi-sublabel">{tile.sublabel}</div>
          </div>
        ))}
      </section>
      <p className="vertrag-kpi-scope" data-testid="vertrag-kpi-scope">
        Beträge in Euro des Rentenbeginns (nominal), dieser Vertrag für sich allein versteuert.
        {hasInPlan && (
          <>
            {' '}In deinem Plan, gemeinsam mit allen Einkünften versteuert, trägt er{' '}
            <strong>{formatCurrency(inPlanMonthlyNet, 0)}</strong> pro Monat bei
            {hasDeflator && (
              <>
                , das sind etwa <strong>{formatCurrency(inPlanMonthlyNet * deflator, 0)}</strong> in heutigen Euro
              </>
            )}
            . Die Planübersicht zeigt diesen Wert.
          </>
        )}
      </p>
    </>
  )
}

/**
 * Read the per-product "Beitrag heute" field. Exhaustive switch over the
 * six `ProductId` values — `never` default catches any future addition at
 * compile time. Paid-up contracts return 0 verbatim regardless of the
 * stored contribution value (the engine ignores it; the UI should too).
 */
function extractMonthlyContribution(
  instance: InstanceCommon,
  productId: ProductId,
): number {
  if (instance.status === 'paid_up') return 0
  switch (productId) {
    case 'etf':
    case 'versicherung':
      return (instance as { monthlyContribution?: number }).monthlyContribution ?? 0
    case 'bav':
      return (instance as { monthlyGrossConversion?: number }).monthlyGrossConversion ?? 0
    case 'basisrente':
      return (instance as { monthlyGrossContribution?: number }).monthlyGrossContribution ?? 0
    case 'altersvorsorgedepot':
    case 'riester':
      return (instance as { monthlyOwnContribution?: number }).monthlyOwnContribution ?? 0
    default: {
      const _exhaustive: never = productId
      void _exhaustive
      return 0
    }
  }
}
