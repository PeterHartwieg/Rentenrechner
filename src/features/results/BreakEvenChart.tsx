import '../../ui/charts.css'
import './BreakEvenChart.css'
import { Fragment, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts/types/component/Tooltip'
import { Hourglass } from 'lucide-react'
import { getProductMeta } from '../../app/productPresentation'
import { formatCurrency, formatNumber } from '../../utils/format'
import {
  buildLifecycleLineSeries,
  findLeibrenteCrossovers,
  type LifecycleSeriesResult,
  lifecycleLineKeys,
} from './breakEvenSeries'
import { LIFECYCLE_HORIZON_AGE } from './lifecycleHorizon'
import { lifecyclePickerLabel } from './lifecycleLabels'
import { qaTargetAttrs, useFeedbackTarget } from '../qa-feedback/useFeedbackTarget'
import { useQaMode } from '../qa-feedback/useQaMode'
import type { PensionBaselineType } from '../../domain'

const GRV_PAYOUT_KEY = 'grv__cumNetPayout'
const GRV_COLOR = '#94a3b8'

const BASELINE_PENSION_LABELS: Record<Exclude<PensionBaselineType, 'none'>, {
  legend: string
  tooltipName: string
  tooltipGroup: string
}> = {
  grv: {
    legend: 'GRV Netto-Auszahlung kumuliert',
    tooltipName: 'GRV Netto-Auszahlung kumuliert',
    tooltipGroup: 'Gesetzliche Rente',
  },
  versorgungswerk: {
    legend: 'Versorgungswerk Netto-Auszahlung kumuliert',
    tooltipName: 'Versorgungswerk Netto-Auszahlung kumuliert',
    tooltipGroup: 'Versorgungswerk',
  },
  beamtenpension: {
    legend: 'Beamtenpension Netto-Auszahlung kumuliert',
    tooltipName: 'Beamtenpension Netto-Auszahlung kumuliert',
    tooltipGroup: 'Beamtenpension',
  },
}

function baselineLabels(type: PensionBaselineType | undefined) {
  if (!type || type === 'none') return BASELINE_PENSION_LABELS.grv
  return BASELINE_PENSION_LABELS[type]
}

interface Props {
  selectedResults: LifecycleSeriesResult[]
  productColors: Record<string, string>
  startAge: number
  retirementAge: number
  retirementEndAge: number
  bestProductId?: string
  singleSelection?: boolean
  title?: string
  description?: string
  grvNetMonthlyPension?: number
  /**
   * Which mandatory pension system the cumulative-payout series represents.
   * Drives the legend / tooltip labels so the line is not mislabeled as
   * "GRV" for Beamtenpension or Versorgungswerk users. Defaults to 'grv'
   * for backwards-compatible callers.
   */
  pensionBaselineType?: PensionBaselineType
}

const PAID_IN_COLOR = '#64748b'

export function BreakEvenChart({
  selectedResults,
  productColors,
  startAge,
  retirementAge,
  retirementEndAge,
  bestProductId,
  singleSelection = false,
  title = 'Kapital und Auszahlungen im Alter',
  description = 'Vergleicht Netto-Einzahlungen, Restkapital und kumulierte Netto-Auszahlungen über Anspar- und Rentenphase.',
  grvNetMonthlyPension,
  pensionBaselineType,
}: Props) {
  const baselineLabel = baselineLabels(pensionBaselineType)
  // Default chart picker to the best product (or the first available).
  const defaultProductId = useMemo<string | undefined>(() => {
    if (bestProductId && selectedResults.some((r) => r.productId === bestProductId)) {
      return bestProductId
    }
    return selectedResults[0]?.productId
  }, [bestProductId, selectedResults])

  const [pickedIds, setPickedIds] = useState<Set<string>>(
    () => new Set(defaultProductId ? [defaultProductId] : []),
  )

  // If the visible-products list shrinks, drop any picked id that no longer exists,
  // and ensure at least one is picked when the user has products available.
  const availableIds = useMemo(
    () => new Set(selectedResults.map((r) => r.productId)),
    [selectedResults],
  )
  const effectivePicked = useMemo(() => {
    const next = new Set<string>()
    pickedIds.forEach((id) => {
      if (availableIds.has(id)) next.add(id)
    })
    if (next.size === 0 && defaultProductId) next.add(defaultProductId)
    return next
  }, [pickedIds, availableIds, defaultProductId])

  const horizonAge = Math.max(LIFECYCLE_HORIZON_AGE, retirementEndAge)
  const baseData = useMemo(
    () => buildLifecycleLineSeries(selectedResults, startAge, retirementAge, horizonAge),
    [selectedResults, startAge, retirementAge, horizonAge],
  )

  const showGrv = typeof grvNetMonthlyPension === 'number' && grvNetMonthlyPension > 0

  const data = useMemo((): Record<string, number>[] => {
    if (!showGrv || !grvNetMonthlyPension) return baseData
    const annualGrv = grvNetMonthlyPension * 12
    let cumGrv = 0
    return baseData.map((point) => {
      if (point.age <= retirementAge) {
        // undefined signals Recharts to leave a gap in the GRV line before
        // retirement. The explicit cast keeps the return type homogeneous.
        return { ...point, [GRV_PAYOUT_KEY]: undefined } as unknown as Record<string, number>
      }
      cumGrv += annualGrv
      return { ...point, [GRV_PAYOUT_KEY]: Math.round(cumGrv) }
    })
  }, [baseData, showGrv, grvNetMonthlyPension, retirementAge])

  const { targetProps: containerTargetProps } = useFeedbackTarget({
    id: 'results.breakEvenChart.container',
    label: 'Break-Even-Chart',
    precision: 'section',
  })
  const { targetProps: legendTargetProps } = useFeedbackTarget({
    id: 'results.breakEvenChart.legend',
    label: 'Break-Even-Chart Legende',
    precision: 'section',
  })
  const { enabled: qaEnabled } = useQaMode()

  if (selectedResults.length === 0) return null

  const renderedProducts = selectedResults.filter((r) => effectivePicked.has(r.productId))
  const paidInKey = renderedProducts[0] ? lifecycleLineKeys(renderedProducts[0].productId).paidIn : undefined
  const breakEvenPoints = paidInKey
    ? breakEvenMarkers(data, renderedProducts, paidInKey, productColors)
    : []
  const leibrenteCrossovers = findLeibrenteCrossovers(
    renderedProducts,
    startAge,
    retirementAge,
  )
  const inFrameCrossovers = leibrenteCrossovers.filter((c) => c.age <= horizonAge)
  const strokeOpacity = renderedProducts.length === 1 ? 1 : 0.82

  function togglePicked(id: string) {
    setPickedIds((prev) => {
      if (singleSelection) return new Set([id])
      const next = new Set(prev)
      // Drop stale ids first.
      Array.from(next).forEach((existing) => {
        if (!availableIds.has(existing)) next.delete(existing)
      })
      if (next.has(id)) {
        if (next.size > 1) next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <section
      className="chart-panel"
      {...containerTargetProps}
    >
      <div className="section-heading">
        <Hourglass size={18} aria-hidden="true" />
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div className="lifecycle-picker">
        {selectedResults.map((r) => {
          const isActive = effectivePicked.has(r.productId)
          const color = productColors[r.productId]
          return (
            <button
              key={r.productId}
              type="button"
              className={`lifecycle-chip ${isActive ? 'lifecycle-chip--active' : ''}`}
              onClick={() => togglePicked(r.productId)}
              style={{
                borderColor: color,
                background: isActive ? color : 'transparent',
                color: isActive ? '#ffffff' : color,
              }}
              aria-pressed={isActive}
              {...qaTargetAttrs(qaEnabled, {
                id: `results.breakEvenChart.picker.${r.productId}`,
                label: lifecyclePickerLabel(r),
                precision: 'exact',
              })}
            >
              {lifecyclePickerLabel(r)}
            </button>
          )
        })}
      </div>

      <div className="chart-frame break-even-frame">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 16, left: 8, bottom: 56 }}>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis
              dataKey="age"
              tickLine={false}
              label={{
                value: 'Alter (Jahre)',
                position: 'insideBottom',
                offset: -8,
                fill: '#475569',
                fontSize: 12,
              }}
            />
            <YAxis
              tickFormatter={(value) => `${formatNumber(Number(value) / 1_000)}k`}
              width={68}
              label={{
                value: 'EUR',
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: '#475569' },
                fontSize: 12,
              }}
            />
            <Tooltip
              content={(props) => (
                <BreakEvenTooltip
                  {...props}
                  renderedProducts={renderedProducts}
                  productColors={productColors}
                  paidInKey={paidInKey}
                  retirementAge={retirementAge}
                  showGrv={showGrv}
                  baselineLabel={baselineLabel}
                />
              )}
            />
            <ReferenceLine
              x={retirementAge}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              label={{ value: `Renteneintritt ${retirementAge}`, position: 'insideTop', fill: '#64748b', fontSize: 11 }}
            />
            <ReferenceLine x={retirementEndAge} stroke="#cbd5e1" strokeDasharray="3 3" />
            {paidInKey && (
              <Line
                type="monotone"
                name="Netto eingezahlt"
                dataKey={paidInKey}
                stroke={PAID_IN_COLOR}
                strokeWidth={2}
                strokeDasharray="2 5"
                dot={false}
                activeDot={false}
              />
            )}
            {renderedProducts.map((r) => {
              const keys = lifecycleLineKeys(r.productId)
              const baseColor = productColors[r.productId]
              const meta = getProductMeta(r.productId)
              const shortLabel = meta?.shortLabel ?? r.label
              return (
                <Fragment key={r.productId}>
                  <Line
                    type="monotone"
                    name={`${shortLabel} - Restkapital`}
                    dataKey={keys.balance}
                    stroke={baseColor}
                    strokeWidth={2.5}
                    strokeOpacity={strokeOpacity}
                    dot={false}
                    activeDot={false}
                  />
                  <Line
                    type="monotone"
                    name={`${shortLabel} - Netto ausgezahlt`}
                    dataKey={keys.payout}
                    stroke={baseColor}
                    strokeWidth={2}
                    strokeOpacity={strokeOpacity}
                    strokeDasharray="6 5"
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </Fragment>
              )
            })}
            {showGrv && (
              <Line
                type="monotone"
                name={baselineLabel.legend}
                dataKey={GRV_PAYOUT_KEY}
                stroke={GRV_COLOR}
                strokeWidth={1.5}
                strokeDasharray="8 4 2 4"
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls={false}
              />
            )}
            {breakEvenPoints.map((point) => (
              <ReferenceDot
                key={point.productId}
                x={point.age}
                y={point.value}
                r={5}
                fill={point.color}
                stroke="#ffffff"
                strokeWidth={2}
                label={{
                  value: `${point.label} ${point.age}`,
                  position: 'top',
                  fill: point.color,
                  fontSize: 11,
                  fontWeight: 700,
                  style: {
                    paintOrder: 'stroke',
                    stroke: '#ffffff',
                    strokeWidth: 4,
                    strokeLinejoin: 'round',
                    textShadow: '0 1px 3px rgba(15, 23, 42, 0.28)',
                  },
                }}
              />
            ))}
            {inFrameCrossovers.map((cross) => {
              const drawDownLabel =
                getProductMeta(cross.drawDownId)?.shortLabel ?? cross.drawDownId
              const color = productColors[cross.leibrenteId]
              return (
                <ReferenceDot
                  key={`crossover-${cross.leibrenteId}-${cross.drawDownId}`}
                  x={cross.age}
                  y={cross.amount}
                  r={5}
                  fill="#ffffff"
                  stroke={color}
                  strokeWidth={2.5}
                  label={{
                    value: `holt ${drawDownLabel} ein · ${cross.age}`,
                    position: 'bottom',
                    fill: color,
                    fontSize: 11,
                    fontWeight: 700,
                    style: {
                      paintOrder: 'stroke',
                      stroke: '#ffffff',
                      strokeWidth: 4,
                      strokeLinejoin: 'round',
                      textShadow: '0 1px 3px rgba(15, 23, 42, 0.28)',
                    },
                  }}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
        <div className="lifecycle-legend lifecycle-legend--overlay" aria-hidden="true" {...legendTargetProps}>
          <span
            className="lifecycle-legend__item"
            {...qaTargetAttrs(qaEnabled, { id: 'results.breakEvenChart.legend.nettoEingezahlt', label: 'Netto eingezahlt', precision: 'exact' })}
          >
            <span className="lifecycle-legend__line lifecycle-legend__line--dotted" />
            Netto eingezahlt
          </span>
          <span
            className="lifecycle-legend__item"
            {...qaTargetAttrs(qaEnabled, { id: 'results.breakEvenChart.legend.restkapital', label: 'Restkapital', precision: 'exact' })}
          >
            <span className="lifecycle-legend__line lifecycle-legend__line--solid" />
            Restkapital
          </span>
          <span
            className="lifecycle-legend__item"
            {...qaTargetAttrs(qaEnabled, { id: 'results.breakEvenChart.legend.nettoAusgezahlt', label: 'Netto ausgezahlt', precision: 'exact' })}
          >
            <span className="lifecycle-legend__line lifecycle-legend__line--dashed" />
            Netto ausgezahlt
          </span>
          {showGrv && (
            <span className="lifecycle-legend__item">
              <span
                className="lifecycle-legend__line"
                style={{ borderTopStyle: 'dashed', borderTopColor: GRV_COLOR }}
              />
              {baselineLabel.legend}
            </span>
          )}
          <span
            className="lifecycle-legend__item"
            {...qaTargetAttrs(qaEnabled, { id: 'results.breakEvenChart.legend.breakEven', label: 'Break-even', precision: 'exact' })}
          >
            <span className="lifecycle-legend__dot" />
            Break-even
          </span>
          <span
            className="lifecycle-legend__item"
            {...qaTargetAttrs(qaEnabled, { id: 'results.breakEvenChart.legend.leibrenteCrossover', label: 'Leibrente überholt Kapitalverzehr', precision: 'exact' })}
          >
            <span className="lifecycle-legend__dot lifecycle-legend__dot--ring" />
            Leibrente überholt Kapitalverzehr
          </span>
        </div>
      </div>
      {leibrenteCrossovers.length > 0 && (
        <ul className="lifecycle-crossovers" aria-label="Leibrente überholt Kapitalverzehr">
          {leibrenteCrossovers.map((cross) => {
            const lbLabel = getProductMeta(cross.leibrenteId)?.shortLabel ?? cross.leibrenteId
            const ddLabel = getProductMeta(cross.drawDownId)?.shortLabel ?? cross.drawDownId
            return (
              <li
                key={`xover-${cross.leibrenteId}-${cross.drawDownId}`}
                style={{ borderLeftColor: productColors[cross.leibrenteId] }}
              >
                <strong>{lbLabel}</strong> holt <strong>{ddLabel}</strong> bei Alter{' '}
                <strong>{cross.age}</strong> ein
                {cross.age > horizonAge && (
                  <span className="lifecycle-crossovers__note"> (außerhalb der Grafik)</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

interface BreakEvenTooltipProps extends TooltipContentProps {
  renderedProducts: LifecycleSeriesResult[]
  productColors: Record<string, string>
  paidInKey?: string
  retirementAge: number
  showGrv?: boolean
  baselineLabel: { legend: string; tooltipName: string; tooltipGroup: string }
}

function BreakEvenTooltip({
  active,
  payload,
  label,
  renderedProducts,
  productColors,
  paidInKey,
  retirementAge,
  showGrv,
  baselineLabel,
}: BreakEvenTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const valuesByKey = new Map(payload.map((item) => [String(item.dataKey), Number(item.value ?? 0)]))
  const paidIn = paidInKey ? valuesByKey.get(paidInKey) ?? 0 : 0
  const grvCumPayout = valuesByKey.get(GRV_PAYOUT_KEY)
  const showGrvRow = showGrv && Number(label) > retirementAge && grvCumPayout !== undefined

  return (
    <div className="break-even-tooltip">
      <div className="break-even-tooltip__label">Alter {label}</div>
      <div className="break-even-tooltip__row break-even-tooltip__benchmark">
        <span className="break-even-tooltip__name">Netto eingezahlt</span>
        <span className="break-even-tooltip__value">{formatCurrency(paidIn, 0)}</span>
      </div>
      <div className="break-even-tooltip__rows">
        {renderedProducts.map((result) => {
          const meta = getProductMeta(result.productId)
          const keys = lifecycleLineKeys(result.productId)
          const balance = valuesByKey.get(keys.balance) ?? 0
          const payout = valuesByKey.get(keys.payout) ?? 0
          const isModeledContractValue = Number(label) > retirementAge && result.productId !== 'etf'
          return (
            <div key={result.productId} className="break-even-tooltip__group">
              <div
                className="break-even-tooltip__product"
                style={{ color: productColors[result.productId] }}
              >
                {meta?.shortLabel ?? result.label}
              </div>
              <div className="break-even-tooltip__row">
                <span className="break-even-tooltip__name">
                  {isModeledContractValue ? 'Restkapital (Modellwert)' : 'Restkapital'}
                </span>
                <span className="break-even-tooltip__value">{formatCurrency(balance, 0)}</span>
              </div>
              <div className="break-even-tooltip__row">
                <span className="break-even-tooltip__name">Netto ausgezahlt</span>
                <span className="break-even-tooltip__value">{formatCurrency(payout, 0)}</span>
              </div>
            </div>
          )
        })}
        {showGrvRow && (
          <div className="break-even-tooltip__group">
            <div className="break-even-tooltip__product" style={{ color: GRV_COLOR }}>
              {baselineLabel.tooltipGroup}
            </div>
            <div className="break-even-tooltip__row">
              <span className="break-even-tooltip__name">{baselineLabel.tooltipName}</span>
              <span className="break-even-tooltip__value">{formatCurrency(grvCumPayout ?? 0, 0)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface BreakEvenMarker {
  productId: string
  age: number
  value: number
  color: string
  label: string
}

function breakEvenMarkers(
  data: Record<string, number>[],
  products: LifecycleSeriesResult[],
  paidInKey: string,
  productColors: Record<string, string>,
): BreakEvenMarker[] {
  return products.flatMap((result) => {
    const payoutKey = lifecycleLineKeys(result.productId).payout
    const point = data.find((row) => {
      const paidIn = Number(row[paidInKey] ?? 0)
      const payout = Number(row[payoutKey] ?? 0)
      return paidIn > 0 && payout >= paidIn
    })
    if (!point) return []
    return [{
      productId: result.productId,
      age: Number(point.age),
      value: Number(point[paidInKey] ?? 0),
      color: productColors[result.productId],
      label: getProductMeta(result.productId)?.shortLabel ?? result.label,
    }]
  })
}
