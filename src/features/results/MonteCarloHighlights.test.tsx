import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  MonteCarloPercentiles,
  MonteCarloResult,
  ProductMonteCarloSummary,
} from '../../engine/monteCarlo'
import { MonteCarloHighlights } from './MonteCarloHighlights'

function p(value: number): MonteCarloPercentiles {
  return {
    p5: value * 0.9,
    p10: value,
    p25: value * 1.05,
    p50: value * 1.2,
    p75: value * 1.35,
    p90: value * 1.5,
    p95: value * 1.6,
  }
}

function summary(
  overrides: Partial<ProductMonteCarloSummary> & Pick<ProductMonteCarloSummary, 'productId' | 'shortLabel'>,
): ProductMonteCarloSummary {
  const { productId, shortLabel, ...rest } = overrides
  return {
    productId,
    label: shortLabel,
    shortLabel,
    color: '#2563eb',
    runs: 1000,
    capital: p(100_000),
    netMonthlyPayout: p(800),
    expectedCapital: 120_000,
    expectedNetMonthlyPayout: 950,
    bestCapitalProbability: 0.4,
    bestPensionProbability: 0.4,
    belowUserCostProbability: 0.2,
    targetNetPensionProbability: null,
    guaranteeFloor: null,
    guaranteeDisplay: null,
    guaranteeAppliedProbability: null,
    ...rest,
  }
}

function result(summaries: ProductMonteCarloSummary[]): MonteCarloResult {
  return {
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    annualReturn: 0.05,
    annualVolatility: 0.15,
    runs: 1000,
    seed: 123,
    marketAnnualReturn: p(0.04),
    summaries,
    yearlyBands: [],
  }
}

function renderText(input: MonteCarloResult): string {
  return renderToStaticMarkup(<MonteCarloHighlights result={input} />)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('MonteCarloHighlights', () => {
  it('uses consumer-facing simulation and monthly net pension labels without P10 jargon', () => {
    const text = renderText(
      result([
        summary({ productId: 'etf', shortLabel: 'ETF', netMonthlyPayout: p(700) }),
        summary({ productId: 'bav', shortLabel: 'bAV', netMonthlyPayout: p(900) }),
      ]),
    )
    expect(text).toContain('1.000 Simulationen')
    expect(text).not.toContain('1.000 Pfade')
    expect(text).toContain('Hoechste mittlere Netto-Rente')
    expect(text).toContain('90 % der Simulationen lagen ueber')
    expect(text).not.toMatch(/\bP10\b|\bP50\b|\bP90\b/)
    expect(text).not.toContain('Staerkstes P10-Kapital')
  })

  it('shows one guarantee line matching the payout mode display', () => {
    const annuityGuarantee = summary({
      productId: 'versicherung',
      shortLabel: 'Private Rente',
      guaranteeFloor: p(90_000),
      guaranteeDisplay: {
        kind: 'monthlyPension',
        values: p(260),
      },
      guaranteeAppliedProbability: 0.3,
    })
    const capitalGuarantee = summary({
      productId: 'altersvorsorgedepot',
      shortLabel: 'AV-Depot',
      guaranteeFloor: p(80_000),
      guaranteeDisplay: {
        kind: 'capital',
        values: p(80_000),
      },
      guaranteeAppliedProbability: 0.1,
    })

    const text = renderText(result([annuityGuarantee, capitalGuarantee]))
    expect(text).toContain('Garantierte Rente: mind.')
    expect(text).toContain('/ Monat')
    expect(text).toContain('Garantie: mind.')
    expect(text).toContain('Kapital zum Rentenbeginn')
  })
})
