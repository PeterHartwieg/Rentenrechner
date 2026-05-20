import { describe, expect, it } from 'vitest'
import {
  classifyChartDensity,
  resolveChartDensity,
  phoneChartMaxPx,
  tabletChartMaxPx,
} from './useChartDensity'

describe('classifyChartDensity', () => {
  it('returns "desktop" when width is missing or non-finite (prerender / first paint)', () => {
    // Prerender ships HTML before ResponsiveContainer has measured the chart;
    // defaulting to 'desktop' minimises hydration shift for the median user.
    expect(classifyChartDensity(undefined)).toBe('desktop')
    expect(classifyChartDensity(0)).toBe('desktop')
    expect(classifyChartDensity(-50)).toBe('desktop')
    expect(classifyChartDensity(Number.NaN)).toBe('desktop')
    expect(classifyChartDensity(Number.POSITIVE_INFINITY)).toBe('desktop')
  })

  it('classifies phone widths', () => {
    expect(classifyChartDensity(320)).toBe('phone')
    expect(classifyChartDensity(phoneChartMaxPx)).toBe('phone')
  })

  it('classifies tablet widths (between phone and tablet thresholds)', () => {
    expect(classifyChartDensity(phoneChartMaxPx + 1)).toBe('tablet')
    expect(classifyChartDensity(600)).toBe('tablet')
    expect(classifyChartDensity(tabletChartMaxPx)).toBe('tablet')
  })

  it('classifies desktop widths', () => {
    expect(classifyChartDensity(tabletChartMaxPx + 1)).toBe('desktop')
    expect(classifyChartDensity(1200)).toBe('desktop')
  })
})

describe('resolveChartDensity', () => {
  it('hides axis + callout labels at phone density', () => {
    const tokens = resolveChartDensity(320)
    expect(tokens.tier).toBe('phone')
    expect(tokens.axisLabelsVisible).toBe(false)
    expect(tokens.calloutLabelsVisible).toBe(false)
  })

  it('shows axis + callout labels at tablet and desktop density', () => {
    expect(resolveChartDensity(700).axisLabelsVisible).toBe(true)
    expect(resolveChartDensity(700).calloutLabelsVisible).toBe(true)
    expect(resolveChartDensity(1200).axisLabelsVisible).toBe(true)
    expect(resolveChartDensity(1200).calloutLabelsVisible).toBe(true)
  })

  it('scales yAxisWidth upward across tiers (room for tick numerals)', () => {
    const phone = resolveChartDensity(320).yAxisWidth
    const tablet = resolveChartDensity(700).yAxisWidth
    const desktop = resolveChartDensity(1200).yAxisWidth
    expect(phone).toBeLessThan(tablet)
    expect(tablet).toBeLessThan(desktop)
  })

  it('increases bottom margin for tablet / desktop axis labels', () => {
    // Phone hides axis labels so it doesn't need the bottom-margin budget
    // tablet / desktop reserve for the rotated `Alter (Jahre)` text.
    expect(resolveChartDensity(320).margins.bottom).toBeLessThan(
      resolveChartDensity(1200).margins.bottom,
    )
  })

  it('matches the pre-PR-8 BreakEvenChart constants at the phone boundary', () => {
    // The hook MUST be a no-op at the boundary where BreakEvenChart's
    // hand-rolled `isMobileChart = chartWidth <= 480` flipped, so adopting
    // the hook does not change rendered output on existing tests.
    const tokens = resolveChartDensity(phoneChartMaxPx)
    expect(tokens.yAxisWidth).toBe(48)
    expect(tokens.margins.bottom).toBe(24)
    expect(tokens.axisLabelsVisible).toBe(false)
  })
})
