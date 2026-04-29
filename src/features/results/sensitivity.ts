import type {
  GermanRules,
  PersonalProfile,
  ProductId,
  ProductResult,
  ScenarioAssumptions,
} from '../../domain'
import { simulateRetirementComparison } from '../../engine/simulate'

/**
 * Lightweight sensitivity probe for #UX6. Re-runs the simulation under a small set
 * of perturbations and reports how often each product's rank changes. This is NOT
 * a Monte Carlo or full sensitivity heatmap (those are P3 backlog items).
 */

export interface PerturbationDefinition {
  id: string
  label: string
  /** Free-text "what changed" line shown alongside the result. */
  detail: string
  /** Pure transform — must not mutate inputs. */
  apply: (
    profile: PersonalProfile,
    assumptions: ScenarioAssumptions,
  ) => { profile: PersonalProfile; assumptions: ScenarioAssumptions }
}

export interface PerturbationResult {
  id: string
  label: string
  detail: string
  /** Best capital winner under this perturbation, restricted to visibleProducts. */
  winnerCapital: ProductId | null
  /** Best monthly pension winner under this perturbation. */
  winnerPension: ProductId | null
  /** Rank-by-capital order for visible products under this perturbation. */
  capitalRank: ProductId[]
}

export type RobustnessBadge = 'robust' | 'knapp' | 'annahmenabhaengig'

export interface ProductRobustness {
  productId: ProductId
  badge: RobustnessBadge
  /** Number of perturbations that shifted this product's rank. */
  rankChanges: number
  /** Largest rank delta vs. baseline (0 = unchanged). */
  maxDelta: number
}

const BASIS_SCENARIO_ID = 'basis'

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

/**
 * Default perturbation set — covers the dominant levers without being exhaustive.
 * Each perturbation is independent (single-axis); we don't combine them.
 */
export const DEFAULT_PERTURBATIONS: PerturbationDefinition[] = [
  {
    id: 'return_minus_1',
    label: 'Rendite −1 pp',
    detail: 'Basis-Szenario eine Prozentpunkt niedriger.',
    apply: (profile, assumptions) => {
      const next = clone(assumptions)
      const basis = next.returnScenarios.find((s) => s.id === BASIS_SCENARIO_ID)
      if (basis) basis.annualReturn = Math.max(0, basis.annualReturn - 0.01)
      return { profile, assumptions: next }
    },
  },
  {
    id: 'return_plus_1',
    label: 'Rendite +1 pp',
    detail: 'Basis-Szenario eine Prozentpunkt höher.',
    apply: (profile, assumptions) => {
      const next = clone(assumptions)
      const basis = next.returnScenarios.find((s) => s.id === BASIS_SCENARIO_ID)
      if (basis) basis.annualReturn += 0.01
      return { profile, assumptions: next }
    },
  },
  {
    id: 'fees_minus_05',
    label: 'Gebühren −0,5 pp',
    detail: 'Wrapper- und Fondsgebühren bei bAV/pAV/AVD je 0,25 pp niedriger.',
    apply: (profile, assumptions) => {
      const next = clone(assumptions)
      next.bav.fees.wrapperAssetFee = Math.max(0, next.bav.fees.wrapperAssetFee - 0.0025)
      next.bav.fees.fundAssetFee = Math.max(0, next.bav.fees.fundAssetFee - 0.0025)
      next.insurance.fees.wrapperAssetFee = Math.max(0, next.insurance.fees.wrapperAssetFee - 0.0025)
      next.insurance.fees.fundAssetFee = Math.max(0, next.insurance.fees.fundAssetFee - 0.0025)
      next.altersvorsorgedepot.fees.wrapperAssetFee = Math.max(0, next.altersvorsorgedepot.fees.wrapperAssetFee - 0.0025)
      next.altersvorsorgedepot.fees.fundAssetFee = Math.max(0, next.altersvorsorgedepot.fees.fundAssetFee - 0.0025)
      return { profile, assumptions: next }
    },
  },
  {
    id: 'fees_plus_05',
    label: 'Gebühren +0,5 pp',
    detail: 'Wrapper- und Fondsgebühren bei bAV/pAV/AVD je 0,25 pp höher.',
    apply: (profile, assumptions) => {
      const next = clone(assumptions)
      next.bav.fees.wrapperAssetFee += 0.0025
      next.bav.fees.fundAssetFee += 0.0025
      next.insurance.fees.wrapperAssetFee += 0.0025
      next.insurance.fees.fundAssetFee += 0.0025
      next.altersvorsorgedepot.fees.wrapperAssetFee += 0.0025
      next.altersvorsorgedepot.fees.fundAssetFee += 0.0025
      return { profile, assumptions: next }
    },
  },
  {
    id: 'employer_zero',
    label: 'AG-Match 0 %',
    detail: 'Kein vertraglicher und kein gesetzlicher AG-Pflichtzuschuss bei bAV.',
    apply: (profile, assumptions) => {
      const next = clone(assumptions)
      next.bav.contractualMatchPercent = 0
      next.bav.contractualFixedMonthly = 0
      next.bav.statutoryMinimumSubsidyEnabled = false
      return { profile, assumptions: next }
    },
  },
  {
    id: 'employer_50',
    label: 'AG-Match 50 %',
    detail: 'Vertraglicher AG-Match auf 50 % der Bruttoumwandlung erhöht.',
    apply: (profile, assumptions) => {
      const next = clone(assumptions)
      next.bav.contractualMatchPercent = 0.5
      next.bav.statutoryMinimumSubsidyEnabled = true
      return { profile, assumptions: next }
    },
  },
  {
    id: 'retire_minus_2',
    label: 'Renteneintritt −2 J.',
    detail: 'Zwei Jahre früher in Rente gehen.',
    apply: (profile, assumptions) => {
      const newRetirementAge = Math.max(profile.age + 5, profile.retirementAge - 2)
      return { profile: { ...profile, retirementAge: newRetirementAge }, assumptions }
    },
  },
  {
    id: 'retire_plus_2',
    label: 'Renteneintritt +2 J.',
    detail: 'Zwei Jahre später in Rente gehen.',
    apply: (profile, assumptions) => {
      const next = clone(assumptions)
      const newRetirementAge = profile.retirementAge + 2
      const newEnd = Math.max(next.retirementEndAge, newRetirementAge + 5)
      next.retirementEndAge = newEnd
      return { profile: { ...profile, retirementAge: newRetirementAge }, assumptions: next }
    },
  },
  {
    id: 'kvdr_off',
    label: 'KVdR aus',
    detail: 'In der Rente freiwillig statt pflichtversichert (kein KV-Freibetrag).',
    apply: (profile, assumptions) => {
      const next = clone(assumptions)
      next.bav.kvdrMember = false
      return { profile, assumptions: next }
    },
  },
]

function rankByCapital(
  products: ProductResult[],
  visible: Set<ProductId>,
  scenarioId: string,
): ProductId[] {
  return products
    .filter((p) => p.scenarioId === scenarioId && visible.has(p.productId))
    .map((p) => ({ id: p.productId, capital: p.afterTaxLumpSum ?? p.capitalAtRetirement }))
    .sort((a, b) => b.capital - a.capital)
    .map((x) => x.id)
}

function pickWinnerCapital(
  products: ProductResult[],
  visible: Set<ProductId>,
  scenarioId: string,
): ProductId | null {
  const ranked = rankByCapital(products, visible, scenarioId)
  return ranked[0] ?? null
}

function pickWinnerPension(
  products: ProductResult[],
  visible: Set<ProductId>,
  scenarioId: string,
): ProductId | null {
  let winner: { id: ProductId; net: number } | undefined
  for (const p of products) {
    if (p.scenarioId !== scenarioId || !visible.has(p.productId)) continue
    if (!winner || p.netMonthlyPayout > winner.net) {
      winner = { id: p.productId, net: p.netMonthlyPayout }
    }
  }
  return winner?.id ?? null
}

export interface SensitivityRunInput {
  profile: PersonalProfile
  assumptions: ScenarioAssumptions
  rules: GermanRules
  visibleProducts: ProductId[]
  perturbations?: PerturbationDefinition[]
}

export interface SensitivityRunResult {
  baseline: PerturbationResult
  perturbations: PerturbationResult[]
  /** Per-visible-product robustness summary based on rank changes. */
  robustness: ProductRobustness[]
}

export function runSensitivity(input: SensitivityRunInput): SensitivityRunResult {
  const { profile, assumptions, rules, visibleProducts } = input
  const perturbations = input.perturbations ?? DEFAULT_PERTURBATIONS

  const visible = new Set<ProductId>(
    visibleProducts.length > 0
      ? visibleProducts
      : ['etf', 'bav', 'versicherung', 'basisrente', 'altersvorsorgedepot', 'riester'],
  )

  const baselineSim = simulateRetirementComparison(profile, assumptions, rules)
  const baselineRank = rankByCapital(baselineSim.products, visible, BASIS_SCENARIO_ID)
  const baseline: PerturbationResult = {
    id: 'baseline',
    label: 'Basis',
    detail: 'Aktuelle Annahmen.',
    winnerCapital: pickWinnerCapital(baselineSim.products, visible, BASIS_SCENARIO_ID),
    winnerPension: pickWinnerPension(baselineSim.products, visible, BASIS_SCENARIO_ID),
    capitalRank: baselineRank,
  }

  const perturbationResults: PerturbationResult[] = perturbations.map((p) => {
    const { profile: pProfile, assumptions: pAssumptions } = p.apply(profile, assumptions)
    const sim = simulateRetirementComparison(pProfile, pAssumptions, rules)
    return {
      id: p.id,
      label: p.label,
      detail: p.detail,
      winnerCapital: pickWinnerCapital(sim.products, visible, BASIS_SCENARIO_ID),
      winnerPension: pickWinnerPension(sim.products, visible, BASIS_SCENARIO_ID),
      capitalRank: rankByCapital(sim.products, visible, BASIS_SCENARIO_ID),
    }
  })

  const robustness: ProductRobustness[] = []
  for (const productId of baselineRank) {
    const baseIdx = baselineRank.indexOf(productId)
    let rankChanges = 0
    let maxDelta = 0
    for (const pr of perturbationResults) {
      const idx = pr.capitalRank.indexOf(productId)
      if (idx < 0) continue
      const delta = Math.abs(idx - baseIdx)
      if (delta > 0) rankChanges += 1
      if (delta > maxDelta) maxDelta = delta
    }
    let badge: RobustnessBadge
    if (rankChanges === 0) badge = 'robust'
    else if (rankChanges <= 2) badge = 'knapp'
    else badge = 'annahmenabhaengig'
    robustness.push({ productId, badge, rankChanges, maxDelta })
  }

  return { baseline, perturbations: perturbationResults, robustness }
}
