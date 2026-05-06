import { describe, expect, it, vi } from 'vitest'
import type { ProductResult } from '../domain'
import type { Workspace, Scenario, WorkspaceAssumptionsV2 } from '../domain/workspace'
import type { BavInstance, BasisrenteInstance, RiesterInstance, AltersvorsorgedepotInstance, EtfInstance, InsuranceInstance } from '../domain/instances'
import {
  runRules,
  type Atom,
  type AtomId,
  type RuleEngineInput,
} from './recommendations'
import {
  renderAtom,
  ctxNumber,
} from '../content/recommendationCopy'
import { productReason, sensitivityHint } from '../features/results/decisionLogic'
import { de2026Rules } from '../rules/de2026'
import { makeCombinedResult } from '../test/factories'
import { defaultWorkspace } from '../storage'

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

// ---------------------------------------------------------------------------
// Cap and headroom rule fixtures (issue 11)
// ---------------------------------------------------------------------------

// bAV §3 Nr. 63 annual cap for 2026: 101,400 × 0.08 = 8,112 EUR/year = 676 EUR/month
const BAV_CAP_MONTHLY = (de2026Rules.socialSecurity.pensionCapYear * de2026Rules.bav.taxFreePctOfPensionCap) / 12

const INSTANCE_COMMON = {
  label: 'Test',
  status: 'active' as const,
  contractStartYear: 2020,
  evidenceMap: {},
}

const NEUTRALISED_FEES = {
  wrapperAssetFee: 0,
  fundAssetFee: 0.002,
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 5,
  pensionPayoutFeePct: 0,
}

function makeBavInstance(overrides: Partial<BavInstance> = {}): BavInstance {
  return {
    instanceId: 'bav-1',
    ...INSTANCE_COMMON,
    monthlyGrossConversion: 200,
    statutoryMinimumSubsidyEnabled: true,
    contractualMatchPercent: 0,
    contractualFixedMonthly: 0,
    fees: NEUTRALISED_FEES,
    monthlyOtherRetirementIncome: 0,
    includeGrvReduction: false,
    kvdrMember: true,
    durchfuehrungsweg: 'direktversicherung_3_63',
    pre2005EligibleTaxFree: false,
    payoutMode: 'leibrente',
    rentenfaktor: 30,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    annualContributionGrowthRate: 0,
    ...overrides,
  } as BavInstance
}

function makeBasisrenteInstance(overrides: Partial<BasisrenteInstance> = {}): BasisrenteInstance {
  return {
    instanceId: 'basisrente-1',
    ...INSTANCE_COMMON,
    monthlyGrossContribution: 0,
    fees: NEUTRALISED_FEES,
    payoutMode: 'leibrente',
    rentenfaktor: 30,
    rentenfaktorConfirmed: false,
    monthlyOtherRetirementIncome: 0,
    ...overrides,
  } as BasisrenteInstance
}

function makeRiesterInstance(overrides: Partial<RiesterInstance> = {}): RiesterInstance {
  return {
    instanceId: 'riester-1',
    ...INSTANCE_COMMON,
    monthlyOwnContribution: 0,
    existingCapital: 0,
    eligibility: {
      directlyEligible: true,
      ageAtContractStart: 28,
      careerStarterBonusUsed: false,
    },
    capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
    fees: NEUTRALISED_FEES,
    payoutMode: 'leibrente',
    rentenfaktor: 30,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    partialCapitalPct: 0,
    monthlyOtherRetirementIncome: 0,
    ...overrides,
  } as RiesterInstance
}

function makeAvdInstance(overrides: Partial<AltersvorsorgedepotInstance> = {}): AltersvorsorgedepotInstance {
  return {
    instanceId: 'avd-1',
    ...INSTANCE_COMMON,
    subtype: 'standarddepot',
    monthlyOwnContribution: 0,
    eligibility: {
      directlyEligible: true,
      indirectSpouseEligible: false,
      eligibleChildren: 0,
      ageAtContractStart: 28,
      careerStarterBonusUsed: false,
    },
    riskAllocationPct: 0.8,
    riskAnnualReturn: 0.05,
    lowRiskAnnualReturn: 0.02,
    fees: NEUTRALISED_FEES,
    payoutMode: 'certified_payout_plan',
    payoutPlanEndAge: 85,
    partialCapitalPct: 0,
    transferCostEUR: 0,
    riesterTransferCapital: 0,
    monthlyOtherRetirementIncome: 0,
    rentenfaktor: 28,
    ...overrides,
  } as AltersvorsorgedepotInstance
}

/** Minimal stub workspace for rules that need combinedResult + workspace */
function makeWorkspace(overrides: {
  bav?: BavInstance[]
  basisrente?: BasisrenteInstance[]
  riester?: RiesterInstance[]
  altersvorsorgedepot?: AltersvorsorgedepotInstance[]
  etf?: EtfInstance[]
  grossSalaryYear?: number
  hasPartner?: boolean
}): Workspace {
  const {
    bav = [],
    basisrente = [],
    riester = [],
    altersvorsorgedepot = [],
    etf = [],
    grossSalaryYear = 75_000,
    hasPartner = false,
  } = overrides

  const partnerProfile = hasPartner
    ? {
        age: 34,
        retirementAge: 67,
        grossSalaryYear: 50_000,
        taxClass: 1 as const,
        childBirthYears: [],
        churchTax: false,
        publicHealthInsurance: true,
        healthAdditionalContributionPct: 2.9,
        pkvMonthlyPremium: 0,
        pPVMonthlyPremium: 0,
        desiredNetMonthlyPension: 0,
      }
    : undefined

  return {
    schemaVersion: 2,
    mode: 'combine',
    baseline: {
      id: 'baseline',
      label: 'Basis',
      profile: {
        age: 35,
        retirementAge: 67,
        grossSalaryYear,
        taxClass: 1 as const,
        childBirthYears: [],
        churchTax: false,
        publicHealthInsurance: true,
        healthAdditionalContributionPct: 2.9,
        pkvMonthlyPremium: 0,
        pPVMonthlyPremium: 0,
        desiredNetMonthlyPension: 0,
      },
      partner: partnerProfile,
      assumptions: {
        bav,
        etf,
        insurance: [] as InsuranceInstance[],
        basisrente,
        altersvorsorgedepot,
        riester,
        statutoryPension: {
          pensionBaselineType: 'grv' as const,
          manualMonthlyGross: null,
          currentEntgeltpunkte: 20,
          includeGrvReduction: false,
        },
        inflationRate: 0.02,
        retirementEndAge: 90,
        returnScenarios: [{ id: 'basis' as const, label: 'Basis', annualReturn: 0.05 }],
        monteCarlo: { enabled: false, runs: 500, annualVolatility: 0.15, seed: 42 },
        visibleProducts: [],
      },
      createdAt: '2026-01-01T00:00:00Z',
      origin: 'baseline' as const,
    },
    whatIfs: [],
    pinnedComparisonIds: [],
  }
}

function makeCapInput(
  workspaceOverrides: Parameters<typeof makeWorkspace>[0],
  products: ProductResult[] = [],
): RuleEngineInput {
  return {
    workspace: makeWorkspace(workspaceOverrides),
    simulationResult: { products },
    combinedResult: makeCombinedResult(),
  }
}

// ---------------------------------------------------------------------------
// bav_cap_remaining
// ---------------------------------------------------------------------------

describe('bav_cap_remaining rule', () => {
  it('returns null when combinedResult is absent (compare-mode)', () => {
    const input: RuleEngineInput = {
      simulationResult: { products: [] },
    }
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'bav_cap_remaining')).toBe(false)
  })

  it('empty workspace → usedPct: 0, remainingMonthly = cap / 12', () => {
    const input = makeCapInput({})
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'bav_cap_remaining')
    expect(atom).toBeDefined()
    expect(ctxNumber(atom!.context, 'usedPct')).toBe(0)
    expect(ctxNumber(atom!.context, 'remainingMonthly')).toBeCloseTo(BAV_CAP_MONTHLY, 2)
    expect(atom!.priority).toBe('medium')
    expect(atom!.context['nextLeverProductId']).toBeUndefined()
  })

  it('Bernd-shape: usedPct ≈ 0.65 when monthly gross ≈ 65% of cap', () => {
    // BAV_CAP_MONTHLY = 676. 440/676 ≈ 0.651
    const bavInst = makeBavInstance({ instanceId: 'bav-bernd', monthlyGrossConversion: 440 })
    const input = makeCapInput({ bav: [bavInst] })
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'bav_cap_remaining')!
    expect(atom).toBeDefined()
    const usedPct = ctxNumber(atom.context, 'usedPct')
    expect(usedPct).toBeGreaterThan(0.64)
    expect(usedPct).toBeLessThan(0.67)
    expect(ctxNumber(atom.context, 'remainingMonthly')).toBeCloseTo(BAV_CAP_MONTHLY - 440, 2)
    expect(atom.priority).toBe('medium')
  })

  it('Jens-shape: usedPct: 1.0 when at cap, nextLeverProductId set, priority high', () => {
    const bavInst = makeBavInstance({ instanceId: 'bav-jens', monthlyGrossConversion: BAV_CAP_MONTHLY })
    const input = makeCapInput({ bav: [bavInst] })
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'bav_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBe(1)
    expect(ctxNumber(atom.context, 'remainingMonthly')).toBeCloseTo(0, 2)
    expect(atom.context['nextLeverProductId']).toBe('basisrente')
    expect(atom.priority).toBe('high')
  })

  it('over-cap clamps usedPct to 1.0', () => {
    const bavInst = makeBavInstance({ monthlyGrossConversion: BAV_CAP_MONTHLY * 2 })
    const input = makeCapInput({ bav: [bavInst] })
    const atom = runRules(input).find((a) => a.id === 'bav_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBe(1)
  })

  it('surrendered instances are excluded', () => {
    const active = makeBavInstance({ instanceId: 'bav-active', monthlyGrossConversion: 200 })
    const surrendered = makeBavInstance({ instanceId: 'bav-gone', status: 'surrendered', monthlyGrossConversion: 800 })
    const input = makeCapInput({ bav: [active, surrendered] })
    const atom = runRules(input).find((a) => a.id === 'bav_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBeCloseTo(200 * 12 / (BAV_CAP_MONTHLY * 12), 4)
  })

  it('single-instance and multi-instance with same total → identical usedPct', () => {
    const single = makeBavInstance({ instanceId: 'bav-s', monthlyGrossConversion: 300 })
    const multiA = makeBavInstance({ instanceId: 'bav-a', monthlyGrossConversion: 150 })
    const multiB = makeBavInstance({ instanceId: 'bav-b', monthlyGrossConversion: 150 })

    const inputSingle = makeCapInput({ bav: [single] })
    const inputMulti = makeCapInput({ bav: [multiA, multiB] })

    const atomSingle = runRules(inputSingle).find((a) => a.id === 'bav_cap_remaining')!
    const atomMulti = runRules(inputMulti).find((a) => a.id === 'bav_cap_remaining')!

    expect(ctxNumber(atomSingle.context, 'usedPct')).toBeCloseTo(ctxNumber(atomMulti.context, 'usedPct'), 6)
    expect(ctxNumber(atomSingle.context, 'remainingMonthly')).toBeCloseTo(
      ctxNumber(atomMulti.context, 'remainingMonthly'), 6,
    )
  })
})

// ---------------------------------------------------------------------------
// basisrente_cap_remaining
// ---------------------------------------------------------------------------

describe('basisrente_cap_remaining rule', () => {
  it('returns null in compare-mode (no combinedResult)', () => {
    const input: RuleEngineInput = { simulationResult: { products: [] } }
    expect(runRules(input).some((a) => a.id === 'basisrente_cap_remaining')).toBe(false)
  })

  it('empty workspace → usedPct includes pension contributions, no Basisrente own contributions', () => {
    const input = makeCapInput({ grossSalaryYear: 75_000 })
    const atom = runRules(input).find((a) => a.id === 'basisrente_cap_remaining')!
    expect(atom).toBeDefined()
    // usedPct > 0 because GRV contributions count toward the Schicht-1 cap
    expect(ctxNumber(atom.context, 'usedPct')).toBeGreaterThan(0)
    // No Basisrente contributions → remainingAnnual = schicht1Cap - grvContribs
    const schicht1Cap = de2026Rules.basisrente.schicht1CapSingle
    const pensionBase = Math.min(75_000, de2026Rules.socialSecurity.pensionCapYear)
    const grvTotal = pensionBase * (de2026Rules.socialSecurity.pensionEmployeeRate + de2026Rules.socialSecurity.pensionEmployerRate)
    const expected = Math.max(0, schicht1Cap - grvTotal)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBeCloseTo(expected, 1)
  })

  it('Jens-shape: basisrente at 0 while bAV full → usedPct reflects only GRV contributions', () => {
    const bavInst = makeBavInstance({ monthlyGrossConversion: BAV_CAP_MONTHLY })
    const basInst = makeBasisrenteInstance({ monthlyGrossContribution: 0 })
    const input = makeCapInput({ bav: [bavInst], basisrente: [basInst] })
    const atom = runRules(input).find((a) => a.id === 'basisrente_cap_remaining')!
    expect(atom).toBeDefined()
    // usedPct should not be 1 since Basisrente contributions are zero
    expect(ctxNumber(atom.context, 'usedPct')).toBeLessThan(1)
  })

  it('at schicht-1 cap → usedPct clamped at 1', () => {
    // Gross salary = 0 (no GRV contribution); Basisrente contribution fills the entire cap
    const basInst = makeBasisrenteInstance({
      monthlyGrossContribution: de2026Rules.basisrente.schicht1CapSingle / 12,
    })
    const input = makeCapInput({ grossSalaryYear: 0, basisrente: [basInst] })
    const atom = runRules(input).find((a) => a.id === 'basisrente_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBe(1)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// riester_cap_remaining
// ---------------------------------------------------------------------------

describe('riester_cap_remaining rule', () => {
  it('returns null in compare-mode', () => {
    const input: RuleEngineInput = { simulationResult: { products: [] } }
    expect(runRules(input).some((a) => a.id === 'riester_cap_remaining')).toBe(false)
  })

  it('empty workspace (no Riester instances) → usedPct: 0, topUpToCap = cap', () => {
    const input = makeCapInput({})
    const atom = runRules(input).find((a) => a.id === 'riester_cap_remaining')!
    expect(atom).toBeDefined()
    expect(ctxNumber(atom.context, 'usedPct')).toBe(0)
    expect(ctxNumber(atom.context, 'topUpToCap')).toBeCloseTo(de2026Rules.riester.annualCapInclAllowances, 2)
    expect(ctxNumber(atom.context, 'allowanceCovered')).toBe(0)
  })

  it('Riester instance with direct eligibility: allowanceCovered includes Grundzulage', () => {
    const riesterInst = makeRiesterInstance({ monthlyOwnContribution: 100 })
    const input = makeCapInput({ riester: [riesterInst] })
    const atom = runRules(input).find((a) => a.id === 'riester_cap_remaining')!
    // Directly eligible: allowanceCovered = grundzulage (175 EUR)
    expect(ctxNumber(atom.context, 'allowanceCovered')).toBe(de2026Rules.riester.grundzulage)
    // own = 100×12 = 1200; allowance = 175; total = 1375; cap = 2100; topUp = 2100 - 1200 - 175 = 725
    expect(ctxNumber(atom.context, 'topUpToCap')).toBeCloseTo(
      de2026Rules.riester.annualCapInclAllowances - 100 * 12 - de2026Rules.riester.grundzulage, 1,
    )
  })

  it('at full cap → usedPct: 1, topUpToCap: 0, priority high', () => {
    const ownMonthly = (de2026Rules.riester.annualCapInclAllowances - de2026Rules.riester.grundzulage) / 12
    const riesterInst = makeRiesterInstance({ monthlyOwnContribution: ownMonthly })
    const input = makeCapInput({ riester: [riesterInst] })
    const atom = runRules(input).find((a) => a.id === 'riester_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBeCloseTo(1, 4)
    expect(ctxNumber(atom.context, 'topUpToCap')).toBeCloseTo(0, 4)
    expect(atom.priority).toBe('high')
  })

  it('BLOCKER: two Riester instances both directlyEligible → allowanceCovered = ONE Grundzulage (not doubled)', () => {
    // Regression: V1 single-person assumption — all instances belong to the same person.
    const inst1 = makeRiesterInstance({
      instanceId: 'riester-1',
      eligibility: { directlyEligible: true, ageAtContractStart: 28, careerStarterBonusUsed: false },
      monthlyOwnContribution: 50,
    })
    const inst2 = makeRiesterInstance({
      instanceId: 'riester-2',
      eligibility: { directlyEligible: true, ageAtContractStart: 30, careerStarterBonusUsed: false },
      monthlyOwnContribution: 50,
    })
    const input = makeCapInput({ riester: [inst1, inst2] })
    const atom = runRules(input).find((a) => a.id === 'riester_cap_remaining')!
    // Must equal ONE Grundzulage, not 2×175 = 350
    expect(ctxNumber(atom.context, 'allowanceCovered')).toBe(de2026Rules.riester.grundzulage)
  })

  it('one Riester instance directlyEligible → allowanceCovered = Grundzulage (unchanged)', () => {
    const inst = makeRiesterInstance({ monthlyOwnContribution: 50 })
    const input = makeCapInput({ riester: [inst] })
    const atom = runRules(input).find((a) => a.id === 'riester_cap_remaining')!
    expect(ctxNumber(atom.context, 'allowanceCovered')).toBe(de2026Rules.riester.grundzulage)
  })

  it('N3/Karin-shape: directlyEligible + two children born 2010 and 2014 → allowanceCovered = 175 + 2 × 300 = 775', () => {
    // childBirthYears [2010, 2014]: both ≥ 2008 → childAllowancePost2007 (€300 each)
    const inst = makeRiesterInstance({ monthlyOwnContribution: 50 })
    // Override workspace so profile has two children born 2010 and 2014
    const ws = makeWorkspace({ riester: [inst] })
    const wsWithChildren = {
      ...ws,
      baseline: {
        ...ws.baseline,
        profile: { ...ws.baseline.profile, childBirthYears: [2010, 2014] },
      },
    }
    const input: RuleEngineInput = {
      workspace: wsWithChildren,
      simulationResult: { products: [] },
      combinedResult: makeCombinedResult(),
    }
    const atom = runRules(input).find((a) => a.id === 'riester_cap_remaining')!
    expect(ctxNumber(atom.context, 'allowanceCovered')).toBe(
      de2026Rules.riester.grundzulage + 2 * de2026Rules.riester.childAllowancePost2007,
    )
    // 175 + 300 + 300 = 775
    expect(ctxNumber(atom.context, 'allowanceCovered')).toBe(775)
  })
})

// ---------------------------------------------------------------------------
// avd_cap_remaining
// ---------------------------------------------------------------------------

describe('avd_cap_remaining rule', () => {
  it('returns null in compare-mode', () => {
    const input: RuleEngineInput = { simulationResult: { products: [] } }
    expect(runRules(input).some((a) => a.id === 'avd_cap_remaining')).toBe(false)
  })

  it('empty workspace (zero AVD instances) → zero avd_cap_remaining atoms', () => {
    // Per-instance semantics: no contract → nothing to report.
    const input = makeCapInput({})
    const avdAtoms = runRules(input).filter((a) => a.id === 'avd_cap_remaining')
    expect(avdAtoms).toHaveLength(0)
  })

  it('AVD instance with own contribution shows correct usedPct and instanceId in context', () => {
    const avdInst = makeAvdInstance({ instanceId: 'avd-test', monthlyOwnContribution: 200 })
    const input = makeCapInput({ altersvorsorgedepot: [avdInst] })
    const atoms = runRules(input).filter((a) => a.id === 'avd_cap_remaining')
    expect(atoms).toHaveLength(1)
    const atom = atoms[0]
    const capMonthly = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual / 12
    expect(ctxNumber(atom.context, 'usedPct')).toBeCloseTo(200 / capMonthly, 4)
    expect(ctxNumber(atom.context, 'remainingMonthly')).toBeCloseTo(capMonthly - 200, 2)
    expect(atom.context['instanceId']).toBe('avd-test')
  })

  it('at cap → usedPct: 1, priority high', () => {
    const capMonthly = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual / 12
    const avdInst = makeAvdInstance({ monthlyOwnContribution: capMonthly })
    const input = makeCapInput({ altersvorsorgedepot: [avdInst] })
    const atom = runRules(input).find((a) => a.id === 'avd_cap_remaining')!
    expect(ctxNumber(atom.context, 'usedPct')).toBe(1)
    expect(atom.priority).toBe('high')
  })

  it('two AVD instances → two atoms, each against its own cap (per-contract semantics)', () => {
    const capMonthly = de2026Rules.altersvorsorgedepot.contractContributionCapAnnual / 12
    const avd1 = makeAvdInstance({ instanceId: 'avd-1', monthlyOwnContribution: 200 })
    const avd2 = makeAvdInstance({ instanceId: 'avd-2', monthlyOwnContribution: capMonthly })
    const input = makeCapInput({ altersvorsorgedepot: [avd1, avd2] })
    const atoms = runRules(input).filter((a) => a.id === 'avd_cap_remaining')
    expect(atoms).toHaveLength(2)
    const atom1 = atoms.find((a) => a.context['instanceId'] === 'avd-1')!
    const atom2 = atoms.find((a) => a.context['instanceId'] === 'avd-2')!
    expect(ctxNumber(atom1.context, 'usedPct')).toBeCloseTo(200 / capMonthly, 4)
    expect(ctxNumber(atom2.context, 'usedPct')).toBe(1)
    expect(atom2.priority).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// sparerpauschbetrag_remaining
// ---------------------------------------------------------------------------

describe('sparerpauschbetrag_remaining rule', () => {
  it('returns null in compare-mode', () => {
    const input: RuleEngineInput = { simulationResult: { products: [] } }
    expect(runRules(input).some((a) => a.id === 'sparerpauschbetrag_remaining')).toBe(false)
  })

  it('empty workspace (no ETF/AVD products) → usedPct: 0, remainingAnnual = 1000 (single)', () => {
    const input = makeCapInput({})
    const atom = runRules(input).find((a) => a.id === 'sparerpauschbetrag_remaining')!
    expect(atom).toBeDefined()
    expect(ctxNumber(atom.context, 'usedAnnual')).toBe(0)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(de2026Rules.capitalGains.saverAllowance)
    expect(atom.context['married']).toBe(false)
  })

  it('married workspace → cap = 2000 EUR', () => {
    const input = makeCapInput({ hasPartner: true })
    const atom = runRules(input).find((a) => a.id === 'sparerpauschbetrag_remaining')!
    expect(atom.context['married']).toBe(true)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(de2026Rules.capitalGains.saverAllowance * 2)
  })

  it('ETF product with payout row uses saverAllowanceUsed', () => {
    const etfProduct = makeResult({
      productId: 'etf',
      label: 'ETF',
      etfPayoutRows: [
        {
          year: 1, age: 67, capitalAtStart: 200_000,
          grossAnnualPayout: 12_000, taxableGain: 5_000,
          saverAllowanceUsed: 800, taxDue: 1_050,
          netAnnualPayout: 10_950, netMonthlyPayout: 912.5,
          capitalAtEnd: 192_000, remainingCostBasis: 80_000,
        },
      ],
    })
    const input = makeCapInput({}, [etfProduct])
    const atom = runRules(input).find((a) => a.id === 'sparerpauschbetrag_remaining')!
    expect(ctxNumber(atom.context, 'usedAnnual')).toBe(800)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(de2026Rules.capitalGains.saverAllowance - 800)
  })

  it('ETF product with accumulation rows uses first-year cumulativeVorabpauschale', () => {
    const etfProduct = makeResult({
      productId: 'etf',
      label: 'ETF',
      etfPayoutRows: [],
      rows: [
        {
          year: 2026, age: 36, productId: 'etf', scenarioId: 'basis',
          balance: 50_000, realBalance: 45_000, yearlyUserCost: 2_400,
          yearlyProductContribution: 2_400, yearlyEmployerContribution: 0,
          yearlyFees: 100, cumulativeFees: 100, cumulativeProductContributions: 2_400,
          cumulativeVorabpauschale: 350,
        },
      ],
    })
    const input = makeCapInput({}, [etfProduct])
    const atom = runRules(input).find((a) => a.id === 'sparerpauschbetrag_remaining')!
    expect(ctxNumber(atom.context, 'usedAnnual')).toBe(350)
    expect(ctxNumber(atom.context, 'remainingAnnual')).toBe(de2026Rules.capitalGains.saverAllowance - 350)
  })
})

// ---------------------------------------------------------------------------
// renderAtom snapshots — extend for new cap atom IDs
// ---------------------------------------------------------------------------

describe('renderAtom snapshots — cap atoms', () => {
  const capAtoms: Atom[] = [
    {
      id: 'bav_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0.65, remainingMonthly: 236, nextLeverProductId: undefined },
    },
    {
      id: 'bav_cap_remaining',
      priority: 'high',
      context: { usedPct: 1.0, remainingMonthly: 0, nextLeverProductId: 'basisrente' },
    },
    {
      id: 'basisrente_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0.3, remainingAnnual: 15_000 },
    },
    {
      id: 'riester_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0.5, allowanceCovered: 175, topUpToCap: 750 },
    },
    {
      id: 'riester_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0, allowanceCovered: 0, topUpToCap: 2_100 },
    },
    {
      id: 'avd_cap_remaining',
      priority: 'medium',
      context: { usedPct: 0.35, remainingMonthly: 370 },
    },
    {
      id: 'sparerpauschbetrag_remaining',
      priority: 'medium',
      context: { usedAnnual: 0, remainingAnnual: 1_000, married: false },
    },
    {
      id: 'sparerpauschbetrag_remaining',
      priority: 'medium',
      context: { usedAnnual: 400, remainingAnnual: 1_600, married: true },
    },
  ]

  it('renderAtom output matches snapshot for cap atom ids', () => {
    const snapshot = capAtoms.map((a) => ({ id: a.id, context: a.context, rendered: renderAtom(a) }))
    expect(snapshot).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Vintage-detection rule helpers
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear()

/**
 * Build a minimal Workspace-backed RuleEngineInput for vintage rule tests.
 * Overrides baseline.profile and baseline.assumptions with the provided data.
 */
function makeWorkspaceInput(
  assumptionsOverride: Partial<WorkspaceAssumptionsV2>,
  profileOverride: Partial<Scenario['profile']> = {},
): RuleEngineInput {
  const base = defaultWorkspace
  const workspace: Workspace = {
    ...base,
    baseline: {
      ...base.baseline,
      profile: { ...base.baseline.profile, ...profileOverride },
      assumptions: {
        ...base.baseline.assumptions,
        ...assumptionsOverride,
      },
    },
  }
  return { workspace, simulationResult: { products: [] } }
}

function makeInsuranceInstance(overrides: Partial<InsuranceInstance>): InsuranceInstance {
  const base = defaultWorkspace.baseline.assumptions.insurance[0]
  return { ...base, instanceId: 'test-pav-1', ...overrides }
}

function makeVintageBavInstance(overrides: Partial<BavInstance>): BavInstance {
  const base = defaultWorkspace.baseline.assumptions.bav[0]
  return { ...base, instanceId: 'test-bav-1', ...overrides }
}

function makeVintageRiesterInstance(overrides: Partial<RiesterInstance>): RiesterInstance {
  const base = defaultWorkspace.baseline.assumptions.riester[0] ?? {
    instanceId: 'test-riester-1',
    label: 'Riester #1',
    status: 'active' as const,
    contractStartYear: CURRENT_YEAR,
    currentValueEUR: 0,
    evidenceMap: {},
    monthlyOwnContribution: 100,
    existingCapital: 0,
    eligibility: {
      directlyEligible: true,
      ageAtContractStart: 25,
      careerStarterBonusUsed: false,
    },
    capitalGuarantee: { enabled: false, guaranteePct: 0 },
    fees: {
      wrapperAssetFee: 0.008,
      fundAssetFee: 0,
      contributionFee: 0,
      fixedMonthlyFee: 0,
      acquisitionCostPct: 0,
      acquisitionCostSpreadYears: 5,
      pensionPayoutFeePct: 0,
    },
    payoutMode: 'leibrente' as const,
    rentenfaktor: 25,
    rentenfaktorConfirmed: false,
    zeitrenteYears: 20,
    partialCapitalPct: 0,
    monthlyOtherRetirementIncome: 0,
  }
  return { ...base, instanceId: 'test-riester-1', ...overrides }
}

// ---------------------------------------------------------------------------
// pAV vintage rules
// ---------------------------------------------------------------------------

describe('pAV vintage rules', () => {
  // Karin shape: contractStartYear 2002, retirement at 65, current age 40
  // payoutYear = CURRENT_YEAR + (65 - 40) = CURRENT_YEAR + 25
  // runtime = CURRENT_YEAR + 25 - 2002 ≥ 12 → pre2005 fires
  it('Karin shape (2002 contract, age 40, retirement 65) → pre_2005_pav_taxfree_capital fires', () => {
    const inst = makeInsuranceInstance({ contractStartYear: 2002 })
    const input = makeWorkspaceInput(
      { insurance: [inst] },
      { age: 40, retirementAge: 65 },
    )
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_taxfree_capital' && a.context.instanceId === 'test-pav-1')).toBe(true)
  })

  it('Karin shape → pre_2005_pav_high_garantiezins fires (contractStartYear 2002 ≤ 2003)', () => {
    const inst = makeInsuranceInstance({ contractStartYear: 2002 })
    const input = makeWorkspaceInput({ insurance: [inst] }, { age: 40, retirementAge: 65 })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_high_garantiezins' && a.context.instanceId === 'test-pav-1')).toBe(true)
  })

  it('2004 contract with sufficient runtime → pre_2005_pav_taxfree_capital (not high_garantiezins)', () => {
    // contractStartYear 2004 < 2005 → pre2005 if runtime ≥ 12
    // 2004 > 2003 → high_garantiezins must NOT fire
    const inst = makeInsuranceInstance({ contractStartYear: 2004 })
    const input = makeWorkspaceInput({ insurance: [inst] }, { age: 40, retirementAge: 65 })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_taxfree_capital')).toBe(true)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_high_garantiezins')).toBe(false)
  })

  it('2003 contract → high_garantiezins fires', () => {
    const inst = makeInsuranceInstance({ contractStartYear: 2003 })
    const input = makeWorkspaceInput({ insurance: [inst] }, { age: 40, retirementAge: 65 })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_high_garantiezins')).toBe(true)
  })

  it('2005 contract (post-2004 boundary) with runtime ≥ 12, age ≥ 60 → halbeinkuenfte (not pre2005)', () => {
    const inst = makeInsuranceInstance({ contractStartYear: 2005 })
    // age 58, retirement 60 → payoutYear = CURRENT_YEAR + 2; runtime = CURRENT_YEAR + 2 - 2005 ≥ 12; retirementAge 60 meets the pre-2012 threshold.
    const input = makeWorkspaceInput({ insurance: [inst] }, { age: 58, retirementAge: 60 })
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'halbeinkuenfte_pav_eligible')
    expect(atom).toBeDefined()
    expect(atom?.context.minPayoutAge).toBe(60)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_taxfree_capital')).toBe(false)
  })

  it('2012 contract with runtime ≥ 12 and retirementAge 60 → no halbeinkuenfte privilege', () => {
    const inst = makeInsuranceInstance({ contractStartYear: 2012 })
    // age 58, retirement 60 → payoutYear = CURRENT_YEAR + 2; runtime = CURRENT_YEAR + 2 - 2012 ≥ 12, but post-2011 contracts need age 62.
    const input = makeWorkspaceInput({ insurance: [inst] }, { age: 58, retirementAge: 60 })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'halbeinkuenfte_pav_eligible')).toBe(false)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_taxfree_capital')).toBe(false)
  })

  it('2010 contract with runtime < 12 → no privilege chip (abgeltungsteuer)', () => {
    // age 57, retirement 62 → payoutYear = CURRENT_YEAR + 5; runtime = CURRENT_YEAR + 5 - 2010 = 5 + (CURRENT_YEAR-2010)
    // CURRENT_YEAR=2026 → runtime = 5+16 = 21 ≥ 12. Need a contract where runtime < 12 at retirement.
    // age 59, retirement 62 → payoutYear = CURRENT_YEAR + 3; runtime = 2026+3-2022 = 7 < 12 for contractStartYear=2022
    const inst = makeInsuranceInstance({ contractStartYear: 2022 })
    const input = makeWorkspaceInput({ insurance: [inst] }, { age: 59, retirementAge: 62 })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'halbeinkuenfte_pav_eligible')).toBe(false)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_taxfree_capital')).toBe(false)
  })

  it('B1 regression: 2002 contract + oldContractTaxFreeEligible=false → no pre_2005_pav_taxfree_capital (routes to abgeltungsteuer/halbeinkuenfte)', () => {
    const inst = makeInsuranceInstance({ contractStartYear: 2002, oldContractTaxFreeEligible: false })
    const input = makeWorkspaceInput(
      { insurance: [inst] },
      { age: 40, retirementAge: 65 },
    )
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_taxfree_capital')).toBe(false)
    // Without pre2005 eligibility, a 2002 contract still qualifies for halbeinkuenfte
    // (runtime ≥ 12 and retirementAge ≥ 60)
    expect(atoms.some((a) => a.id === 'halbeinkuenfte_pav_eligible')).toBe(true)
  })

  it('B1 regression: 2002 contract + oldContractTaxFreeEligible=true (Karin) → pre_2005_pav_taxfree_capital fires', () => {
    const inst = makeInsuranceInstance({ contractStartYear: 2002, oldContractTaxFreeEligible: true })
    const input = makeWorkspaceInput(
      { insurance: [inst] },
      { age: 40, retirementAge: 65 },
    )
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_taxfree_capital')).toBe(true)
  })

  it('no pAV instances → no vintage pAV atoms', () => {
    const input = makeWorkspaceInput({ insurance: [] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'pre_2005_pav_taxfree_capital')).toBe(false)
    expect(atoms.some((a) => a.id === 'halbeinkuenfte_pav_eligible')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// bAV vintage rules
// ---------------------------------------------------------------------------

describe('bAV vintage rules', () => {
  it('direktversicherung_40b_alt + pre2005EligibleTaxFree=true → bav_40b_alt_eligible', () => {
    const inst = makeVintageBavInstance({
      durchfuehrungsweg: 'direktversicherung_40b_alt',
      pre2005EligibleTaxFree: true,
    })
    const input = makeWorkspaceInput({ bav: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'bav_40b_alt_eligible' && a.context.instanceId === 'test-bav-1')).toBe(true)
    expect(atoms.some((a) => a.id === 'bav_40b_alt_conditions_unmet')).toBe(false)
  })

  it('direktversicherung_40b_alt + pre2005EligibleTaxFree=false → bav_40b_alt_conditions_unmet', () => {
    const inst = makeVintageBavInstance({
      durchfuehrungsweg: 'direktversicherung_40b_alt',
      pre2005EligibleTaxFree: false,
    })
    const input = makeWorkspaceInput({ bav: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'bav_40b_alt_conditions_unmet' && a.context.instanceId === 'test-bav-1')).toBe(true)
    expect(atoms.some((a) => a.id === 'bav_40b_alt_eligible')).toBe(false)
  })

  it('direktversicherung_3_63 → neither §40b atom fires', () => {
    const inst = makeVintageBavInstance({ durchfuehrungsweg: 'direktversicherung_3_63' })
    const input = makeWorkspaceInput({ bav: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'bav_40b_alt_eligible')).toBe(false)
    expect(atoms.some((a) => a.id === 'bav_40b_alt_conditions_unmet')).toBe(false)
  })

  it('direktzusage → bav_durchfuehrungsweg_direktzusage fires', () => {
    const inst = makeVintageBavInstance({ durchfuehrungsweg: 'direktzusage' })
    const input = makeWorkspaceInput({ bav: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'bav_durchfuehrungsweg_direktzusage')).toBe(true)
  })

  it('unterstuetzungskasse → bav_durchfuehrungsweg_direktzusage fires', () => {
    const inst = makeVintageBavInstance({ durchfuehrungsweg: 'unterstuetzungskasse' })
    const input = makeWorkspaceInput({ bav: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'bav_durchfuehrungsweg_direktzusage')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Riester vintage rules
// ---------------------------------------------------------------------------

describe('Riester vintage rules', () => {
  it('pre-2008 Riester + child born 2009 → riester_pre_2008_zulage fires', () => {
    const inst = makeVintageRiesterInstance({ contractStartYear: 2006 })
    const input = makeWorkspaceInput(
      { riester: [inst] },
      { childBirthYears: [2009] },
    )
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'riester_pre_2008_zulage' && a.context.instanceId === 'test-riester-1')).toBe(true)
  })

  it('2007 boundary contract + post-2008 child → fires', () => {
    const inst = makeVintageRiesterInstance({ contractStartYear: 2007 })
    const input = makeWorkspaceInput({ riester: [inst] }, { childBirthYears: [2010] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'riester_pre_2008_zulage')).toBe(true)
  })

  it('2008 contract → does NOT fire', () => {
    const inst = makeVintageRiesterInstance({ contractStartYear: 2008 })
    const input = makeWorkspaceInput({ riester: [inst] }, { childBirthYears: [2010] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'riester_pre_2008_zulage')).toBe(false)
  })

  it('pre-2008 contract + only pre-2008 children → does NOT fire', () => {
    const inst = makeVintageRiesterInstance({ contractStartYear: 2005 })
    const input = makeWorkspaceInput({ riester: [inst] }, { childBirthYears: [2004, 2007] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'riester_pre_2008_zulage')).toBe(false)
  })

  it('no Riester instances → no riester_pre_2008_zulage atom', () => {
    const input = makeWorkspaceInput({ riester: [] }, { childBirthYears: [2010] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'riester_pre_2008_zulage')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// renderAtom snapshot — extended for vintage atom ids
// ---------------------------------------------------------------------------

describe('renderAtom snapshots — vintage atoms', () => {
  const vintageAtoms: Atom[] = [
    {
      id: 'pre_2005_pav_taxfree_capital',
      priority: 'high',
      context: { instanceId: 'pav-1', contractStartYear: 2002, runtimeYearsAtRetirement: 37, productId: 'versicherung' },
    },
    {
      id: 'halbeinkuenfte_pav_eligible',
      priority: 'medium',
      context: { instanceId: 'pav-2', contractStartYear: 2008, runtimeYearsAtRetirement: 24, minPayoutAge: 60, productId: 'versicherung' },
    },
    {
      id: 'pre_2005_pav_high_garantiezins',
      priority: 'medium',
      context: { instanceId: 'pav-1', productId: 'versicherung' },
    },
    {
      id: 'bav_40b_alt_eligible',
      priority: 'high',
      context: { instanceId: 'bav-1', productId: 'bav' },
    },
    {
      id: 'bav_40b_alt_conditions_unmet',
      priority: 'medium',
      context: { instanceId: 'bav-2', productId: 'bav' },
    },
    {
      id: 'bav_durchfuehrungsweg_direktzusage',
      priority: 'low',
      context: { instanceId: 'bav-3', durchfuehrungsweg: 'direktzusage', productId: 'bav' },
    },
    {
      id: 'riester_pre_2008_zulage',
      priority: 'medium',
      context: { instanceId: 'riester-1', productId: 'riester' },
    },
  ]

  it('renderAtom output matches snapshot for all vintage atom ids', () => {
    const snapshot = vintageAtoms.map((a) => ({ id: a.id, rendered: renderAtom(a) }))
    expect(snapshot).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// Audit-flag rules (issue B3)
// ---------------------------------------------------------------------------

const HIGH_FEES = {
  wrapperAssetFee: 0.01,
  fundAssetFee: 0.006, // total = 0.016 > 0.012
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 5,
  pensionPayoutFeePct: 0,
}

const LOW_FEES = {
  wrapperAssetFee: 0.003,
  fundAssetFee: 0.002, // total = 0.005 < 0.012
  contributionFee: 0,
  fixedMonthlyFee: 0,
  acquisitionCostPct: 0,
  acquisitionCostSpreadYears: 5,
  pensionPayoutFeePct: 0,
}

// ---------------------------------------------------------------------------
// high_cost_active
// ---------------------------------------------------------------------------

describe('high_cost_active rule', () => {
  it('positive: active bAV with high fees → emits high_cost_active', () => {
    const inst = makeBavInstance({ instanceId: 'bav-highcost', fees: HIGH_FEES })
    const input = makeCapInput({ bav: [inst] })
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'high_cost_active' && a.context.instanceId === 'bav-highcost')
    expect(atom).toBeDefined()
    expect(atom!.priority).toBe('medium')
    expect(typeof atom!.context['riyDecimal']).toBe('number')
    expect((atom!.context['riyDecimal'] as number)).toBeGreaterThan(0.012)
  })

  it('negative: active bAV with low fees → no high_cost_active', () => {
    const inst = makeBavInstance({ instanceId: 'bav-cheap', fees: LOW_FEES })
    const input = makeCapInput({ bav: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'high_cost_active')).toBe(false)
  })

  it('positive: active insurance instance with high fees → emits high_cost_active', () => {
    const inst = makeInsuranceInstance({
      instanceId: 'versicherung-highcost',
      fees: HIGH_FEES,
      status: 'active',
      capitalGuarantee: { enabled: false, floorPctOfContributions: 0 },
    })
    const ws = makeWorkspace({ bav: [] })
    ws.baseline.assumptions.insurance = [inst]
    const input: RuleEngineInput = {
      workspace: ws,
      simulationResult: { products: [] },
      combinedResult: makeCombinedResult(),
    }
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'high_cost_active' && a.context.instanceId === 'versicherung-highcost')).toBe(true)
  })

  it('negative: paid_up bAV with high fees → no high_cost_active (only fires for active)', () => {
    const inst = makeBavInstance({ instanceId: 'bav-paidup', fees: HIGH_FEES, status: 'paid_up' })
    const input = makeCapInput({ bav: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'high_cost_active')).toBe(false)
  })

  it('positive: active basisrente with high fees → emits high_cost_active', () => {
    const inst = makeBasisrenteInstance({ instanceId: 'basisrente-highcost', fees: HIGH_FEES })
    const input = makeCapInput({ basisrente: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'high_cost_active' && a.context.instanceId === 'basisrente-highcost')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// weak_guarantee
// ---------------------------------------------------------------------------

describe('weak_guarantee rule', () => {
  it('positive: insurance with enabled guarantee < 80% → emits weak_guarantee', () => {
    const inst = makeInsuranceInstance({
      instanceId: 'versicherung-weakguarantee',
      status: 'active',
      monthlyContribution: 200,
      capitalGuarantee: { enabled: true, floorPctOfContributions: 0.5 },
      fees: LOW_FEES,
    })
    const ws = makeWorkspace({})
    ws.baseline.assumptions.insurance = [inst]
    ws.baseline.profile.age = 35
    ws.baseline.profile.retirementAge = 67
    const input: RuleEngineInput = {
      workspace: ws,
      simulationResult: { products: [] },
      combinedResult: makeCombinedResult(),
    }
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'weak_guarantee' && a.context.instanceId === 'versicherung-weakguarantee')
    expect(atom).toBeDefined()
    expect(atom!.priority).toBe('medium')
    const runtimeYears = 67 - 35
    const paidEUR = 200 * 12 * runtimeYears
    const garantieEUR = 0.5 * paidEUR
    expect(atom!.context['paidEUR']).toBeCloseTo(paidEUR, 2)
    expect(atom!.context['garantieEUR']).toBeCloseTo(garantieEUR, 2)
  })

  it('negative: insurance with guarantee at 80% → no weak_guarantee', () => {
    const inst = makeInsuranceInstance({
      instanceId: 'versicherung-okguarantee',
      status: 'active',
      monthlyContribution: 200,
      capitalGuarantee: { enabled: true, floorPctOfContributions: 0.80 },
      fees: LOW_FEES,
    })
    const ws = makeWorkspace({})
    ws.baseline.assumptions.insurance = [inst]
    const input: RuleEngineInput = {
      workspace: ws,
      simulationResult: { products: [] },
      combinedResult: makeCombinedResult(),
    }
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'weak_guarantee')).toBe(false)
  })

  it('negative: insurance with guarantee disabled → no weak_guarantee', () => {
    const inst = makeInsuranceInstance({
      instanceId: 'versicherung-noguarantee',
      status: 'active',
      capitalGuarantee: { enabled: false, floorPctOfContributions: 0.5 },
      fees: LOW_FEES,
    })
    const ws = makeWorkspace({})
    ws.baseline.assumptions.insurance = [inst]
    const input: RuleEngineInput = {
      workspace: ws,
      simulationResult: { products: [] },
      combinedResult: makeCombinedResult(),
    }
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'weak_guarantee')).toBe(false)
  })

  it('healthy workspace with no low-guarantee products → no weak_guarantee false positives', () => {
    // Empty insurance + riester lists
    const input = makeCapInput({})
    const atoms = runRules(input).filter((a) => a.id === 'weak_guarantee')
    expect(atoms).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// low_flexibility
// ---------------------------------------------------------------------------

describe('low_flexibility rule', () => {
  it('positive: bAV leibrente → low_flexibility (bav- prefix has haircut 0.05 < 0.10, does NOT fire)', () => {
    // bAV haircut = 5% < 10% → does NOT fire; low_flexibility requires ≥ 10%
    const inst = makeBavInstance({ instanceId: 'bav-lf', payoutMode: 'leibrente' })
    const input = makeCapInput({ bav: [inst] })
    const atoms = runRules(input)
    // bAV haircut is 5% → below threshold → should NOT emit
    expect(atoms.some((a) => a.id === 'low_flexibility' && a.context.instanceId === 'bav-lf')).toBe(false)
  })

  it('positive: insurance leibrente → low_flexibility (versicherung- prefix has haircut 0.10 ≥ 0.10)', () => {
    const inst = makeInsuranceInstance({
      instanceId: 'versicherung-lf',
      status: 'active',
      payoutMode: 'leibrente',
      fees: LOW_FEES,
    })
    const ws = makeWorkspace({})
    ws.baseline.assumptions.insurance = [inst]
    const input: RuleEngineInput = {
      workspace: ws,
      simulationResult: { products: [] },
      combinedResult: makeCombinedResult(),
    }
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'low_flexibility' && a.context.instanceId === 'versicherung-lf')
    expect(atom).toBeDefined()
    expect(atom!.priority).toBe('low')
  })

  it('negative: insurance kapitalverzehr → no low_flexibility (not leibrente)', () => {
    const inst = makeInsuranceInstance({
      instanceId: 'versicherung-kv',
      status: 'active',
      payoutMode: 'kapitalverzehr',
      fees: LOW_FEES,
    })
    const ws = makeWorkspace({})
    ws.baseline.assumptions.insurance = [inst]
    const input: RuleEngineInput = {
      workspace: ws,
      simulationResult: { products: [] },
      combinedResult: makeCombinedResult(),
    }
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'low_flexibility')).toBe(false)
  })

  it('positive: riester leibrente → low_flexibility (riester- prefix has haircut 0.15 ≥ 0.10)', () => {
    const inst = makeVintageRiesterInstance({
      instanceId: 'riester-lf',
      payoutMode: 'leibrente',
    })
    const input = makeWorkspaceInput({ riester: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'low_flexibility' && a.context.instanceId === 'riester-lf')).toBe(true)
  })

  it('negative: riester zeitrente → no low_flexibility', () => {
    const inst = makeVintageRiesterInstance({
      instanceId: 'riester-zt',
      payoutMode: 'zeitrente',
    })
    const input = makeWorkspaceInput({ riester: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'low_flexibility')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// missing_offer_data
// ---------------------------------------------------------------------------

describe('missing_offer_data rule', () => {
  it('positive: bAV instance with model_estimate on a key field → emits missing_offer_data', () => {
    const inst = makeBavInstance({
      instanceId: 'bav-missingdata',
      evidenceMap: { 'fees.wrapperAssetFee': 'model_estimate' },
    })
    const input = makeCapInput({ bav: [inst] })
    const atoms = runRules(input)
    const atom = atoms.find((a) => a.id === 'missing_offer_data' && a.context.instanceId === 'bav-missingdata')
    expect(atom).toBeDefined()
    expect(atom!.priority).toBe('medium')
    expect(Array.isArray(atom!.context['missingFields'])).toBe(true)
    expect((atom!.context['missingFields'] as string[]).length).toBeGreaterThan(0)
  })

  it('negative: bAV instance with all fields user_confirmed → no missing_offer_data', () => {
    // Confirm all PRODUCT_EVIDENCE_FIELDS['bav'] fields
    const allBavFields = [
      'monthlyGrossConversion', 'fees.wrapperAssetFee', 'fees.fundAssetFee',
      'fees.acquisitionCostPct', 'fees.pensionPayoutFeePct', 'contractualMatchPercent',
      'contractualFixedMonthly', 'acquisitionCostPct', 'durchfuehrungsweg',
      'pre2005EligibleTaxFree', 'rentenfaktor', 'payoutMode',
    ]
    const evidenceMap: Record<string, 'user_confirmed'> = {}
    for (const f of allBavFields) evidenceMap[f] = 'user_confirmed'
    const inst = makeBavInstance({ instanceId: 'bav-confirmed', evidenceMap })
    const input = makeCapInput({ bav: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'missing_offer_data' && a.context.instanceId === 'bav-confirmed')).toBe(false)
  })

  it('positive: Riester instance with model_estimate evidence → emits missing_offer_data', () => {
    const inst = makeVintageRiesterInstance({
      instanceId: 'riester-missingdata',
      evidenceMap: { 'monthlyOwnContribution': 'model_estimate' },
    })
    const input = makeWorkspaceInput({ riester: [inst] })
    const atoms = runRules(input)
    expect(atoms.some((a) => a.id === 'missing_offer_data' && a.context.instanceId === 'riester-missingdata')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Joint test: high_cost_active + missing_offer_data on same workspace
// ---------------------------------------------------------------------------

describe('audit-flag joint test', () => {
  it('bAV with high fees + Riester with model_estimate evidence → both atoms with correct instanceIds', () => {
    const bavInst = makeBavInstance({
      instanceId: 'bav-highcost-joint',
      fees: HIGH_FEES,
      evidenceMap: { 'monthlyGrossConversion': 'user_confirmed' }, // no model_estimate
    })

    // Confirm all bAV evidence fields to suppress missing_offer_data for bAV
    const allBavFields = [
      'monthlyGrossConversion', 'fees.wrapperAssetFee', 'fees.fundAssetFee',
      'fees.acquisitionCostPct', 'fees.pensionPayoutFeePct', 'contractualMatchPercent',
      'contractualFixedMonthly', 'acquisitionCostPct', 'durchfuehrungsweg',
      'pre2005EligibleTaxFree', 'rentenfaktor', 'payoutMode',
    ]
    const bavEvidenceMap: Record<string, 'user_confirmed'> = {}
    for (const f of allBavFields) bavEvidenceMap[f] = 'user_confirmed'
    bavInst.evidenceMap = bavEvidenceMap

    const riesterInst = makeVintageRiesterInstance({
      instanceId: 'riester-model-estimate-joint',
      evidenceMap: { 'monthlyOwnContribution': 'model_estimate' },
    })

    const ws = makeWorkspace({ bav: [bavInst] })
    ws.baseline.assumptions.riester = [riesterInst]
    const input: RuleEngineInput = {
      workspace: ws,
      simulationResult: { products: [] },
      combinedResult: makeCombinedResult(),
    }
    const atoms = runRules(input)

    const highCostAtom = atoms.find((a) => a.id === 'high_cost_active' && a.context.instanceId === 'bav-highcost-joint')
    expect(highCostAtom).toBeDefined()

    const missingDataAtom = atoms.find((a) => a.id === 'missing_offer_data' && a.context.instanceId === 'riester-model-estimate-joint')
    expect(missingDataAtom).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// renderAtom snapshot — audit-flag atom ids (B3)
// ---------------------------------------------------------------------------

describe('renderAtom snapshots — audit-flag atoms (B3)', () => {
  const auditAtoms: Atom[] = [
    {
      id: 'high_cost_active',
      priority: 'medium',
      context: { instanceId: 'bav-1', riyDecimal: 0.016 },
    },
    {
      id: 'weak_guarantee',
      priority: 'medium',
      context: { instanceId: 'versicherung-1', garantieEUR: 8000, paidEUR: 20000 },
    },
    {
      id: 'low_flexibility',
      priority: 'low',
      context: { instanceId: 'versicherung-2' },
    },
    {
      id: 'missing_offer_data',
      priority: 'medium',
      context: { instanceId: 'riester-1', missingFields: ['monthlyOwnContribution', 'fees.wrapperAssetFee'] },
    },
  ]

  it('renderAtom output matches snapshot for audit-flag atom ids', () => {
    const snapshot = auditAtoms.map((a) => ({ id: a.id, context: a.context, rendered: renderAtom(a) }))
    expect(snapshot).toMatchSnapshot()
  })
})
