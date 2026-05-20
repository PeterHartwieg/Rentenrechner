import { useMemo } from 'react'

// ---------------------------------------------------------------------------
// Chart-density tokens — viewport-aware tuning for Recharts surfaces (PR 8).
//
// Recharts charts in the codebase (BreakEvenChart, FeeDragChart,
// MonteCarloPanel) all have to decide axis-label visibility, axis width,
// margins, and callout font sizes based on the chart's *rendered* width.
// Before this hook each chart hand-rolled the breakpoints (`isMobileChart =
// chartWidth <= 480` etc.) which drifted across files. PR 8 introduces this
// hook so every chart picks tokens from one source of truth.
//
// Width-based (not viewport-based): a chart in a 320 px aside on a desktop
// browser should render in "phone" density even though `useViewport()`
// returns 'desktop'. Callers pass the width Recharts reports through
// `<ResponsiveContainer onResize>`.
// ---------------------------------------------------------------------------

/**
 * Density tier — derived from the chart's measured width. Tiers map roughly
 * to the codebase's viewport breakpoints (640 / 1024) but the input is the
 * chart's own width, not the viewport, so narrow asides on desktop still
 * pick the phone density.
 */
export type ChartDensityTier = 'phone' | 'tablet' | 'desktop'

export interface ChartDensityTokens {
  /** Density classification. */
  tier: ChartDensityTier
  /** Whether the long axis labels ('Alter (Jahre)', 'EUR') render. */
  axisLabelsVisible: boolean
  /** Whether reference-line / reference-dot callout labels render. */
  calloutLabelsVisible: boolean
  /** YAxis width in px (controls left padding for tick numerals). */
  yAxisWidth: number
  /** Recharts `margin` prop. */
  margins: { top: number; right: number; bottom: number; left: number }
  /** Font-size for axis labels (when visible). */
  axisLabelFontSize: number
  /** Font-size for reference-line / reference-dot callouts. */
  calloutLabelFontSize: number
  /** Suggested font-size for tooltip body text. */
  tooltipFontSize: number
}

// Width thresholds — width <= phoneChartMaxPx → 'phone';
// width <= tabletChartMaxPx → 'tablet'; else 'desktop'.
// The phone threshold matches the pre-PR-8
// `isMobileChart = chartWidth <= 480` constant used by BreakEvenChart so
// adopting the hook there is a no-op at the boundary.
export const phoneChartMaxPx = 480
export const tabletChartMaxPx = 800

/**
 * Pure tier classifier — exposed so tests and prerender code can decide the
 * density without mounting React. `width` is treated as "unknown" when it
 * is undefined, zero, or non-finite (e.g. the very first paint before
 * `ResponsiveContainer` has measured); fall back to 'desktop' so the
 * prerendered HTML matches the most common viewport.
 */
export function classifyChartDensity(width: number | undefined): ChartDensityTier {
  if (width === undefined || !Number.isFinite(width) || width <= 0) return 'desktop'
  if (width <= phoneChartMaxPx) return 'phone'
  if (width <= tabletChartMaxPx) return 'tablet'
  return 'desktop'
}

/**
 * Pure token resolver — exposed so tests and non-React callers can pick
 * tokens without depending on a render context. The hook is a thin
 * `useMemo` wrapper over this function.
 */
export function resolveChartDensity(width: number | undefined): ChartDensityTokens {
  const tier = classifyChartDensity(width)
  switch (tier) {
    case 'phone':
      return {
        tier,
        axisLabelsVisible: false,
        calloutLabelsVisible: false,
        yAxisWidth: 48,
        margins: { top: 12, right: 12, bottom: 24, left: 4 },
        axisLabelFontSize: 11,
        calloutLabelFontSize: 10,
        tooltipFontSize: 11,
      }
    case 'tablet':
      return {
        tier,
        axisLabelsVisible: true,
        calloutLabelsVisible: true,
        yAxisWidth: 58,
        margins: { top: 14, right: 14, bottom: 40, left: 6 },
        axisLabelFontSize: 11,
        calloutLabelFontSize: 11,
        tooltipFontSize: 12,
      }
    case 'desktop':
      return {
        tier,
        axisLabelsVisible: true,
        calloutLabelsVisible: true,
        yAxisWidth: 68,
        margins: { top: 16, right: 16, bottom: 56, left: 8 },
        axisLabelFontSize: 12,
        calloutLabelFontSize: 11,
        tooltipFontSize: 12,
      }
    default: {
      const _exhaustive: never = tier
      return _exhaustive
    }
  }
}

/**
 * Resolve density tokens for a chart of the given pixel width. Memoised on
 * the raw width so the dependency-correctness checker stays happy; consumers
 * read tokens by value (never by identity) so a fresh object per width
 * change is harmless.
 */
export function useChartDensity(width: number | undefined): ChartDensityTokens {
  return useMemo(() => resolveChartDensity(width), [width])
}
