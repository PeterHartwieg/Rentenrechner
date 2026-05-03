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

import type { ProductResult } from '../domain'
import type { Workspace } from '../domain/workspace'
import type { CombinedResult } from '../engine/portfolioCombine'

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
  // Reserved for issues 11 / 13 / 14

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
// Rule registry
// ---------------------------------------------------------------------------

/**
 * Ordered list of all active rules. Issues 11 / 13 / 14 push additional rules
 * here. Order matters only for presentation when atoms are later sorted by
 * priority — within equal priority the registry order is preserved.
 */
const RULES: Rule[] = [sensitivityHintRule, productReasonRule]

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
