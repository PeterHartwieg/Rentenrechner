import type { ProductId, ProductResult } from '../../domain'

export type ProductReasonKind =
  | 'employer_subsidy'
  | 'low_fees'
  | 'high_fees'
  | 'tax_deferral'
  | 'locked_capital'
  | 'flexible_capital'
  | 'subsidies'
  | 'guarantee'

export interface ProductReason {
  productId: ProductId
  label: string
  kind: ProductReasonKind
  text: string
}

export interface CostDriver {
  productId: ProductId
  label: string
  /** Decimal fraction (0.012 = 1.2 % p. a.). */
  riyDecimal: number
}

export type SensitivityKind =
  | 'rankings_disagree'
  | 'narrow_capital_gap'
  | 'high_fee_winner'
  | 'default'

export interface SensitivityHint {
  kind: SensitivityKind
  text: string
}

// Effektivkosten thresholds. accumulationRiy is stored as a decimal fraction
// (0.012 = 1.2 % p. a.), so thresholds use the same scale.
const HIGH_FEE_THRESHOLD = 0.012
const LOW_FEE_THRESHOLD = 0.006
const NARROW_CAPITAL_GAP = 0.05
const EMPLOYER_SHARE_FLOOR = 0.2

function totalContributionShareEmployer(result: ProductResult): number {
  const total = result.totalProductContributions
  if (total <= 0) return 0
  return result.totalEmployerContributions / total
}

/**
 * Pick a single dominant reason per product. The order of checks within each
 * product encodes a soft priority — the most decision-relevant attribute wins.
 */
export function productReason(result: ProductResult): ProductReason {
  const riy = result.accumulationRiy
  const employerShare = totalContributionShareEmployer(result)

  switch (result.productId) {
    case 'etf':
      if (riy <= LOW_FEE_THRESHOLD) {
        return {
          productId: 'etf',
          label: result.label,
          kind: 'low_fees',
          text: 'Niedrige Gebühren, jederzeit frei verfügbar.',
        }
      }
      return {
        productId: 'etf',
        label: result.label,
        kind: 'flexible_capital',
        text: 'Frei verfügbar, kein Auszahlplan vorgegeben.',
      }
    case 'bav':
      if (employerShare >= EMPLOYER_SHARE_FLOOR) {
        return {
          productId: 'bav',
          label: result.label,
          kind: 'employer_subsidy',
          text: 'Hoher Arbeitgeberanteil senkt deinen Nettoaufwand.',
        }
      }
      if (riy >= HIGH_FEE_THRESHOLD) {
        return {
          productId: 'bav',
          label: result.label,
          kind: 'high_fees',
          text: 'Vertragskosten zehren am Ergebnis (Effektivkosten hoch).',
        }
      }
      return {
        productId: 'bav',
        label: result.label,
        kind: 'tax_deferral',
        text: 'Steuer- und SV-Ersparnis in der Ansparphase.',
      }
    case 'versicherung':
      if (riy >= HIGH_FEE_THRESHOLD) {
        return {
          productId: 'versicherung',
          label: result.label,
          kind: 'high_fees',
          text: 'Hohe Vertragskosten — Effektivkosten über 1,2 % p. a.',
        }
      }
      return {
        productId: 'versicherung',
        label: result.label,
        kind: 'guarantee',
        text: 'Lebenslange Rentengarantie über den Rentenfaktor.',
      }
    case 'basisrente':
      if (riy >= HIGH_FEE_THRESHOLD) {
        return {
          productId: 'basisrente',
          label: result.label,
          kind: 'high_fees',
          text: 'Hohe Vertragskosten und kein Kapitalwahlrecht.',
        }
      }
      return {
        productId: 'basisrente',
        label: result.label,
        kind: 'tax_deferral',
        text: 'Sonderausgabenabzug heute, Besteuerung in der Rente.',
      }
    case 'altersvorsorgedepot':
      return {
        productId: 'altersvorsorgedepot',
        label: result.label,
        kind: 'subsidies',
        text: 'Zulagen und Steuervorteil, gebunden bis Rentenbeginn.',
      }
    case 'riester':
      if (employerShare > 0) {
        return {
          productId: 'riester',
          label: result.label,
          kind: 'subsidies',
          text: 'Zulagen und ggf. zusätzlicher Steuervorteil.',
        }
      }
      return {
        productId: 'riester',
        label: result.label,
        kind: 'subsidies',
        text: 'Grund- und Kinderzulagen, volle Versteuerung in der Rente.',
      }
  }
}

export function biggestCostDriver(results: ProductResult[]): CostDriver | undefined {
  if (results.length === 0) return undefined
  const winner = results.reduce((best, r) =>
    r.accumulationRiy > best.accumulationRiy ? r : best,
  )
  if (!Number.isFinite(winner.accumulationRiy) || winner.accumulationRiy <= 0) return undefined
  return {
    productId: winner.productId,
    label: winner.label,
    riyDecimal: winner.accumulationRiy,
  }
}

/**
 * Heuristic single-line "what would flip the ranking" hint. Intentionally compact —
 * proper sensitivity analysis is its own backlog item (#UX6).
 */
export function sensitivityHint(results: ProductResult[]): SensitivityHint {
  if (results.length < 2) {
    return {
      kind: 'default',
      text: 'Wähle weitere Produkte aus, um Vergleichshinweise zu sehen.',
    }
  }

  const capitalSorted = [...results]
    .filter((r): r is ProductResult & { afterTaxLumpSum: number } => r.afterTaxLumpSum !== null)
    .sort((a, b) => b.afterTaxLumpSum - a.afterTaxLumpSum)
  const pensionSorted = [...results].sort((a, b) => b.netMonthlyPayout - a.netMonthlyPayout)

  const bestCap = capitalSorted[0]
  const bestPen = pensionSorted[0]

  if (bestCap && bestPen && bestCap.productId !== bestPen.productId) {
    return {
      kind: 'rankings_disagree',
      text: `Kapital- und Renten-Sieger sind verschieden: „${bestCap.label}" vorn beim Kapital, „${bestPen.label}" bei der monatlichen Rente. Frage dich, was dir wichtiger ist.`,
    }
  }

  if (bestCap && capitalSorted.length >= 2) {
    const second = capitalSorted[1]
    const gap = (bestCap.afterTaxLumpSum - second.afterTaxLumpSum) / bestCap.afterTaxLumpSum
    if (gap < NARROW_CAPITAL_GAP) {
      return {
        kind: 'narrow_capital_gap',
        text: `Knapper Vorsprung beim Kapital (unter 5 % zu „${second.label}"). Ranking kippt schon bei kleinen Änderungen an Rendite oder Gebühren.`,
      }
    }
  }

  if (bestCap && bestCap.accumulationRiy >= HIGH_FEE_THRESHOLD) {
    return {
      kind: 'high_fee_winner',
      text: `Sieger hat hohe Effektivkosten (${(bestCap.accumulationRiy * 100).toFixed(2)} % p. a.). Eine Renditeannahme 1 pp niedriger oder ein günstigerer Tarif kann das Bild drehen.`,
    }
  }

  return {
    kind: 'default',
    text: 'Hebel mit grösstem Einfluss: Rendite, Effektivkosten und (bei bAV) Arbeitgeberanteil. Verändere sie testweise im Bereich „Erweitert".',
  }
}

export function rankingsDisagree(
  bestCapital: ProductResult | undefined,
  bestPension: ProductResult | undefined,
): boolean {
  if (!bestCapital || !bestPension) return false
  return bestCapital.productId !== bestPension.productId
}
