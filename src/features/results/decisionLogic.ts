// Note: biggestCostDriver, sensitivityHint, rankingsDisagree, and personalSensitivityCaveat
// are currently only exercised by tests — kept for potential reuse if the Vergleich callouts return.
import type { ProductId, ProductResult } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import type { PerturbationResult, SensitivityRunResult } from './sensitivity'

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

/**
 * Maps a perturbation id to a German "if-clause" (e.g. "Wenn die Rendite 1 pp niedriger ist").
 * Falls back to the perturbation label for ids not explicitly mapped.
 */
const PERTURBATION_IF_CLAUSE: Record<string, string> = {
  return_minus_1: 'Wenn die Rendite 1 pp niedriger ausfällt',
  return_plus_1: 'Wenn die Rendite 1 pp höher ausfällt',
  fees_minus_05: 'Wenn die Gebühren 0,5 pp niedriger sind',
  fees_plus_05: 'Wenn die Gebühren 0,5 pp höher sind',
  employer_zero: 'Wenn der AG-Match wegfällt',
  employer_50: 'Wenn der AG-Match auf 50 % steigt',
  retire_minus_2: 'Wenn du 2 Jahre früher in Rente gehst',
  retire_plus_2: 'Wenn du 2 Jahre später in Rente gehst',
  kvdr_off: 'Wenn du in der Rente freiwillig versichert bist',
}

export type PersonalSensitivityKind = 'robust' | 'flips' | 'volatile' | 'insufficient'

export interface PersonalSensitivityFlip {
  perturbationId: string
  ifClause: string
  newWinnerId: ProductId
  newWinnerLabel: string
}

export interface PersonalSensitivityCaveat {
  kind: PersonalSensitivityKind
  /** Headline string for fallback rendering. */
  text: string
  flips: PersonalSensitivityFlip[]
}

function ifClauseFor(p: PerturbationResult): string {
  return PERTURBATION_IF_CLAUSE[p.id] ?? `Wenn ${p.label.toLowerCase()}`
}

function winnerLabel(productId: ProductId, results: ProductResult[]): string {
  const fromResult = results.find((r) => r.productId === productId)?.label
  if (fromResult) return fromResult
  return getProductMeta(productId)?.label ?? productId
}

/**
 * Builds a personalised "what would flip the ranking" summary from the actual
 * sensitivity simulation. Returns the flips that change the *capital winner*,
 * since that is the headline metric in DecisionSummary.
 */
export function personalSensitivityCaveat(
  sensitivity: SensitivityRunResult | undefined,
  results: ProductResult[],
): PersonalSensitivityCaveat {
  if (!sensitivity || results.length < 2) {
    return {
      kind: 'insufficient',
      text: 'Wähle weitere Produkte aus, um Vergleichshinweise zu sehen.',
      flips: [],
    }
  }

  const baselineWinner = sensitivity.baseline.winnerCapital
  const flips: PersonalSensitivityFlip[] = []
  for (const p of sensitivity.perturbations) {
    if (p.winnerCapital && p.winnerCapital !== baselineWinner) {
      flips.push({
        perturbationId: p.id,
        ifClause: ifClauseFor(p),
        newWinnerId: p.winnerCapital,
        newWinnerLabel: winnerLabel(p.winnerCapital, results),
      })
    }
  }

  if (flips.length === 0) {
    return {
      kind: 'robust',
      text: 'Stabil: keiner der getesteten Hebel ändert den Sieger beim Endkapital.',
      flips: [],
    }
  }

  if (flips.length >= 4) {
    return {
      kind: 'volatile',
      text: `Annahmenabhängig: ${flips.length} Hebel kippen den Sieger. Schau in „Was müsste sich ändern?" für Details.`,
      flips: flips.slice(0, 2),
    }
  }

  return {
    kind: 'flips',
    text: `${flips.length === 1 ? 'Ein Hebel' : `${flips.length} Hebel`} kippen den Sieger:`,
    flips: flips.slice(0, 2),
  }
}
