// Note: biggestCostDriver, sensitivityHint, rankingsDisagree, and personalSensitivityCaveat
// are currently only exercised by tests — kept for potential reuse if the Vergleich callouts return.
import type { ProductId, ProductResult } from '../../domain'
import { getProductMeta } from '../../app/productPresentation'
import type { PerturbationResult, SensitivityRunResult } from './sensitivity'
import {
  runRules,
  renderAtom,
  buildRuleInputFromProducts,
  type Atom,
} from '../../app/recommendations'

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

// ---------------------------------------------------------------------------
// Helpers: atom-id → ProductReasonKind / SensitivityKind mapping
// ---------------------------------------------------------------------------

const ATOM_TO_REASON_KIND: Partial<Record<Atom['id'], ProductReasonKind>> = {
  reason_employer_subsidy: 'employer_subsidy',
  reason_low_fees: 'low_fees',
  reason_high_fees: 'high_fees',
  reason_tax_deferral: 'tax_deferral',
  reason_flexible_capital: 'flexible_capital',
  reason_subsidies: 'subsidies',
  reason_guarantee: 'guarantee',
}

const ATOM_TO_SENSITIVITY_KIND: Partial<Record<Atom['id'], SensitivityKind>> = {
  sensitivity_rankings_disagree: 'rankings_disagree',
  sensitivity_narrow_capital_gap: 'narrow_capital_gap',
  sensitivity_high_fee_winner: 'high_fee_winner',
  sensitivity_default: 'default',
}

/**
 * Pick a single dominant reason per product.
 *
 * Facade over the `productReasonRule` in `recommendations.ts`. Runs the full
 * rule engine on a single-element products array, finds the reason atom for
 * this product, and reshapes to the existing `ProductReason` return type so
 * `DecisionSummary.tsx` is unchanged.
 */
export function productReason(result: ProductResult): ProductReason {
  const input = buildRuleInputFromProducts([result])
  const atoms = runRules(input)
  const reasonAtom = atoms.find((a) => a.id in ATOM_TO_REASON_KIND)
  if (reasonAtom) {
    const kind = ATOM_TO_REASON_KIND[reasonAtom.id] as ProductReasonKind
    const rendered = renderAtom(reasonAtom)
    return {
      productId: result.productId,
      label: result.label,
      kind,
      text: rendered.body,
    }
  }
  // Unreachable in practice (productReasonRule always emits one atom per product),
  // but satisfies exhaustiveness.
  return { productId: result.productId, label: result.label, kind: 'flexible_capital', text: '' }
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
 *
 * Facade over `sensitivityHintRule` in `recommendations.ts`. Runs the rule engine
 * on the full results array, picks the sensitivity atom, and reshapes to `SensitivityHint`.
 */
export function sensitivityHint(results: ProductResult[]): SensitivityHint {
  const input = buildRuleInputFromProducts(results)
  const atoms = runRules(input)
  const sensitivityAtom = atoms.find((a) => a.id in ATOM_TO_SENSITIVITY_KIND)
  if (sensitivityAtom) {
    const kind = ATOM_TO_SENSITIVITY_KIND[sensitivityAtom.id] as SensitivityKind
    const rendered = renderAtom(sensitivityAtom)
    // For rankings_disagree the rendered body is the compact text; prepend
    // the localised prefix that the original function used.
    let text = rendered.body
    if (kind === 'rankings_disagree') {
      const capLabel = sensitivityAtom.context['bestCapitalLabel'] as string
      const penLabel = sensitivityAtom.context['bestPensionLabel'] as string
      text = `Kapital- und Renten-Sieger sind verschieden: „${capLabel}" vorn beim Kapital, „${penLabel}" bei der monatlichen Rente. Frage dich, was dir wichtiger ist.`
    } else if (kind === 'narrow_capital_gap') {
      const runnerLabel = sensitivityAtom.context['runnerLabel'] as string
      text = `Knapper Vorsprung beim Kapital (unter 5 % zu „${runnerLabel}"). Ranking kippt schon bei kleinen Änderungen an Rendite oder Gebühren.`
    } else if (kind === 'high_fee_winner') {
      const riy = sensitivityAtom.context['riyDecimal'] as number
      text = `Sieger hat hohe Effektivkosten (${(riy * 100).toFixed(2)} % p. a.). Eine Renditeannahme 1 pp niedriger oder ein günstigerer Tarif kann das Bild drehen.`
    }
    return { kind, text }
  }
  return { kind: 'default', text: '' }
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
