/**
 * Rules engine skeleton (Group G issue 10, milestone M3.1).
 *
 * Pure module — no React imports, no DOM access.
 *
 * Architecture:
 *   - `Atom` is the unit of output: { id, priority, context }.
 *   - `Rule` is a pure function: (input) => Atom | Atom[] | null.
 *   - `RULES` is the registry. Empty here; issues 11/13/14 populate it.
 *   - `runRules` runs all rules and flattens output.
 *   - `renderAtom` maps atom.id → { headline, body, cta? } via a static table.
 *
 * `decisionLogic.ts` re-expression:
 *   The four sensitivityHint branches and all six productReason branches from
 *   `decisionLogic.ts` are expressed as rules below and registered in RULES.
 *   `decisionLogic.ts` now calls `runRules` internally and reshapes the atoms
 *   into its existing public return shapes — compare-mode UI is byte-identical.
 */

import type { GermanRules, ProductResult } from '../domain'
import type { Workspace } from '../domain/workspace'
import type { CombinedResult } from '../engine/portfolioCombine'
import { activeRules } from '../rules'

// ---------------------------------------------------------------------------
// Allowance helpers
// ---------------------------------------------------------------------------

/**
 * Sum of Kinderzulagen across all children in the profile.
 * §85 EStG: born ≥ 2008 → `kinderzulagePost2007` (€300), born < 2008 → `childAllowancePre2008` (€185).
 */
function computeKinderzulagen(
  childBirthYears: number[],
  riesterRules: GermanRules['riester'],
): number {
  return childBirthYears.reduce((sum, birthYear) => {
    return sum + (birthYear >= 2008 ? riesterRules.childAllowancePost2007 : riesterRules.childAllowancePre2008)
  }, 0)
}

// ---------------------------------------------------------------------------
// Atom shape
// ---------------------------------------------------------------------------

export type AtomId =
  // Sensitivity hint atoms (re-expressed from sensitivityHint in decisionLogic.ts)
  | 'sensitivity_rankings_disagree'
  | 'sensitivity_narrow_capital_gap'
  | 'sensitivity_high_fee_winner'
  | 'sensitivity_default'
  // Per-product reason atoms (re-expressed from productReason in decisionLogic.ts)
  | 'reason_employer_subsidy'
  | 'reason_low_fees'
  | 'reason_high_fees'
  | 'reason_tax_deferral'
  | 'reason_flexible_capital'
  | 'reason_subsidies'
  | 'reason_guarantee'
  // Cap and headroom atoms (issue 11)
  | 'bav_cap_remaining'
  | 'basisrente_cap_remaining'
  | 'riester_cap_remaining'
  | 'avd_cap_remaining'
  | 'sparerpauschbetrag_remaining'

export interface Atom {
  id: AtomId
  priority: 'high' | 'medium' | 'low'
  /**
   * Rule-specific payload. Renderer reads from this; use `unknown` + narrowing
   * rather than `any`.
   */
  context: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

/**
 * Loose type for per-value evidence state. Issue 12 may sharpen this once
 * `src/app/evidence.ts` lands with the canonical `EvidenceState` type.
 */
type EvidenceSnapshot = Record<string, Record<string, unknown>>

/** Structural subset of SimulationResult — only the fields current rules read. */
export interface RuleEngineSimulationView {
  products: ProductResult[]
}

export interface RuleEngineInput {
  /** Today's rules don't read workspace; optional so callers without a full Workspace can omit it. */
  workspace?: Workspace
  /** Structural subset of SimulationResult capturing only what current rules read. */
  simulationResult: RuleEngineSimulationView
  /** Combine-mode aggregate (issue 08); omit for compare-mode callers. */
  combinedResult?: CombinedResult
  /** Per-value evidence snapshot (issue 09); omit if not yet available. */
  evidence?: EvidenceSnapshot
  /** Reserved for issue 12 cap/headroom rules. */
  marginalBudgetEUR?: number
}

// ---------------------------------------------------------------------------
// Rule type
// ---------------------------------------------------------------------------

export type Rule = (input: RuleEngineInput) => Atom | Atom[] | null

// ---------------------------------------------------------------------------
// Internal thresholds (mirror decisionLogic.ts constants)
// ---------------------------------------------------------------------------

const HIGH_FEE_THRESHOLD = 0.012
const LOW_FEE_THRESHOLD = 0.006
const NARROW_CAPITAL_GAP = 0.05
const EMPLOYER_SHARE_FLOOR = 0.2

function employerShare(result: ProductResult): number {
  const total = result.totalProductContributions
  if (total <= 0) return 0
  return result.totalEmployerContributions / total
}

// ---------------------------------------------------------------------------
// Re-expressed decisionLogic rules
// ---------------------------------------------------------------------------

/**
 * Emits one sensitivity atom based on comparing capital-rank vs pension-rank.
 * Mirrors the `sensitivityHint` branches in `decisionLogic.ts`.
 */
const sensitivityHintRule: Rule = ({ simulationResult }: RuleEngineInput): Atom => {
  const results = simulationResult.products

  if (results.length < 2) {
    return {
      id: 'sensitivity_default',
      priority: 'low',
      context: {
        text: 'Wähle weitere Produkte aus, um Vergleichshinweise zu sehen.',
      },
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
      id: 'sensitivity_rankings_disagree',
      priority: 'high',
      context: {
        bestCapitalId: bestCap.productId,
        bestCapitalLabel: bestCap.label,
        bestPensionId: bestPen.productId,
        bestPensionLabel: bestPen.label,
      },
    }
  }

  if (bestCap && capitalSorted.length >= 2) {
    const second = capitalSorted[1]
    const gap = (bestCap.afterTaxLumpSum - second.afterTaxLumpSum) / bestCap.afterTaxLumpSum
    if (gap < NARROW_CAPITAL_GAP) {
      return {
        id: 'sensitivity_narrow_capital_gap',
        priority: 'medium',
        context: {
          winnerId: bestCap.productId,
          winnerLabel: bestCap.label,
          runnerId: second.productId,
          runnerLabel: second.label,
          gapPct: gap,
        },
      }
    }
  }

  if (bestCap && bestCap.accumulationRiy >= HIGH_FEE_THRESHOLD) {
    return {
      id: 'sensitivity_high_fee_winner',
      priority: 'medium',
      context: {
        winnerId: bestCap.productId,
        winnerLabel: bestCap.label,
        riyDecimal: bestCap.accumulationRiy,
      },
    }
  }

  return {
    id: 'sensitivity_default',
    priority: 'low',
    context: {
      text: 'Hebel mit grösstem Einfluss: Rendite, Effektivkosten und (bei bAV) Arbeitgeberanteil. Verändere sie testweise im Bereich „Erweitert".',
    },
  }
}

/**
 * Emits one reason atom per visible product result.
 * Mirrors the `productReason` switch in `decisionLogic.ts`.
 */
const productReasonRule: Rule = ({ simulationResult }: RuleEngineInput): Atom[] => {
  return simulationResult.products.map((result): Atom => {
    const riy = result.accumulationRiy
    const share = employerShare(result)

    switch (result.productId) {
      case 'etf':
        if (riy <= LOW_FEE_THRESHOLD) {
          return {
            id: 'reason_low_fees',
            priority: 'medium',
            context: { productId: result.productId, label: result.label },
          }
        }
        return {
          id: 'reason_flexible_capital',
          priority: 'low',
          context: { productId: result.productId, label: result.label, riyDecimal: riy },
        }

      case 'bav':
        if (share >= EMPLOYER_SHARE_FLOOR) {
          return {
            id: 'reason_employer_subsidy',
            priority: 'high',
            context: { productId: result.productId, label: result.label, employerSharePct: share },
          }
        }
        if (riy >= HIGH_FEE_THRESHOLD) {
          return {
            id: 'reason_high_fees',
            priority: 'high',
            context: { productId: result.productId, label: result.label, riyDecimal: riy },
          }
        }
        return {
          id: 'reason_tax_deferral',
          priority: 'medium',
          context: { productId: result.productId, label: result.label },
        }

      case 'versicherung':
        if (riy >= HIGH_FEE_THRESHOLD) {
          return {
            id: 'reason_high_fees',
            priority: 'high',
            context: { productId: result.productId, label: result.label, riyDecimal: riy },
          }
        }
        return {
          id: 'reason_guarantee',
          priority: 'medium',
          context: { productId: result.productId, label: result.label },
        }

      case 'basisrente':
        if (riy >= HIGH_FEE_THRESHOLD) {
          return {
            id: 'reason_high_fees',
            priority: 'high',
            context: { productId: result.productId, label: result.label, riyDecimal: riy },
          }
        }
        return {
          id: 'reason_tax_deferral',
          priority: 'medium',
          context: { productId: result.productId, label: result.label },
        }

      case 'altersvorsorgedepot':
        return {
          id: 'reason_subsidies',
          priority: 'medium',
          context: { productId: result.productId, label: result.label },
        }

      case 'riester':
        return {
          id: 'reason_subsidies',
          priority: 'medium',
          context: {
            productId: result.productId,
            label: result.label,
            hasEmployerContribution: share > 0,
          },
        }
    }
  })
}

// ---------------------------------------------------------------------------
// Cap and headroom rules (issue 11)
// ---------------------------------------------------------------------------

const BAV_NEARLY_FULL_THRESHOLD = 0.95

/**
 * bAV §3 Nr. 63 EStG cap (8 % BBG-West, tax-free) usage across all active bAV instances.
 *
 * When `usedPct >= 0.95` the employer has nearly exhausted the tax-free window and the
 * next-euro lever shifts to Basisrente.
 *
 * V1 single-employer assumption: §3 Nr. 63 cap is shared across all bAV
 * instances of one person. Multi-employer (each employer has its own
 * independent §3 Nr. 63 limit) is a P2 schema extension.
 */
const bavCapRemainingRule: Rule = (input: RuleEngineInput): Atom | null => {
  if (!input.combinedResult || !input.workspace) return null
  const rules = activeRules
  const wsa = input.workspace.baseline.assumptions

  const capAnnual = rules.socialSecurity.pensionCapYear * rules.bav.taxFreePctOfPensionCap
  const capMonthly = capAnnual / 12

  const activeBav = wsa.bav.filter((b) => b.status !== 'surrendered')
  const usedMonthly = activeBav.reduce((s, b) => s + (b.monthlyGrossConversion ?? 0), 0)
  const usedPct = Math.min(1, capAnnual > 0 ? (usedMonthly * 12) / capAnnual : 0)
  const remainingMonthly = Math.max(0, capMonthly - usedMonthly)

  return {
    id: 'bav_cap_remaining',
    priority: usedPct >= BAV_NEARLY_FULL_THRESHOLD ? 'high' : 'medium',
    context: {
      usedPct,
      remainingMonthly,
      ...(usedPct >= BAV_NEARLY_FULL_THRESHOLD ? { nextLeverProductId: 'basisrente' as const } : {}),
    },
  }
}

/**
 * §10 Abs. 3 EStG Schicht-1 cap remaining after pension-system contributions.
 *
 * Pension-system contributions = GRV employee + employer contributions estimated
 * from the profile salary so the rule stays pure without re-running salary.
 */
const basisrenteCapRemainingRule: Rule = (input: RuleEngineInput): Atom | null => {
  if (!input.combinedResult || !input.workspace) return null
  const rules = activeRules
  const profile = input.workspace.baseline.profile
  const wsa = input.workspace.baseline.assumptions

  const schicht1Cap = rules.basisrente.schicht1CapSingle
  const pensionType = wsa.statutoryPension.pensionBaselineType ?? 'grv'

  let annualPensionContributions: number
  if (pensionType === 'beamtenpension' || pensionType === 'none') {
    annualPensionContributions = 0
  } else if (pensionType === 'versorgungswerk') {
    annualPensionContributions =
      ((wsa.statutoryPension.versorgungswerkMonthlyContribution ?? 0) +
       (wsa.statutoryPension.versorgungswerkEmployerMonthly ?? 0)) * 12
  } else {
    // GRV: employee + employer pension contributions.
    // V1 estimate; matches portfolioAdapter math when no PKV/Versorgungswerk.
    // Revisit when CombinedResult exposes annualPensionContributions.
    const pensionBase = Math.min(profile.grossSalaryYear, rules.socialSecurity.pensionCapYear)
    annualPensionContributions =
      pensionBase * (rules.socialSecurity.pensionEmployeeRate + rules.socialSecurity.pensionEmployerRate)
  }

  const activeBasisrente = wsa.basisrente.filter((b) => b.status !== 'surrendered')
  const usedAnnual = activeBasisrente.reduce((s, b) => s + (b.monthlyGrossContribution ?? 0) * 12, 0)
  const remainingCapAnnual = Math.max(0, schicht1Cap - annualPensionContributions)
  const totalUsedAnnual = annualPensionContributions + usedAnnual
  const usedPct = Math.min(1, schicht1Cap > 0 ? totalUsedAnnual / schicht1Cap : 0)
  const remainingAnnual = Math.max(0, remainingCapAnnual - usedAnnual)

  return {
    id: 'basisrente_cap_remaining',
    priority: usedPct >= BAV_NEARLY_FULL_THRESHOLD ? 'high' : 'medium',
    context: { usedPct, remainingAnnual },
  }
}

/**
 * §10a EStG Riester cap (€2,100 incl. own contributions + Zulagen).
 *
 * "Used" = own annual contributions + allowance entitlement (Grundzulage + Kinderzulagen).
 * `allowanceCovered` shows how much of the cap is already covered by allowances.
 * `topUpToCap` shows how much additional own contribution would reach the cap.
 *
 * V1 single-person assumption: all Riester instances belong to the main profile.
 * Partner-linked Riester is a P2 schema extension — when added, group instances by
 * person-link and compute Grundzulage per group.
 */
const riesterCapRemainingRule: Rule = (input: RuleEngineInput): Atom | null => {
  if (!input.combinedResult || !input.workspace) return null
  const rules = activeRules

  const profile = input.workspace.baseline.profile
  const wsa = input.workspace.baseline.assumptions
  const capAnnual = rules.riester.annualCapInclAllowances

  const riesterInstances = wsa.riester.filter((r) => r.status !== 'surrendered')
  if (riesterInstances.length === 0) {
    return {
      id: 'riester_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0, allowanceCovered: 0, topUpToCap: capAnnual },
    }
  }

  // One Grundzulage per person (§84 EStG): eligible if any active instance is directly or
  // indirectly eligible. All instances belong to the same person in V1.
  const directlyEligibleAny = riesterInstances.some((inst) => inst.eligibility.directlyEligible === true)
  const indirectlyEligibleAny = riesterInstances.some(
    (inst) => (inst.eligibility.indirectSpouseEligible ?? false) === true,
  )
  const grundzulage = (directlyEligibleAny || indirectlyEligibleAny) ? rules.riester.grundzulage : 0
  const kinderzulageTotal = computeKinderzulagen(profile.childBirthYears, rules.riester)
  const allowanceCovered = grundzulage + kinderzulageTotal

  const ownContributionAnnual = riesterInstances.reduce(
    (s, r) => s + (r.monthlyOwnContribution ?? 0) * 12,
    0,
  )
  const usedAnnual = Math.min(capAnnual, ownContributionAnnual + allowanceCovered)
  const usedPct = Math.min(1, capAnnual > 0 ? usedAnnual / capAnnual : 0)
  const topUpToCap = Math.max(0, capAnnual - ownContributionAnnual - allowanceCovered)

  return {
    id: 'riester_cap_remaining',
    priority: usedPct >= BAV_NEARLY_FULL_THRESHOLD ? 'high' : 'medium',
    context: {
      usedPct,
      allowanceCovered,
      topUpToCap,
    },
  }
}

/**
 * Altersvorsorgedepot annual contract contribution cap (own contributions + allowances, per AltZertG).
 *
 * The per-contract cap is `rules.altersvorsorgedepot.contractContributionCapAnnual`.
 * Each AVD contract has its own independent cap (not portfolio-shared), so one atom
 * is emitted per active instance carrying `instanceId` so issue 12 can address
 * each contract individually.
 *
 * Empty workspace (zero AVD instances) → zero atoms (not one usedPct=0 atom).
 */
const avdCapRemainingRule: Rule = (input: RuleEngineInput): Atom[] | null => {
  if (!input.combinedResult || !input.workspace) return null
  const rules = activeRules

  const wsa = input.workspace.baseline.assumptions
  const capAnnual = rules.altersvorsorgedepot.contractContributionCapAnnual
  const capMonthly = capAnnual / 12

  const activeAvd = wsa.altersvorsorgedepot.filter((a) => a.status !== 'surrendered')

  // Zero instances → zero atoms (per-instance semantics: no contract = nothing to report).
  if (activeAvd.length === 0) return []

  return activeAvd.map((avd): Atom => {
    const usedMonthly = avd.monthlyOwnContribution ?? 0
    const usedPct = Math.min(1, capAnnual > 0 ? (usedMonthly * 12) / capAnnual : 0)
    const remainingMonthly = Math.max(0, capMonthly - usedMonthly)
    return {
      id: 'avd_cap_remaining',
      priority: usedPct >= BAV_NEARLY_FULL_THRESHOLD ? 'high' : 'medium',
      context: { instanceId: avd.instanceId, usedPct, remainingMonthly },
    }
  })
}

/**
 * Sparerpauschbetrag remaining (§20 Abs. 9 EStG).
 *
 * €1,000 single / €2,000 married. Used = sum of annual Vorabpauschale across ETF
 * and AVD instances from the first accumulation year, or payout-year `saverAllowanceUsed`
 * for ETF instances that have payout rows.
 *
 * Married status is detected from `workspace.baseline.partner`.
 */
const sparerpauschbetragRemainingRule: Rule = (input: RuleEngineInput): Atom | null => {
  if (!input.combinedResult || !input.workspace) return null
  const rules = activeRules

  const married = input.workspace.baseline.partner !== undefined
  const capAnnual = married
    ? rules.capitalGains.saverAllowance * 2
    : rules.capitalGains.saverAllowance

  let usedAnnual = 0
  for (const result of input.simulationResult.products) {
    if (result.productId === 'etf') {
      // Either accumulation-phase first-year Vorabpauschale, OR payout-phase
      // saverAllowanceUsed (mutually exclusive — payout-phase takes precedence).
      const payoutRow = result.etfPayoutRows?.[0]
      if (payoutRow) {
        usedAnnual += payoutRow.saverAllowanceUsed
      } else if (result.rows.length > 0) {
        // rows[0].cumulativeVorabpauschale equals year-1 Vorabpauschale because the
        // running total starts at 0 (see accumulation.ts:95-165).
        usedAnnual += result.rows[0].cumulativeVorabpauschale
      }
    } else if (result.productId === 'altersvorsorgedepot') {
      // AVD Vorabpauschale during accumulation.
      if (result.rows.length > 0) {
        // rows[0].cumulativeVorabpauschale equals year-1 Vorabpauschale because the
        // running total starts at 0 (see accumulation.ts:95-165).
        usedAnnual += result.rows[0].cumulativeVorabpauschale
      }
    }
  }

  usedAnnual = Math.min(usedAnnual, capAnnual)
  const remainingAnnual = Math.max(0, capAnnual - usedAnnual)
  const usedPct = Math.min(1, capAnnual > 0 ? usedAnnual / capAnnual : 0)

  return {
    id: 'sparerpauschbetrag_remaining',
    priority: usedPct >= BAV_NEARLY_FULL_THRESHOLD ? 'high' : 'medium',
    context: { usedAnnual, remainingAnnual, married },
  }
}

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

/**
 * Ordered list of all active rules. Issues 11 / 13 / 14 push additional rules
 * here. Order matters only for presentation when atoms are later sorted by
 * priority — within equal priority the registry order is preserved.
 */
const RULES: Rule[] = [
  sensitivityHintRule,
  productReasonRule,
  bavCapRemainingRule,
  basisrenteCapRemainingRule,
  riesterCapRemainingRule,
  avdCapRemainingRule,
  sparerpauschbetragRemainingRule,
]

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function runRules(input: RuleEngineInput, rules: Rule[] = RULES): Atom[] {
  return rules.flatMap((rule) => {
    const out = rule(input)
    if (out == null) return []
    return Array.isArray(out) ? out : [out]
  })
}

// ---------------------------------------------------------------------------
// Render table
// ---------------------------------------------------------------------------

interface AtomTemplate {
  headline: string
  body: string
  cta?: string
}

export function ctxString(ctx: Record<string, unknown>, key: string): string {
  const value = ctx[key]
  if (typeof value !== 'string') {
    if (import.meta.env?.DEV) {
      console.warn(`[recommendations] missing/invalid string context key '${key}'`, ctx)
    }
    return ''
  }
  return value
}

export function ctxNumber(ctx: Record<string, unknown>, key: string): number {
  const value = ctx[key]
  if (typeof value !== 'number') {
    if (import.meta.env?.DEV) {
      console.warn(`[recommendations] missing/invalid number context key '${key}'`, ctx)
    }
    return 0
  }
  return value
}

function ctxBool(ctx: Record<string, unknown>, key: string): boolean {
  return ctx[key] === true
}

const ATOM_TEMPLATES: Record<AtomId, (atom: Atom) => AtomTemplate> = {
  sensitivity_rankings_disagree: (atom) => {
    const capLabel = ctxString(atom.context, 'bestCapitalLabel')
    const penLabel = ctxString(atom.context, 'bestPensionLabel')
    return {
      headline: 'Kapital- und Renten-Sieger sind verschieden',
      body: `„${capLabel}" vorn beim Kapital, „${penLabel}" bei der monatlichen Rente. Frage dich, was dir wichtiger ist.`,
    }
  },

  sensitivity_narrow_capital_gap: (atom) => {
    const runnerLabel = ctxString(atom.context, 'runnerLabel')
    return {
      headline: 'Knapper Vorsprung beim Kapital',
      body: `Unter 5 % zu „${runnerLabel}". Ranking kippt schon bei kleinen Änderungen an Rendite oder Gebühren.`,
    }
  },

  sensitivity_high_fee_winner: (atom) => {
    const riy = ctxNumber(atom.context, 'riyDecimal')
    return {
      headline: 'Sieger hat hohe Effektivkosten',
      body: `${(riy * 100).toFixed(2)} % p. a. Eine Renditeannahme 1 pp niedriger oder ein günstigerer Tarif kann das Bild drehen.`,
    }
  },

  sensitivity_default: (atom) => {
    const text = ctxString(atom.context, 'text') || 'Hebel mit grösstem Einfluss: Rendite, Effektivkosten und (bei bAV) Arbeitgeberanteil. Verändere sie testweise im Bereich „Erweitert".'
    return {
      headline: 'Vergleichshinweis',
      body: text,
    }
  },

  reason_employer_subsidy: () => ({
    headline: 'Hoher Arbeitgeberanteil',
    body: 'Hoher Arbeitgeberanteil senkt deinen Nettoaufwand.',
  }),

  reason_low_fees: () => ({
    headline: 'Niedrige Gebühren',
    body: 'Niedrige Gebühren, jederzeit frei verfügbar.',
  }),

  reason_high_fees: (atom) => {
    const productId = ctxString(atom.context, 'productId')
    if (productId === 'basisrente') {
      return {
        headline: 'Hohe Kosten und kein Kapitalwahlrecht',
        body: 'Hohe Vertragskosten und kein Kapitalwahlrecht.',
      }
    }
    if (productId === 'versicherung') {
      return {
        headline: 'Hohe Vertragskosten',
        body: 'Hohe Vertragskosten — Effektivkosten über 1,2 % p. a.',
      }
    }
    return {
      headline: 'Hohe Vertragskosten',
      body: 'Vertragskosten zehren am Ergebnis (Effektivkosten hoch).',
    }
  },

  reason_tax_deferral: (atom) => {
    const productId = ctxString(atom.context, 'productId')
    if (productId === 'basisrente') {
      return {
        headline: 'Steuervorteil heute',
        body: 'Sonderausgabenabzug heute, Besteuerung in der Rente.',
      }
    }
    return {
      headline: 'Steuer- und SV-Ersparnis',
      body: 'Steuer- und SV-Ersparnis in der Ansparphase.',
    }
  },

  reason_flexible_capital: () => ({
    headline: 'Flexibel verfügbar',
    body: 'Frei verfügbar, kein Auszahlplan vorgegeben.',
  }),

  reason_subsidies: (atom) => {
    const productId = ctxString(atom.context, 'productId')
    if (productId === 'altersvorsorgedepot') {
      return {
        headline: 'Zulagen und Steuervorteil',
        body: 'Zulagen und Steuervorteil, gebunden bis Rentenbeginn.',
      }
    }
    if (productId === 'riester' && ctxBool(atom.context, 'hasEmployerContribution')) {
      return {
        headline: 'Zulagen',
        body: 'Zulagen und ggf. zusätzlicher Steuervorteil.',
      }
    }
    return {
      headline: 'Zulagen',
      body: 'Grund- und Kinderzulagen, volle Versteuerung in der Rente.',
    }
  },

  reason_guarantee: () => ({
    headline: 'Rentengarantie',
    body: 'Lebenslange Rentengarantie über den Rentenfaktor.',
  }),

  bav_cap_remaining: (atom) => {
    const usedPct = ctxNumber(atom.context, 'usedPct')
    const remainingMonthly = ctxNumber(atom.context, 'remainingMonthly')
    const nextLever = ctxString(atom.context, 'nextLeverProductId')
    const usedPctDisplay = Math.round(usedPct * 100)
    let body = `Du nutzt ${usedPctDisplay} % des steuerfreien bAV-Rahmens (§ 3 Nr. 63 EStG). `
    if (remainingMonthly > 0) {
      body += `Noch ${Math.round(remainingMonthly)} €/Monat verfügbar.`
    } else {
      body += 'Der steuerfreie Rahmen ist ausgeschöpft.'
    }
    if (nextLever === 'basisrente') {
      body += ' Nächster Hebel: Rürup-Rente — ebenfalls Sonderausgabenabzug, ohne bAV-Bindung.'
    }
    return {
      headline: 'Betriebliche Altersvorsorge: Beitragslimit',
      body,
    }
  },

  basisrente_cap_remaining: (atom) => {
    const usedPct = ctxNumber(atom.context, 'usedPct')
    const remainingAnnual = ctxNumber(atom.context, 'remainingAnnual')
    const usedPctDisplay = Math.round(usedPct * 100)
    let body = `Du nutzt ${usedPctDisplay} % des Schicht-1-Höchstbetrags (§ 10 Abs. 3 EStG). `
    if (remainingAnnual > 0) {
      body += `Noch ${Math.round(remainingAnnual)} €/Jahr für Rürup-Beiträge abzugsfähig.`
    } else {
      body += 'Der Höchstbetrag ist durch GRV- und Rürup-Beiträge ausgeschöpft.'
    }
    return {
      headline: 'Rürup-Rente: Sonderausgabenrahmen',
      body,
    }
  },

  riester_cap_remaining: (atom) => {
    const usedPct = ctxNumber(atom.context, 'usedPct')
    const topUpToCap = ctxNumber(atom.context, 'topUpToCap')
    const allowanceCovered = ctxNumber(atom.context, 'allowanceCovered')
    const usedPctDisplay = Math.round(usedPct * 100)
    let body = `Du nutzt ${usedPctDisplay} % des Riester-Höchstbetrags (§ 10a EStG, 2.100 €/Jahr inkl. Zulagen). `
    if (allowanceCovered > 0) {
      body += `Zulagen decken ${Math.round(allowanceCovered)} €/Jahr. `
    }
    if (topUpToCap > 0) {
      body += `Mit ${Math.round(topUpToCap)} € mehr Eigenbeitrag erreichst du den Höchstbetrag.`
    }
    return {
      headline: 'Riester: Sonderausgabenrahmen',
      body,
    }
  },

  avd_cap_remaining: (atom) => {
    const usedPct = ctxNumber(atom.context, 'usedPct')
    const remainingMonthly = ctxNumber(atom.context, 'remainingMonthly')
    const usedPctDisplay = Math.round(usedPct * 100)
    let body = `Du nutzt ${usedPctDisplay} % des AVD-Vertragsrahmens (6.840 €/Jahr). `
    if (remainingMonthly > 0) {
      body += `Noch ${Math.round(remainingMonthly)} €/Monat Spielraum bis zur Vertragsobergrenze.`
    } else {
      body += 'Die jährliche Vertragsobergrenze ist ausgeschöpft.'
    }
    return {
      headline: 'Altersvorsorgedepot: Beitragslimit',
      body,
    }
  },

  sparerpauschbetrag_remaining: (atom) => {
    const usedAnnual = ctxNumber(atom.context, 'usedAnnual')
    const remainingAnnual = ctxNumber(atom.context, 'remainingAnnual')
    const married = atom.context['married'] === true
    const cap = married ? 2_000 : 1_000
    let body = `Sparerpauschbetrag ${married ? '(verheiratet, 2.000 €)' : '(ledig, 1.000 €)'}: `
    if (usedAnnual > 0) {
      body += `${Math.round(usedAnnual)} € genutzt, noch ${Math.round(remainingAnnual)} € frei.`
    } else {
      body += `${cap} € noch nicht genutzt — ETF- und AVD-Vorabpauschale werden hier angerechnet.`
    }
    return {
      headline: 'Sparerpauschbetrag',
      body,
    }
  },
}

const FALLBACK_TEMPLATE: AtomTemplate = { headline: '', body: '', cta: undefined }

/**
 * Map an atom to its display strings via the static template table.
 *
 * Unknown atom ids return a placeholder and warn in dev — never throws.
 *
 * `locale` is reserved for P2 bilingual support; only `'de'` is implemented today.
 */
export function renderAtom(atom: Atom, locale: 'de' = 'de'): AtomTemplate {
  void locale
  const templateFn = ATOM_TEMPLATES[atom.id]
  if (!templateFn) {
    if (import.meta.env?.DEV) {
      console.warn(`[recommendations] Unknown AtomId: "${atom.id}"`)
    }
    return FALLBACK_TEMPLATE
  }
  return templateFn(atom)
}
