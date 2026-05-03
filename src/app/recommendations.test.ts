import { describe, expect, it, vi } from 'vitest'
import type { ProductResult } from '../domain'
import {
  runRules,
  renderAtom,
  type Atom,
  type AtomId,
  type RuleEngineInput,
} from './recommendations'
import { productReason, sensitivityHint } from '../features/results/decisionLogic'

// ---------------------------------------------------------------------------
// Minimal factories
// ---------------------------------------------------------------------------

function makeInput(products: ProductResult[]): RuleEngineInput {
  return { simulationResult: { products } }
}

function makeResult(overrides: Partial<ProductResult>): ProductResult {
  return {
    productId: 'etf',
    label: 'ETF-Depot',
    scenarioId: 'basis',
    scenarioLabel: 'Basis',
    annualReturn: 0.05,
    monthlyUserCost: 100,
    monthlyProductContribution: 100,
    monthlyEmployerContribution: 0,
    totalUserCost: 12000,
    totalProductContributions: 12000,
    totalEmployerContributions: 0,
    totalFees: 100,
    capitalAtRetirement: 25000,
    realCapitalAtRetirement: 20000,
    afterTaxLumpSum: 22000,
    grossMonthlyPayout: 100,
    netMonthlyPayout: 80,
    taxAndSvSavings: 0,
    valueMultipleOnUserCost: 1.8,
    capitalMultipleAnnualized: 1.05,
    accumulationRiy: 0.003,
    rows: [],
    etfPayoutRows: [],
    ...overrides,
  } as ProductResult
}

// ---------------------------------------------------------------------------
// Engine basics
// ---------------------------------------------------------------------------

describe('runRules', () => {
  it('returns [] when rules array is empty', () => {
    const input = makeInput([])
    expect(runRules(input, [])).toEqual([])
  })

  it('does not throw on empty products array', () => {
    const input = makeInput([])
    expect(() => runRules(input)).not.toThrow()
  })

  it('returns an array with at least one atom when products are present', () => {
    const input = makeInput([makeResult({})])
    expect(runRules(input).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// renderAtom
// ---------------------------------------------------------------------------

describe('renderAtom', () => {
  it('returns headline and body for a known id', () => {
    const atom: Atom = {
      id: 'reason_low_fees',
      priority: 'medium',
      context: { productId: 'etf', label: 'ETF', riyDecimal: 0.003 },
    }
    const rendered = renderAtom(atom)
    expect(rendered.headline).toBeTruthy()
    expect(rendered.body).toBeTruthy()
  })

  it('returns empty-string fallback for an unknown id — does not throw', () => {
    const atom = {
      id: 'completely_unknown_atom_id' as AtomId,
      priority: 'low' as const,
      context: {},
    }
    expect(() => renderAtom(atom)).not.toThrow()
    const rendered = renderAtom(atom)
    expect(rendered.headline).toBe('')
    expect(rendered.body).toBe('')
  })

  it('logs a warning in dev mode for an unknown id', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const atom = {
      id: 'unknown_for_warn_test' as AtomId,
      priority: 'low' as const,
      context: {},
    }
    renderAtom(atom)
    // import.meta.env?.DEV is true in vitest
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown_for_warn_test'),
    )
    consoleSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// renderAtom snapshots — lock the current copy for all known atom ids
// ---------------------------------------------------------------------------

describe('renderAtom snapshots', () => {
  const knownAtoms: Atom[] = [
    {
      id: 'sensitivity_rankings_disagree',
      priority: 'high',
      context: { bestCapitalId: 'etf', bestCapitalLabel: 'ETF', bestPensionId: 'bav', bestPensionLabel: 'bAV' },
    },
    {
      id: 'sensitivity_narrow_capital_gap',
      priority: 'medium',
      context: { winnerId: 'etf', winnerLabel: 'ETF', runnerId: 'bav', runnerLabel: 'bAV', gapPct: 0.03 },
    },
    {
      id: 'sensitivity_high_fee_winner',
      priority: 'medium',
      context: { winnerId: 'versicherung', winnerLabel: 'pAV', riyDecimal: 0.016 },
    },
    {
      id: 'sensitivity_default',
      priority: 'low',
      context: { text: 'Wähle weitere Produkte aus, um Vergleichshinweise zu sehen.' },
    },
    {
      id: 'reason_employer_subsidy',
      priority: 'high',
      context: { productId: 'bav', label: 'bAV', employerSharePct: 0.3 },
    },
    {
      id: 'reason_low_fees',
      priority: 'medium',
      context: { productId: 'etf', label: 'ETF', riyDecimal: 0.003 },
    },
    {
      id: 'reason_high_fees',
      priority: 'high',
      context: { productId: 'bav', label: 'bAV', riyDecimal: 0.016 },
    },
    {
      id: 'reason_high_fees',
      priority: 'high',
      context: { productId: 'versicherung', label: 'pAV', riyDecimal: 0.016 },
    },
    {
      id: 'reason_high_fees',
      priority: 'high',
      context: { productId: 'basisrente', label: 'Basisrente', riyDecimal: 0.016 },
    },
    {
      id: 'reason_tax_deferral',
      priority: 'medium',
      context: { productId: 'bav', label: 'bAV' },
    },
    {
      id: 'reason_tax_deferral',
      priority: 'medium',
      context: { productId: 'basisrente', label: 'Basisrente' },
    },
    {
      id: 'reason_flexible_capital',
      priority: 'low',
      context: { productId: 'etf', label: 'ETF', riyDecimal: 0.015 },
    },
    {
      id: 'reason_subsidies',
      priority: 'medium',
      context: { productId: 'altersvorsorgedepot', label: 'AVD' },
    },
    {
      id: 'reason_subsidies',
      priority: 'medium',
      context: { productId: 'riester', label: 'Riester' },
    },
    {
      id: 'reason_subsidies',
      priority: 'medium',
      context: { productId: 'riester', label: 'Riester', hasEmployerContribution: true },
    },
    {
      id: 'reason_guarantee',
      priority: 'medium',
      context: { productId: 'versicherung', label: 'pAV' },
    },
  ]

  it('renderAtom output matches snapshot for all known ids', () => {
    const snapshot = knownAtoms.map((a) => ({ id: a.id, context: a.context, rendered: renderAtom(a) }))
    expect(snapshot).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Re-expressed rules produce the same atom counts and kinds as decisionLogic
// ---------------------------------------------------------------------------

describe('re-expressed rules vs decisionLogic', () => {
  const products = [
    makeResult({ productId: 'etf', label: 'ETF', accumulationRiy: 0.003, afterTaxLumpSum: 100_000, netMonthlyPayout: 900 }),
    makeResult({ productId: 'bav', label: 'bAV', accumulationRiy: 0.005, afterTaxLumpSum: 80_000, netMonthlyPayout: 700, totalProductContributions: 10_000, totalEmployerContributions: 500 }),
  ]

  it('emits one sensitivity atom + one reason atom per product', () => {
    const atoms = runRules(makeInput(products))
    // 1 sensitivity + 2 reason atoms
    expect(atoms).toHaveLength(3)
  })

  it('reason atom ids match productReason kinds from decisionLogic', () => {
    for (const result of products) {
      const atoms = runRules(makeInput([result]))
      const reasonAtom = atoms.find((a) => a.id.startsWith('reason_'))
      expect(reasonAtom).toBeDefined()
      const legacyReason = productReason(result)
      // The atom id should encode the same kind as the legacy facade returns.
      expect(reasonAtom?.id).toBe(`reason_${legacyReason.kind}`)
    }
  })

  it('sensitivity atom kind matches sensitivityHint kind from decisionLogic', () => {
    const hint = sensitivityHint(products)
    const atoms = runRules(makeInput(products))
    const sensitivityAtom = atoms.find((a) => a.id.startsWith('sensitivity_'))
    expect(sensitivityAtom).toBeDefined()
    expect(sensitivityAtom?.id).toBe(`sensitivity_${hint.kind}`)
  })

  it('rankings_disagree fires when capital and pension winners differ', () => {
    const etf = makeResult({ productId: 'etf', label: 'ETF', afterTaxLumpSum: 100_000, netMonthlyPayout: 600 })
    const bav = makeResult({ productId: 'bav', label: 'bAV', afterTaxLumpSum: 80_000, netMonthlyPayout: 900 })
    const atoms = runRules(makeInput([etf, bav]))
    expect(atoms.some((a) => a.id === 'sensitivity_rankings_disagree')).toBe(true)
  })

  it('narrow_capital_gap fires when winner is within 5 % of runner-up', () => {
    const etf = makeResult({ productId: 'etf', label: 'ETF', afterTaxLumpSum: 100_000, netMonthlyPayout: 900 })
    const bav = makeResult({ productId: 'bav', label: 'bAV', afterTaxLumpSum: 98_000, netMonthlyPayout: 800 })
    const atoms = runRules(makeInput([etf, bav]))
    expect(atoms.some((a) => a.id === 'sensitivity_narrow_capital_gap')).toBe(true)
  })

  it('high_fee_winner fires when winner has high RIY and clear lead', () => {
    const ins = makeResult({ productId: 'versicherung', label: 'pAV', afterTaxLumpSum: 100_000, netMonthlyPayout: 900, accumulationRiy: 0.016 })
    const etf = makeResult({ productId: 'etf', label: 'ETF', afterTaxLumpSum: 80_000, netMonthlyPayout: 700, accumulationRiy: 0.003 })
    const atoms = runRules(makeInput([ins, etf]))
    expect(atoms.some((a) => a.id === 'sensitivity_high_fee_winner')).toBe(true)
  })

  it('default sensitivity fires when no special condition applies', () => {
    const a = makeResult({ productId: 'etf', label: 'ETF', afterTaxLumpSum: 100_000, netMonthlyPayout: 900, accumulationRiy: 0.003 })
    const b = makeResult({ productId: 'bav', label: 'bAV', afterTaxLumpSum: 80_000, netMonthlyPayout: 700, accumulationRiy: 0.005 })
    const atoms = runRules(makeInput([a, b]))
    expect(atoms.some((a) => a.id === 'sensitivity_default')).toBe(true)
  })
})
