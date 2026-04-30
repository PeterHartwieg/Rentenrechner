import type { ProductResult } from '../../domain'
import type { BavFundingResult } from '../../domain/products/bav'
import type { PostHintFactor } from './GuidedSetup'

export interface DeriveFactorsInput {
  results: ProductResult[]
  bavFunding: BavFundingResult
}

/**
 * Decide which "Warum mehr als ein Taschenrechner?" factors are actually visible
 * in the user's current scenario. Empty factors should be hidden so the hint stays
 * concrete instead of generic.
 */
export function derivePostHintFactors({ results, bavFunding }: DeriveFactorsInput): PostHintFactor[] {
  const factors: PostHintFactor[] = []

  if (bavFunding.monthlyEmployerContribution > 0) {
    factors.push({
      id: 'employer_subsidy',
      label: 'Arbeitgeber-Zuschuss',
      detail: `${bavFunding.monthlyEmployerContribution.toFixed(0)} EUR/Monat fließen zusätzlich in deine bAV — das verschiebt das Ergebnis spürbar.`,
    })
  }

  factors.push({
    id: 'income_tax',
    label: 'Steuern',
    detail:
      'Lohnsteuer in der Anspar­phase, Renten­besteuerung in der Auszahlungs­phase, Abgeltung­steuer auf ETF-Gewinne — drei verschiedene Wege, drei Ergebnisse.',
  })

  if (results.some((r) => r.productId === 'bav' || r.productId === 'versicherung' || r.productId === 'basisrente')) {
    factors.push({
      id: 'kvpv',
      label: 'KV/PV in der Rente',
      detail:
        'bAV-Renten und Basisrenten sind kranken- und pflegeversicherungs­pflichtig — bis zu 19 % der Brutto­rente, je nach KVdR/freiwillig.',
    })
  }

  const expensiveProduct = results.find((r) => r.accumulationRiy > 0.01)
  if (expensiveProduct) {
    factors.push({
      id: 'fees',
      label: 'Vertragskosten',
      detail: `„${expensiveProduct.label}" hat ${(expensiveProduct.accumulationRiy * 100).toFixed(2)} % p. a. Effektiv­kosten — über 30+ Jahre Laufzeit zehrt das deutlich am Endkapital.`,
    })
  }

  if (results.some((r) => r.leibrenteBreakEvenAge !== undefined)) {
    factors.push({
      id: 'payout_form',
      label: 'Auszahlungsform',
      detail:
        'Lebenslange Rente vs. Kapital­auszahlung vs. Zeitrente — bei gleichem Endkapital kommt unterschiedlich viel netto im Monat an.',
    })
  }

  if (results.some((r) => r.productId === 'etf')) {
    factors.push({
      id: 'vorabpauschale',
      label: 'ETF-Vorabpauschale',
      detail:
        'Auch ohne Verkauf zahlst du bei thesaurierenden ETFs jährlich Vorab­pauschale — und beim Auszahlen wird das gegen­gerechnet.',
    })
  }

  return factors
}
